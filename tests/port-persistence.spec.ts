import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

const FLASK_APP_PATH = path.join(__dirname, '../test-fixtures/flask-test-app');
const FLASK_RUN_COMMAND = 'python app.py';

// Parse extra launch arguments from environment variable (for CI stability)
const extraArgs = process.env.ELECTRON_EXTRA_LAUNCH_ARGS?.split(' ').filter(arg => arg.length > 0) || [];

// Utility functions for safe Electron process termination
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function killElectronTree(pid: number) {
  console.log(`[TEST] Killing Electron process tree (PID: ${pid})`);

  if (process.platform === 'win32') {
    // Windows: 2-stage kill (graceful then force)
    console.log('[TEST] Stage 1: Graceful termination');
    spawn('taskkill', ['/PID', String(pid), '/T'], {
      stdio: 'ignore',
      windowsHide: true
    });

    await delay(1200);

    console.log('[TEST] Stage 2: Forced termination');
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  } else {
    // POSIX: Kill children first (while parent is alive), then parent
    console.log('[TEST] Sending SIGTERM to children');
    spawn('pkill', ['-TERM', '-P', String(pid)], { stdio: 'ignore' })
      .on('error', () => {});

    await delay(300);

    console.log('[TEST] Sending SIGTERM to process group');
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (e) {
      console.log('[TEST] SIGTERM to process group failed (may be dead)');
    }

    await delay(800);

    console.log('[TEST] Sending SIGKILL to process group');
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (e) {
      console.log('[TEST] SIGKILL to process group failed (already dead)');
    }

    // Final cleanup for any remaining orphans
    spawn('pkill', ['-KILL', '-P', String(pid)], { stdio: 'ignore' })
      .on('error', () => {});
  }
}

async function waitForProcessGone(pid: number, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAlive(pid)) {
      console.log(`[TEST] Process ${pid} confirmed dead after ${Date.now() - start}ms`);
      return;
    }
    await delay(200);
  }
  throw new Error(`Process ${pid} did not exit within ${timeoutMs}ms`);
}

function cleanChromiumSingletons(userDataDir: string) {
  if (!userDataDir) {
    console.log('[TEST] Skipping singleton cleanup (no userDataDir provided)');
    return;
  }

  console.log(`[TEST] Cleaning Chromium singleton files in ${userDataDir}`);
  const files = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  const dirs = ['GPUCache', 'Code Cache', 'Service Worker'];

  let cleanedFiles = 0;
  let cleanedDirs = 0;

  for (const file of files) {
    try {
      const filePath = path.join(userDataDir, file);
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
        cleanedFiles++;
      }
    } catch (e) {
      console.log(`[TEST] Failed to remove ${file}:`, e);
    }
  }

  for (const dir of dirs) {
    try {
      const dirPath = path.join(userDataDir, dir);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        cleanedDirs++;
      }
    } catch (e) {
      console.log(`[TEST] Failed to remove ${dir}:`, e);
    }
  }

  console.log(`[TEST] Cleaned ${cleanedFiles} files and ${cleanedDirs} directories`);
}

async function closeElectronSafely(electronApp: ElectronApplication, userDataDir?: string) {
  const pid = electronApp.process().pid;
  console.log(`[TEST] Closing Electron safely (PID: ${pid}, userDataDir: ${userDataDir || 'not provided'})`);

  // Try normal close with timeout
  const closePromise = electronApp.close()
    .then(() => 'closed')
    .catch((e) => {
      console.log(`[TEST] electronApp.close() error: ${e.message}`);
      return 'error';
    });

  const timeoutPromise = delay(10000).then(() => 'timeout');
  const result = await Promise.race([closePromise, timeoutPromise]);

  console.log(`[TEST] close() result: ${result}`);

  if (result !== 'closed') {
    console.log('[TEST] Normal close failed, forcing process tree kill');
    await killElectronTree(pid!);
  } else {
    console.log('[TEST] Normal close succeeded');
  }

  // Wait for complete termination
  try {
    await waitForProcessGone(pid!, 15000);
  } catch (e) {
    console.warn(`[TEST] waitForProcessGone failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Clean up singleton locks (only if userDataDir is provided)
  if (userDataDir) {
    cleanChromiumSingletons(userDataDir);
  } else {
    console.log('[TEST] Skipping singleton cleanup (no userDataDir provided)');
  }

  console.log('[TEST] Electron termination complete');
}

test.describe.serial('Port Persistence and Lifecycle', () => {
  test.beforeAll(async () => {
    testEnv.setup();
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js'), ...extraArgs],
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

    // Wait for Stop button to appear (indicates app is running)
    const stopButton = flaskCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 20000 });

    // Wait for port detection (may take additional time)
    await page.waitForTimeout(10000);

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

  test('should recover running app after Electron restart', async () => {
    test.setTimeout(180000); // 3 minutes for safety
    console.log('[TEST] Starting Electron restart test with process survival');

    // Run the app
    const flaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const runButton = flaskCard.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(5000);

    // Wait for port detection
    await page.waitForTimeout(8000);

    // Get port and PID from UI
    let bodyText = await page.textContent('body');
    const portMatch = bodyText.match(/localhost:(\d+)/);
    const detectedPort = parseInt(portMatch![1], 10);
    console.log(`[TEST] Detected port: ${detectedPort}`);

    // Get PID from apps.json
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    let content = fs.readFileSync(appsJsonPath, 'utf-8');
    let appsData = JSON.parse(content);
    const appId = Object.keys(appsData)[0];
    const pidBeforeRestart = appsData[appId].pid;
    console.log(`[TEST] PID before restart: ${pidBeforeRestart}`);

    await page.screenshot({ path: 'test-results/port-6-before-restart.png', fullPage: true });

    // Close and reopen Electron (app process should continue running)
    console.log('[TEST] Closing Electron...');
    // Only use E2E_USER_DATA_DIR if set (to avoid cleaning production data)
    const userDataDir = process.env.E2E_USER_DATA_DIR;
    await closeElectronSafely(electronApp, userDataDir);

    console.log('[TEST] Waiting 3 seconds before relaunch...');
    await delay(3000);

    // Relaunch
    console.log('[TEST] Relaunching Electron...');
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js'), ...extraArgs],
      timeout: 60000,
    });

    // Capture console output for relaunched instance
    electronApp.on('console', (msg) => {
      console.log(`[Electron Restarted] ${msg.text()}`);
    });

    console.log('[TEST] Waiting for first window...');
    page = await electronApp.firstWindow();
    console.log('[TEST] First window obtained, waiting for stabilization...');
    await page.waitForTimeout(3000);

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
    const app = appsData[appId];

    // Port and PID are preserved through restart
    expect(app.port).toBe(detectedPort);
    expect(app.pid).toBe(pidBeforeRestart);
    console.log(`[TEST] Successfully recovered app with port ${app.port} and PID ${app.pid}`);

    // Clean up: Stop the recovered app before test ends
    console.log('[TEST] Stopping recovered app...');
    const recoveredFlaskCard = page.locator('h3:has-text("flask-test-app")').locator('..').locator('..').locator('..');
    const stopButton = recoveredFlaskCard.locator('button:has-text("Stop")');
    await stopButton.click();
    await page.waitForTimeout(2000);
    console.log('[TEST] App stopped');
  });
});
