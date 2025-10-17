import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

// Use test fixtures in the repository
const FLASK_APP_PATH = path.join(__dirname, '../test-fixtures/flask-test-app');
const STREAMLIT_APP_PATH = path.join(__dirname, '../test-fixtures/streamlit-test-app');
const FLASK_RUN_COMMAND = 'python app.py';
const STREAMLIT_RUN_COMMAND = 'streamlit run app.py';

test.describe.serial('Fixtures-based Complete Workflow', () => {
  test.beforeAll(async () => {
    console.log('[BEFORE ALL] Starting test suite setup');
    testEnv.setup();
    console.log('[BEFORE ALL] TestEnv setup complete, launching Electron');
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
    console.log('[BEFORE ALL] Electron launched and ready');
  });

  test.afterAll(async () => {
    console.log('[AFTER ALL] Starting test suite cleanup');
    if (electronApp) {
      await electronApp.close();
      console.log('[AFTER ALL] Electron closed');
    }
    testEnv.cleanupInstallations();
    testEnv.teardown();
    console.log('[AFTER ALL] Cleanup complete');
  });

  test('should install Flask test app', async () => {
    await page.screenshot({ path: 'test-results/fixtures-1-initial.png', fullPage: true });

    // Click New App button
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await page.waitForTimeout(1000);

    // Fill in Flask app path
    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(FLASK_APP_PATH);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/fixtures-2-flask-form.png', fullPage: true });

    // Click Install
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();

    // Wait for installation to complete by checking for "Ready" status
    await page.waitForTimeout(2000); // Initial wait for install to start
    await page.locator('text=Ready').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1000); // Extra time for UI to stabilize

    await page.screenshot({ path: 'test-results/fixtures-3-flask-installed.png', fullPage: true });

    // Verify app appears
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
  });

  test('should set environment variables on Flask app', async () => {
    await page.waitForTimeout(2000);

    // In test mode, buttons are always visible - no need to hover
    // Find and click the Edit button
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/fixtures-4-flask-edit.png', fullPage: true });

    // Set run command
    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.clear();
    await runCommandInput.fill(FLASK_RUN_COMMAND);
    await page.waitForTimeout(500);

    // Add TEST_ENV variable
    const addVarButton = page.locator('button:has-text("Add Variable")');
    await addVarButton.click();
    await page.waitForTimeout(500);

    // Fill in the first variable (TEST_ENV as plain text)
    const varNameInputs = page.locator('input[placeholder="VARIABLE_NAME"]');
    await varNameInputs.first().fill('TEST_ENV');
    await page.waitForTimeout(300);

    // Source is already "Plain Text" by default
    const valueInputs = page.locator('input[placeholder*="Value (plain text)"]');
    await valueInputs.first().fill('test_value_123');
    await page.waitForTimeout(500);

    // Add API_KEY secret
    await addVarButton.click();
    await page.waitForTimeout(500);

    // Fill in the second variable (API_KEY as encrypted secret)
    await varNameInputs.last().fill('API_KEY');
    await page.waitForTimeout(300);

    // Change source to "🔒 Encrypted Secret"
    const sourceSelects = page.locator('select').filter({ hasText: 'Plain Text' });
    await sourceSelects.last().selectOption('secret');
    await page.waitForTimeout(300);

    const secretInput = page.locator('input[type="password"]').last();
    await secretInput.fill('secret_api_key_456');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/fixtures-5-flask-env-set.png', fullPage: true });

    // Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await page.waitForTimeout(1000);
  });

  test('should run Flask app and verify port detection', async () => {
    await page.waitForTimeout(500);

    // Click Run button (buttons are always visible)
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'test-results/fixtures-6-flask-running.png', fullPage: true });

    // Verify Stop button appears
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 10000 });
  });

  test('should detect Flask port and show Open button', async () => {
    await page.waitForTimeout(8000);

    await page.screenshot({ path: 'test-results/fixtures-7-flask-port.png', fullPage: true });

    // Look for port info or Open button
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    const openButton = flaskCard.locator('button').filter({ hasText: /🌐|open/i });

    await expect(openButton.first()).toBeVisible({ timeout: 30000 });
  });

  test('should stop Flask app', async () => {
    await page.waitForTimeout(1000);

    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();

    // Click Stop button (buttons are always visible)
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await stopButton.click();
    await page.waitForTimeout(2000); // Wait for stop command to be processed

    // Wait for app to transition from Running to Ready status
    await page.locator('div').filter({ hasText: /flask-test-app/i }).locator('text=Ready').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/fixtures-8-flask-stopped.png', fullPage: true });

    // Verify Run button appears
    const runButton = flaskCard.locator('button:has-text("Run")');
    await expect(runButton).toBeVisible({ timeout: 5000 });
  });

  test('should install Streamlit test app', async () => {
    await page.waitForTimeout(500);

    // Click New App
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await page.waitForTimeout(1000);

    // Fill in Streamlit app path
    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(STREAMLIT_APP_PATH);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/fixtures-9-streamlit-form.png', fullPage: true });

    // Install
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();
    await page.waitForTimeout(15000);

    await page.screenshot({ path: 'test-results/fixtures-10-streamlit-installed.png', fullPage: true });

    // Verify
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('streamlit-test-app');
  });

  test('should verify both apps are installed', async () => {
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/fixtures-11-both-apps.png', fullPage: true });

    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
    expect(bodyText).toContain('streamlit-test-app');

    // Count apps - should show "2 installed" or similar
    expect(bodyText).toMatch(/2\s+installed/i);
  });
});
