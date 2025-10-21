import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

// Use test fixtures ZIP file
const FLASK_ZIP_PATH = path.join(__dirname, '../test-fixtures/flask-test-app.zip');
const FLASK_RUN_COMMAND = 'python app.py';

test.describe.serial('ZIP Integration Test', () => {
  test.beforeAll(async () => {
    console.log('[BEFORE ALL] Starting ZIP test suite setup');
    testEnv.setup();
    console.log('[BEFORE ALL] TestEnv setup complete, launching Electron');
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });

    // Capture Electron console output
    electronApp.on('console', (msg) => {
      console.log(`[Electron] ${msg.text()}`);
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

  test('should install Flask app from ZIP file', async () => {
    await page.screenshot({ path: 'test-results/zip-1-initial.png', fullPage: true });

    // Click New App button
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await expect(page.locator('button:has-text("zip")')).toBeVisible({ timeout: 5000 });

    // Select ZIP source type
    const zipButton = page.locator('button:has-text("zip")');
    await zipButton.click();
    await expect(page.locator('input[placeholder="https://example.com/app.zip"]')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/zip-2-modal-zip-selected.png', fullPage: true });

    // Fill in ZIP file path directly (cross-platform)
    const urlInput = page.locator('input[placeholder="https://example.com/app.zip"]');
    await urlInput.fill(FLASK_ZIP_PATH);

    // Set subdirectory (ZIP contains flask-test-app/ folder)
    const subdirInput = page.locator('input[placeholder="packages/app"]');
    await subdirInput.fill('flask-test-app');

    await page.screenshot({ path: 'test-results/zip-3-form-filled.png', fullPage: true });

    // Click Install
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();

    // Wait for installation to complete by checking for "Ready" status
    await page.locator('text=Ready').first().waitFor({ timeout: 120000 });

    await page.screenshot({ path: 'test-results/zip-4-installed.png', fullPage: true });

    // Verify app appears
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
  });

  test('should set run command on ZIP-installed Flask app', async () => {
    // Find and click the Edit button
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await expect(page.locator('input[placeholder*="python"], input[placeholder*="command"]').first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/zip-5-edit-modal.png', fullPage: true });

    // Set run command
    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.clear();
    await runCommandInput.fill(FLASK_RUN_COMMAND);

    await page.screenshot({ path: 'test-results/zip-6-command-set.png', fullPage: true });

    // Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await expect(page.locator('text=Edit App')).not.toBeVisible({ timeout: 5000 });
  });

  test('should run ZIP-installed Flask app', async () => {
    // Click Run button
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();

    await page.screenshot({ path: 'test-results/zip-7-running.png', fullPage: true });

    // Verify Stop button appears (allow more time for first app launch with uv sync)
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 20000 });
  });

  test('should detect Flask port from ZIP-installed app', async () => {
    // Wait for port detection by checking for Open button
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    await expect(flaskCard.locator('button').filter({ hasText: /🌐|open/i }).first()).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/zip-8-port-detected.png', fullPage: true });
  });

  test('should stop ZIP-installed Flask app', async () => {
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();

    // Click Stop button
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await stopButton.click();

    // Wait for app to transition to Ready status
    await page.locator('div').filter({ hasText: /flask-test-app/i }).locator('text=Ready').first().waitFor({ timeout: 120000 });

    await page.screenshot({ path: 'test-results/zip-9-stopped.png', fullPage: true });

    // Verify Run button appears (increased timeout for Windows)
    const runButton = flaskCard.locator('button:has-text("Run")');
    await expect(runButton).toBeVisible({ timeout: 10000 });
  });
});
