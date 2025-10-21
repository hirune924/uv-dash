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
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button').filter({ hasText: /new app/i })).toBeVisible({ timeout: 10000 });
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
    await expect(page.locator('input[placeholder="/path/to/project"]')).toBeVisible({ timeout: 5000 });

    // Fill in Flask app path
    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(FLASK_APP_PATH);

    await page.screenshot({ path: 'test-results/fixtures-2-flask-form.png', fullPage: true });

    // Click Install
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();

    // Wait for installation to complete by checking for "Ready" status
    await page.locator('text=Ready').first().waitFor({ timeout: 120000 });

    await page.screenshot({ path: 'test-results/fixtures-3-flask-installed.png', fullPage: true });

    // Verify app appears
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
  });

  test('should set environment variables on Flask app', async () => {
    // In test mode, buttons are always visible - no need to hover
    // Find and click the Edit button
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await expect(page.locator('input[placeholder*="python"], input[placeholder*="command"]').first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/fixtures-4-flask-edit.png', fullPage: true });

    // Set run command
    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.clear();
    await runCommandInput.fill(FLASK_RUN_COMMAND);

    // Add TEST_ENV variable
    const addVarButton = page.locator('button:has-text("Add Variable")');
    await addVarButton.click();

    // Fill in the first variable (TEST_ENV as plain text)
    const varNameInputs = page.locator('input[placeholder="VARIABLE_NAME"]');
    await varNameInputs.first().fill('TEST_ENV');

    // Source is already "Plain Text" by default
    const valueInputs = page.locator('input[placeholder*="Value (plain text)"]');
    await valueInputs.first().fill('test_value_123');

    // Add API_KEY secret
    await addVarButton.click();

    // Fill in the second variable (API_KEY as encrypted secret)
    await varNameInputs.last().fill('API_KEY');

    // Change source to "🔒 Encrypted Secret"
    const sourceSelects = page.locator('select').filter({ hasText: 'Plain Text' });
    await sourceSelects.last().selectOption('secret');

    const secretInput = page.locator('input[type="password"]').last();
    await secretInput.fill('secret_api_key_456');

    await page.screenshot({ path: 'test-results/fixtures-5-flask-env-set.png', fullPage: true });

    // Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await expect(page.locator('text=Edit App')).not.toBeVisible({ timeout: 5000 });
  });

  test('should run Flask app and verify port detection', async () => {
    // Click Run button (buttons are always visible)
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();

    await page.screenshot({ path: 'test-results/fixtures-6-flask-running.png', fullPage: true });

    // Verify Stop button appears
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 10000 });
  });

  test('should detect Flask port and show Open button', async () => {
    // Wait for port detection by checking for Open button
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    await expect(flaskCard.locator('button').filter({ hasText: /🌐|open/i }).first()).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/fixtures-7-flask-port.png', fullPage: true });
  });

  test('should stop Flask app', async () => {
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();

    // Click Stop button (buttons are always visible)
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await stopButton.click();

    // Wait for app to transition from Running to Ready status
    await page.locator('div').filter({ hasText: /flask-test-app/i }).locator('text=Ready').first().waitFor({ timeout: 120000 });

    await page.screenshot({ path: 'test-results/fixtures-8-flask-stopped.png', fullPage: true });

    // Verify Run button appears (increased timeout for Windows)
    const runButton = flaskCard.locator('button:has-text("Run")');
    await expect(runButton).toBeVisible({ timeout: 10000 });
  });

  test('should install Streamlit test app', async () => {
    // Click New App
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await expect(page.locator('input[placeholder="/path/to/project"]')).toBeVisible({ timeout: 5000 });

    // Fill in Streamlit app path
    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(STREAMLIT_APP_PATH);

    await page.screenshot({ path: 'test-results/fixtures-9-streamlit-form.png', fullPage: true });

    // Install
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();
    // Wait for streamlit-test-app to appear with Ready status
    await page.locator('h3:has-text("streamlit-test-app")').waitFor({ timeout: 30000 });
    // Then wait for its Ready status
    await page.locator('h3:has-text("streamlit-test-app")').locator('..').locator('..').locator('text=Ready').waitFor({ timeout: 120000 });

    await page.screenshot({ path: 'test-results/fixtures-10-streamlit-installed.png', fullPage: true });

    // Verify
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('streamlit-test-app');
  });

  test('should verify both apps are installed', async () => {
    await page.screenshot({ path: 'test-results/fixtures-11-both-apps.png', fullPage: true });

    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
    expect(bodyText).toContain('streamlit-test-app');

    // Count apps - should show "2 installed" or similar
    expect(bodyText).toMatch(/2\s+installed/i);
  });
});
