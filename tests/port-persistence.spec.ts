import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

const FLASK_APP_PATH = path.join(__dirname, '../test-fixtures/flask-test-app');
const FLASK_RUN_COMMAND = 'python app.py';

test.describe.serial('Port Persistence and Lifecycle', () => {
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

  test('should install and configure Flask app', async () => {
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

    await page.screenshot({ path: 'test-results/port-1-installed.png', fullPage: true });
  });

  test('should not have port before running', async () => {
    await page.waitForTimeout(500);

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
    await page.waitForTimeout(500);

    // Run the app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(5000);

    // Wait for port detection
    await page.waitForTimeout(8000);

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
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    let app: any;
    let appId: string;

    for (let i = 0; i < 20; i++) {
      const content = fs.readFileSync(appsJsonPath, 'utf-8');
      const appsData = JSON.parse(content);
      appId = Object.keys(appsData)[0];
      app = appsData[appId];

      if (app && app.port === detectedPort) {
        break;
      }

      await page.waitForTimeout(500);
    }

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(app.port).toBe(detectedPort);
  });

  test('should clear port when app stops', async () => {
    await page.waitForTimeout(1000);

    // Stop the app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await stopButton.click();
    await page.waitForTimeout(2000);

    await flaskCard.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(1000);

    // Run again
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(5000);

    // Wait for port detection
    await page.waitForTimeout(8000);

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
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    let app: any;
    let appId: string;

    for (let i = 0; i < 20; i++) {
      const content = fs.readFileSync(appsJsonPath, 'utf-8');
      const appsData = JSON.parse(content);
      appId = Object.keys(appsData)[0];
      app = appsData[appId];

      if (app && app.port === newPort) {
        break;
      }

      await page.waitForTimeout(500);
    }

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(app.port).toBe(newPort);
  });

  test('should maintain port info across app restarts', async () => {
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(2000);

    await flaskCard.locator('text=Ready').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);

    // Read state after stop
    content = fs.readFileSync(appsJsonPath, 'utf-8');
    appsData = JSON.parse(content);

    // Note: apps.json only persists port, not status/pid (they're runtime-only)
    expect(appsData[appId].port).toBeUndefined();

    await page.screenshot({ path: 'test-results/port-5-final-state.png', fullPage: true });
  });

  test('should handle port persistence after Electron restart', async () => {
    // Run the app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(5000);

    // Wait for port detection
    await page.waitForTimeout(8000);

    // Get port from UI
    let bodyText = await page.textContent('body');
    const portMatch = bodyText.match(/localhost:(\d+)/);
    const detectedPort = parseInt(portMatch![1], 10);

    await page.screenshot({ path: 'test-results/port-6-before-restart.png', fullPage: true });

    // Close and reopen Electron (simulates app restart)
    await electronApp.close();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Relaunch
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/port-7-after-restart.png', fullPage: true });

    // After restart, running apps should be set to "installed"
    // Port is persisted in file but not displayed in UI (since app isn't running)
    bodyText = await page.textContent('body');
    expect(bodyText).toContain('flask-test-app');
    expect(bodyText).toContain('Ready'); // Should be in Ready state, not Running

    // UI should NOT show port (app is not running, even though port is persisted)
    expect(bodyText).not.toMatch(/localhost:\d+/);

    // Verify in apps.json - port SHOULD be persisted (survives restart)
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    const content = fs.readFileSync(appsJsonPath, 'utf-8');
    const appsData = JSON.parse(content);
    const appId = Object.keys(appsData)[0];
    const app = appsData[appId];

    // Note: Port IS persisted across restarts, but status/pid are runtime-only
    expect(app.port).toBe(detectedPort);
  });
});
