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

  test('should install Flask app from ZIP file', async () => {
    await page.screenshot({ path: 'test-results/zip-1-initial.png', fullPage: true });

    // Click New App button
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await page.waitForTimeout(1000);

    // Select ZIP source type
    const zipButton = page.locator('button:has-text("zip")');
    await zipButton.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/zip-2-modal-zip-selected.png', fullPage: true });

    // Fill in ZIP file path directly (cross-platform)
    const urlInput = page.locator('input[placeholder="https://example.com/app.zip"]');
    await urlInput.fill(FLASK_ZIP_PATH);
    await page.waitForTimeout(500);

    // Set subdirectory (ZIP contains flask-test-app/ folder)
    const subdirInput = page.locator('input[placeholder="packages/app"]');
    await subdirInput.fill('flask-test-app');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/zip-3-form-filled.png', fullPage: true });

    // Click Install
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();

    // Wait for installation to complete by checking for "Ready" status
    await page.waitForTimeout(2000); // Initial wait for install to start
    await page.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000); // Extra time for UI to stabilize

    await page.screenshot({ path: 'test-results/zip-4-installed.png', fullPage: true });

    // Verify app appears
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
  });

  test('should set run command on ZIP-installed Flask app', async () => {
    await page.waitForTimeout(2000);

    // Find and click the Edit button
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/zip-5-edit-modal.png', fullPage: true });

    // Set run command
    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.clear();
    await runCommandInput.fill(FLASK_RUN_COMMAND);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/zip-6-command-set.png', fullPage: true });

    // Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await page.waitForTimeout(1000);
  });

  test('should run ZIP-installed Flask app', async () => {
    await page.waitForTimeout(1000);

    // Click Run button
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'test-results/zip-7-running.png', fullPage: true });

    // Verify Stop button appears (allow more time for first app launch with uv sync)
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 20000 });
  });

  test('should detect Flask port from ZIP-installed app', async () => {
    await page.waitForTimeout(10000);

    await page.screenshot({ path: 'test-results/zip-8-port-detected.png', fullPage: true });

    // Look for Open button
    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();
    const openButton = flaskCard.locator('button').filter({ hasText: /🌐|open/i });

    await expect(openButton.first()).toBeVisible({ timeout: 20000 });
  });

  test('should stop ZIP-installed Flask app', async () => {
    await page.waitForTimeout(1000);

    const flaskCard = page.locator('div').filter({ hasText: /flask-test-app/i }).first();

    // Click Stop button
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await stopButton.click();
    await page.waitForTimeout(2000);

    // Wait for app to transition to Ready status
    await page.locator('div').filter({ hasText: /flask-test-app/i }).locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/zip-9-stopped.png', fullPage: true });

    // Verify Run button appears
    const runButton = flaskCard.locator('button:has-text("Run")');
    await expect(runButton).toBeVisible({ timeout: 5000 });
  });
});
