import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();
let skipCleanupOnce = false; // Flag to prevent cleanup during Electron restart test

const FLASK_APP_PATH = path.join(__dirname, '../test-fixtures/flask-test-app');
const FLASK_RUN_COMMAND = 'python app.py';

/**
 * Safely close Electron with timeout and force kill if needed
 * Minimal version to handle CI environment issues
 */
async function closeElectronSafely(app: ElectronApplication) {
  const pid = app.process().pid;
  console.log(`[TEST] Closing Electron (PID: ${pid})`);

  // Try normal close with 10s timeout
  const closeResult = await Promise.race([
    app.close().then(() => 'ok').catch((e) => {
      console.log(`[TEST] close() error: ${e.message}`);
      return 'error';
    }),
    new Promise(r => setTimeout(r, 10000)).then(() => 'timeout')
  ]);

  console.log(`[TEST] close() result: ${closeResult}`);

  // If close failed or timed out, force kill the process
  if (closeResult !== 'ok') {
    console.log(`[TEST] Force killing PID ${pid}`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch (e) {
      console.log(`[TEST] Kill failed:`, e);
    }
  }

  // Wait for process to fully terminate
  await new Promise(r => setTimeout(r, 2000));
  console.log('[TEST] Electron close complete');
}

test.describe.serial('Port Persistence and Lifecycle', () => {
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
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button').filter({ hasText: /new app/i })).toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    // Skip cleanup if we're in the middle of Electron restart test
    if (!skipCleanupOnce) {
      testEnv.cleanupInstallations();
      testEnv.teardown();
    } else {
      console.log('[TEST] Skipping cleanup (Electron restart in progress)');
      skipCleanupOnce = false; // Reset flag
    }
  });

  test('should install and configure Flask app', async () => {
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await expect(page.locator('input[placeholder="/path/to/project"]')).toBeVisible({ timeout: 5000 });

    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(FLASK_APP_PATH);

    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();
    await page.locator('text=Ready').first().waitFor({ timeout: 120000 });

    // Set run command
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.click();
    await expect(page.locator('input[placeholder*="python"], input[placeholder*="command"]').first()).toBeVisible({ timeout: 5000 });

    const runCommandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await runCommandInput.click();
    await runCommandInput.clear();
    await runCommandInput.fill(FLASK_RUN_COMMAND);

    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await expect(page.locator('text=Edit App')).not.toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/port-1-installed.png', fullPage: true });
  });

  test('should not have port before running', async () => {

    // Verify no port is shown
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toMatch(/localhost:\d+/);
    expect(bodyText).not.toContain('Open');

    // Check apps.json - port should be undefined
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    const content = fs.readFileSync(appsJsonPath, 'utf-8');
    const appsData = JSON.parse(content);
    const appId = Object.keys(appsData)[0];
    const app = appsData[appId];

    expect(app.port).toBeUndefined();
  });

  test('should detect and persist port when running', async () => {
    // Run the app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();

    // Wait for Stop button to appear (indicates app is running)
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 20000 });

    // Wait for port detection by checking for Open button or localhost text
    await expect(page.locator('text=/localhost:\\d+/')).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/port-2-running-with-port.png', fullPage: true });

    // Verify port is shown in UI
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/localhost:\d+/);

    // Extract detected port
    const portMatch = bodyText.match(/localhost:(\d+)/);
    expect(portMatch).toBeTruthy();
    const detectedPort = parseInt(portMatch![1], 10);
    expect(detectedPort).toBeGreaterThan(1);
    expect(detectedPort).toBeLessThan(65536);

    // Check apps.json - port should be persisted
    // Poll apps.json until status is persisted (UI updates faster than file write)
    // Increased to 60 attempts × 1000ms = 60s to handle slow CI environments
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    let app: any;
    let appId: string;

    for (let i = 0; i < 60; i++) {
      const content = fs.readFileSync(appsJsonPath, 'utf-8');
      const appsData = JSON.parse(content);
      appId = Object.keys(appsData)[0];
      app = appsData[appId];

      if (app && app.port === detectedPort) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(app.port).toBe(detectedPort);
  });

  test('should clear port when app stops', async () => {
    // Stop the app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await stopButton.click();

    await flaskCard.locator('text=Ready').first().waitFor({ timeout: 120000 });

    await page.screenshot({ path: 'test-results/port-3-stopped-no-port.png', fullPage: true });

    // Verify port is removed from UI
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toMatch(/localhost:\d+/);
    expect(bodyText).not.toContain('🌐');

    // Check apps.json - port should be cleared
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    const content = fs.readFileSync(appsJsonPath, 'utf-8');
    const appsData = JSON.parse(content);
    const appId = Object.keys(appsData)[0];
    const app = appsData[appId];

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(app.port).toBeUndefined();
  });

  test('should detect new port on restart', async () => {
    // Run again
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();

    // Wait for port detection by checking for localhost text
    await expect(page.locator('text=/localhost:\\d+/')).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/port-4-restarted-new-port.png', fullPage: true });

    // Verify port is shown again
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/localhost:\d+/);

    // Extract new port
    const portMatch = bodyText.match(/localhost:(\d+)/);
    expect(portMatch).toBeTruthy();
    const newPort = parseInt(portMatch![1], 10);
    expect(newPort).toBeGreaterThan(1);
    expect(newPort).toBeLessThan(65536);

    // Check apps.json - new port should be persisted
    // Poll for up to 60 seconds to handle slow CI environments
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    let app: any;
    let appId: string;

    for (let i = 0; i < 60; i++) {
      const content = fs.readFileSync(appsJsonPath, 'utf-8');
      const appsData = JSON.parse(content);
      appId = Object.keys(appsData)[0];
      app = appsData[appId];

      if (app && app.port === newPort) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(app.port).toBe(newPort);
  });

  test('should maintain port info across app restarts', async () => {

    // Get current port from UI
    let bodyText = await page.textContent('body');
    const currentPortMatch = bodyText.match(/localhost:(\d+)/);
    const currentPort = parseInt(currentPortMatch![1], 10);

    // Read current app state
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    let content = fs.readFileSync(appsJsonPath, 'utf-8');
    let appsData = JSON.parse(content);
    const appId = Object.keys(appsData)[0];

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(appsData[appId].port).toBe(currentPort);

    // Stop and verify port is cleared
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await stopButton.click();

    await flaskCard.locator('text=Ready').first().waitFor({ timeout: 120000 });

    // Read state after stop
    content = fs.readFileSync(appsJsonPath, 'utf-8');
    appsData = JSON.parse(content);

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(appsData[appId].port).toBeUndefined();

    await page.screenshot({ path: 'test-results/port-5-final-state.png', fullPage: true });
  });

  test('should recover running app after Electron restart', async () => {
    test.setTimeout(120000); // 2 minutes
    console.log('[TEST] Starting Electron restart test with process survival');

    // Run the app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();

    // Wait for port detection
    await expect(page.locator('text=/localhost:\\d+/')).toBeVisible({ timeout: 30000 });

    // Get port and PID from UI
    let bodyText = await page.textContent('body');
    const portMatch = bodyText.match(/localhost:(\d+)/);
    const detectedPort = parseInt(portMatch![1], 10);
    console.log(`[TEST] Detected port: ${detectedPort}`);

    // Poll apps.json until port/pid is persisted (UI updates faster than file write)
    // Increased to 60 seconds to handle slow CI environments where port detection can take 30+ seconds
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    let app: any;
    let appId: string;
    let content: string;
    let appsData: any;

    for (let i = 0; i < 60; i++) {
      content = fs.readFileSync(appsJsonPath, 'utf-8');
      appsData = JSON.parse(content);
      appId = Object.keys(appsData)[0];
      app = appsData[appId];

      if (app && app.port === detectedPort && app.pid) {
        console.log(`[TEST] Port and PID persisted to apps.json after ${i} seconds`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    expect(app.port).toBe(detectedPort);
    expect(app.pid).toBeDefined();
    const pidBeforeRestart = app.pid;
    console.log(`[TEST] PID before restart: ${pidBeforeRestart}`);

    await page.screenshot({ path: 'test-results/port-6-before-restart.png', fullPage: true });

    // Close and reopen Electron (app process should continue running)
    // Set flag to prevent TestEnv cleanup during restart
    skipCleanupOnce = true;
    await closeElectronSafely(electronApp);

    console.log('[TEST] Waiting 3 seconds before relaunch...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Relaunch
    console.log('[TEST] Relaunching Electron...');
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });

    // Capture console output for relaunched instance
    electronApp.on('console', (msg) => {
      console.log(`[Electron Restarted] ${msg.text()}`);
    });

    console.log('[TEST] Waiting for first window...');
    page = await electronApp.firstWindow();
    console.log('[TEST] First window obtained, waiting for stabilization...');
    await page.waitForLoadState('domcontentloaded');

    // Wait for app card to be visible
    await expect(page.locator('h3:has-text("flask-test-app")')).toBeVisible({ timeout: 10000 });

    // Wait for process recovery check to complete and Running status to appear
    // The recovery process runs asynchronously in the main process
    const recoveredCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const recoveredStopButton = recoveredCard.locator('button:has-text("Stop")');
    await expect(recoveredStopButton).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/port-7-after-restart.png', fullPage: true });

    // NEW BEHAVIOR: App should be recovered as 'Running'
    // Process survived the restart, so port/pid are preserved
    bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
    expect(bodyText).toContain('Running'); // Should be recovered as Running

    // UI SHOULD show port (app was recovered)
    expect(bodyText).toMatch(/localhost:\d+/);
    const recoveredPortMatch = bodyText.match(/localhost:(\d+)/);
    expect(recoveredPortMatch).toBeTruthy();
    const recoveredPort = parseInt(recoveredPortMatch![1], 10);
    expect(recoveredPort).toBe(detectedPort); // Same port

    // Verify in apps.json - port/pid should be preserved
    content = fs.readFileSync(appsJsonPath, 'utf-8');
    appsData = JSON.parse(content);
    const recoveredApp = appsData[appId];

    // Port and PID are preserved through restart
    expect(recoveredApp.port).toBe(detectedPort);
    expect(recoveredApp.pid).toBe(pidBeforeRestart);
    console.log(`[TEST] Successfully recovered app with port ${recoveredApp.port} and PID ${recoveredApp.pid}`);

    // Clean up: Stop the recovered app before test ends
    console.log('[TEST] Stopping recovered app...');
    const recoveredFlaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const stopBtn = recoveredFlaskCard.locator('button:has-text("Stop")');
    await stopBtn.click();
    await recoveredFlaskCard.locator('text=Ready').first().waitFor({ timeout: 120000 });
    console.log('[TEST] App stopped');

    // Cleanup after Electron restart test
    testEnv.cleanupInstallations();
    testEnv.teardown();
  });
});
