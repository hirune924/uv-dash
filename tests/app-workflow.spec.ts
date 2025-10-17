import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

const TEST_APP_PATH = path.join(__dirname, '../test-fixtures/streamlit-test-app');
const TEST_APP_COMMAND = 'streamlit run app.py';

test.beforeAll(async () => {
  testEnv.setup();
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
});

test.afterAll(async () => {
  await electronApp.close();
  testEnv.cleanupInstallations();
  testEnv.teardown();
});

test.describe.serial('Complete App Workflow', () => {
  test('should take initial screenshot', async () => {
    await page.screenshot({ path: 'test-results/workflow-1-initial.png', fullPage: true });
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('should open install modal', async () => {
    // Click New App button
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await page.waitForTimeout(1000);

    // Take screenshot of modal
    await page.screenshot({ path: 'test-results/workflow-2-modal.png', fullPage: true });

    // Verify modal opened
    const modalContent = await page.textContent('body');
    expect(modalContent).toContain('Install');
  });

  test('should install a local app', async () => {
    // Modal should still be open, Local is already selected by default
    await page.waitForTimeout(500);

    // Fill in the path (look for input with placeholder /path/to/project)
    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(TEST_APP_PATH);
    await page.waitForTimeout(500);

    // Take screenshot before install
    await page.screenshot({ path: 'test-results/workflow-3-filled.png', fullPage: true });

    // Click Install button
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();

    // Wait for installation to complete by checking for "Ready" status for this specific app
    await page.waitForTimeout(2000); // Initial wait for install to start
    // Wait for Ready status by looking for the status label (not just any "Ready" text)
    await page.locator('text=streamlit-test-app').first().waitFor({ timeout: 30000 });
    await page.locator('div:has-text("streamlit-test-app"):has-text("Ready")').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1000); // Extra time for UI to stabilize

    // Take screenshot after install
    await page.screenshot({ path: 'test-results/workflow-4-installed.png', fullPage: true });

    // Verify the new app appears (should see streamlit-test-app somewhere)
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('streamlit-test-app');
  });

  test('should find and click Edit button for streamlit-test-app', async () => {
    console.log('[TEST] Starting Edit button test');
    await page.waitForTimeout(3000);

    // Ensure we're on the Apps page by clicking the Apps tab
    console.log('[TEST] Navigating to Apps page...');
    const appsTab = page.locator('button,a').filter({ hasText: /📦.*Apps|Apps/i }).first();
    await appsTab.click();
    await page.waitForTimeout(1000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/workflow-5-app-list.png', fullPage: true });

    // Check if app is visible in UI
    const bodyText = await page.textContent('body');
    console.log('[TEST] Checking for streamlit-test-app in UI...');
    console.log(`[TEST] Body contains "streamlit-test-app": ${bodyText?.includes('streamlit-test-app')}`);
    console.log(`[TEST] Body contains "Ready": ${bodyText?.includes('Ready')}`);

    // Find the app card for streamlit-test-app and then find its Edit button
    console.log('[TEST] Looking for Edit button...');
    const appCard = page.locator('div').filter({ hasText: /streamlit-test-app/i }).first();
    const editButton = appCard.locator('button[title="Edit"]');
    const isVisible = await editButton.isVisible().catch(() => false);
    console.log(`[TEST] Edit button visible: ${isVisible}`);

    await expect(editButton).toBeVisible({ timeout: 10000 });
    console.log('[TEST] Edit button found, clicking...');
    await editButton.click();
    await page.waitForTimeout(1000);

    // Verify edit modal opened
    await page.screenshot({ path: 'test-results/workflow-6-edit-modal.png', fullPage: true });
    const modalText = await page.textContent('body');
    expect(modalText).toContain('Edit App');
    console.log('[TEST] Edit modal opened successfully');
  });

  test('should set run command in edit modal', async () => {
    // Modal should still be open
    await page.waitForTimeout(500);

    // Find the run command input
    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.clear();
    await runCommandInput.fill(TEST_APP_COMMAND);
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({ path: 'test-results/workflow-7-command-set.png', fullPage: true });

    // Click Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await page.waitForTimeout(1000);

    // Modal should close
    await page.screenshot({ path: 'test-results/workflow-8-after-save.png', fullPage: true });
  });

  test('should run the streamlit-test-app app', async () => {
    await page.waitForTimeout(500);

    // Find the app card
    const appCard = page.locator('div').filter({ hasText: /streamlit-test-app/i }).first();

    // Click Run button (buttons are always visible)
    const runButton = appCard.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/workflow-9-running.png', fullPage: true });

    // Verify Stop button appears (allow more time for first app launch)
    const stopButton = appCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 20000 });
  });

  test('should detect port and show Open button', async () => {
    // Wait for port detection
    await page.waitForTimeout(10000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/workflow-10-port-detected.png', fullPage: true });

    // Look for Open button (🌐)
    const appCard = page.locator('div').filter({ hasText: /streamlit-test-app/i }).first();
    const openButton = appCard.locator('button').filter({ hasText: /🌐|open/i });

    // Port detection might take time, so use longer timeout
    await expect(openButton.first()).toBeVisible({ timeout: 20000 });
  });

  test('should stop the app', async () => {
    await page.waitForTimeout(1000);

    // Find card
    const appCard = page.locator('div').filter({ hasText: /streamlit-test-app/i }).first();

    // Click Stop button (buttons are always visible)
    const stopButton = appCard.locator('button:has-text("Stop")');
    await stopButton.click();
    await page.waitForTimeout(2000); // Wait for stop command to be processed

    // Wait for app to transition from Running to Ready status
    await page.locator('div').filter({ hasText: /streamlit-test-app/i }).locator('text=Ready').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/workflow-11-stopped.png', fullPage: true });

    // Verify Run button appears
    const runButton = appCard.locator('button:has-text("Run")');
    await expect(runButton).toBeVisible({ timeout: 5000 });
  });
});
