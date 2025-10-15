import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

const FLASK_APP_PATH = path.join(__dirname, '../test-fixtures/flask-test-app');
const STREAMLIT_APP_PATH = path.join(__dirname, '../test-fixtures/streamlit-test-app');
const FLASK_RUN_COMMAND = 'python app.py';
const STREAMLIT_RUN_COMMAND = 'streamlit run app.py';

test.describe.serial('Multi-App Concurrent Execution', () => {
  test.beforeAll(async () => {
    testEnv.setup();
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    testEnv.cleanupInstallations();
    testEnv.teardown();
  });

  test('should install Flask app', async () => {
    await page.screenshot({ path: 'test-results/multi-1-initial.png', fullPage: true });

    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await page.waitForTimeout(1000);

    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(FLASK_APP_PATH);
    await page.waitForTimeout(500);

    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();
    await page.waitForTimeout(2000);
    await page.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    // Set run command
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.click();
    await page.waitForTimeout(1000);

    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.click();
    await runCommandInput.clear();
    await runCommandInput.type(FLASK_RUN_COMMAND, { delay: 50 });
    await page.waitForTimeout(500);

    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await page.waitForTimeout(1000);

    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
  });

  test('should install Streamlit app', async () => {
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await page.waitForTimeout(1000);

    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(STREAMLIT_APP_PATH);
    await page.waitForTimeout(500);

    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();
    await page.waitForTimeout(2000);
    await page.locator('text=Ready').nth(1).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    // Set run command
    const editButtons = page.locator('button[title="Edit"]');
    await editButtons.nth(1).click();
    await page.waitForTimeout(1000);

    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.click();
    await runCommandInput.clear();
    await runCommandInput.type(STREAMLIT_RUN_COMMAND, { delay: 50 });
    await page.waitForTimeout(500);

    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/multi-2-both-installed.png', fullPage: true });

    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
    expect(bodyText).toContain('streamlit-test-app');
  });

  test('should run both apps concurrently', async () => {
    await page.waitForTimeout(1000);

    // Run Flask app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const flaskRunButton = flaskCard.locator('button:has-text("Run")');
    await flaskRunButton.click();
    await page.waitForTimeout(3000);

    // Run Streamlit app
    const streamlitCard = page.locator('h3:has-text("streamlit-test-app")').locator('..').locator('..').locator('..');
    const streamlitRunButton = streamlitCard.locator('button:has-text("Run")');
    await streamlitRunButton.click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'test-results/multi-3-both-running.png', fullPage: true });

    // Verify both show Stop buttons (meaning both are running) - allow more time for concurrent startup
    const flaskStopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(flaskStopButton).toBeVisible({ timeout: 20000 });

    const streamlitStopButton = streamlitCard.locator('button:has-text("Stop")');
    await expect(streamlitStopButton).toBeVisible({ timeout: 20000 });

    // Verify both are marked as "Running"
    const bodyText = await page.textContent('body');
    const runningCount = (bodyText.match(/Running/g) || []).length;
    expect(runningCount).toBeGreaterThanOrEqual(2);
  });

  test('should detect different ports for each app', async () => {
    // Wait for port detection
    await page.waitForTimeout(15000);

    await page.screenshot({ path: 'test-results/multi-4-ports-detected.png', fullPage: true });

    // Both should have Open buttons
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const flaskOpenButton = flaskCard.locator('button').filter({ hasText: /🌐|open/i });
    await expect(flaskOpenButton.first()).toBeVisible({ timeout: 20000 });

    const streamlitCard = page.locator('h3:has-text("streamlit-test-app")').locator('..').locator('..').locator('..');
    const streamlitOpenButton = streamlitCard.locator('button').filter({ hasText: /🌐|open/i });
    await expect(streamlitOpenButton.first()).toBeVisible({ timeout: 20000 });

    // Verify they have different ports
    const bodyText = await page.textContent('body');
    const portMatches = bodyText.match(/localhost:(\d+)/g);
    expect(portMatches).toBeTruthy();
    expect(portMatches!.length).toBeGreaterThanOrEqual(2);

    // Extract port numbers and verify they're different
    const ports = portMatches!.map(match => match.split(':')[1]);
    const uniquePorts = new Set(ports);
    expect(uniquePorts.size).toBeGreaterThanOrEqual(2);
  });

  test('should stop Flask app independently', async () => {
    await page.waitForTimeout(1000);

    // Stop only Flask
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const flaskStopButton = flaskCard.locator('button:has-text("Stop")');
    await flaskStopButton.click();
    await page.waitForTimeout(2000);

    // Wait for Flask to transition to Ready
    await flaskCard.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/multi-5-flask-stopped.png', fullPage: true });

    // Verify Flask shows Run button
    const flaskRunButton = flaskCard.locator('button:has-text("Run")');
    await expect(flaskRunButton).toBeVisible({ timeout: 5000 });

    // Verify Streamlit is still running
    const streamlitCard = page.locator('h3:has-text("streamlit-test-app")').locator('..').locator('..').locator('..');
    const streamlitStopButton = streamlitCard.locator('button:has-text("Stop")');
    await expect(streamlitStopButton).toBeVisible({ timeout: 5000 });
  });

  test('should stop Streamlit app independently', async () => {
    await page.waitForTimeout(1000);

    // Stop Streamlit
    const streamlitCard = page.locator('h3:has-text("streamlit-test-app")').locator('..').locator('..').locator('..');
    const streamlitStopButton = streamlitCard.locator('button:has-text("Stop")');
    await streamlitStopButton.click();
    await page.waitForTimeout(2000);

    // Wait for Streamlit to transition to Ready
    await streamlitCard.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/multi-6-both-stopped.png', fullPage: true });

    // Verify both show Run buttons
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const flaskRunButton = flaskCard.locator('button:has-text("Run")');
    await expect(flaskRunButton).toBeVisible({ timeout: 5000 });

    const streamlitRunButton = streamlitCard.locator('button:has-text("Run")');
    await expect(streamlitRunButton).toBeVisible({ timeout: 5000 });

    // Verify no "Running" status
    const bodyText = await page.textContent('body');
    const runningCount = (bodyText.match(/Running/g) || []).length;
    expect(runningCount).toBe(0);
  });

  test('should run and stop apps multiple times', async () => {
    // Run both again
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const flaskRunButton = flaskCard.locator('button:has-text("Run")');
    await flaskRunButton.click();
    await page.waitForTimeout(2000);

    const streamlitCard = page.locator('h3:has-text("streamlit-test-app")').locator('..').locator('..').locator('..');
    const streamlitRunButton = streamlitCard.locator('button:has-text("Run")');
    await streamlitRunButton.click();
    await page.waitForTimeout(3000);

    // Verify both running
    const flaskStopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(flaskStopButton).toBeVisible({ timeout: 10000 });

    const streamlitStopButton = streamlitCard.locator('button:has-text("Stop")');
    await expect(streamlitStopButton).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'test-results/multi-7-running-again.png', fullPage: true });

    // Stop both
    await flaskStopButton.click();
    await page.waitForTimeout(1000);
    await streamlitStopButton.click();
    await page.waitForTimeout(2000);

    await flaskCard.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await streamlitCard.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/multi-8-final.png', fullPage: true });

    // Verify both are ready
    const bodyText = await page.textContent('body');
    const readyCount = (bodyText.match(/Ready/g) || []).length;
    expect(readyCount).toBeGreaterThanOrEqual(2);
  });
});
