import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

let electronApp: ElectronApplication;
let page: Page;

test.describe('UV Installation Test', () => {
  test.beforeAll(async function() {
    // Skip this test if not running in CI environment
    if (!process.env.CI) {
      console.log('[SKIP] UV installation test only runs in CI environment');
      test.skip();
      return;
    }

    console.log('[UV INSTALL TEST] Starting test in CI environment');

    // Launch Electron with PATH that excludes uv
    // This simulates a fresh installation where uv is not installed
    const env = { ...process.env };

    // Remove uv from PATH
    if (env.PATH) {
      env.PATH = env.PATH.split(path.delimiter)
        .filter(p => !p.includes('.local/bin') && !p.includes('uv'))
        .join(path.delimiter);
      console.log('[UV INSTALL TEST] Filtered PATH to exclude uv');
    }

    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      env,
      timeout: 60000,
    });

    // Capture Electron console output
    electronApp.on('console', (msg) => {
      console.log(`[Electron] ${msg.text()}`);
    });

    page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
    console.log('[UV INSTALL TEST] Electron launched');
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
      console.log('[UV INSTALL TEST] Electron closed');
    }
  });

  test('should show UV not installed status', async () => {
    console.log('[UV INSTALL TEST] Checking UV status...');

    // Navigate to Settings tab
    const settingsTab = page.locator('button:has-text("Settings"), a:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/uv-1-not-installed.png', fullPage: true });

    // Verify "UV is not installed" message
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('UV is not installed');

    // Verify Install UV button exists
    const installButton = page.locator('button:has-text("Install UV")');
    await expect(installButton).toBeVisible({ timeout: 5000 });

    console.log('[UV INSTALL TEST] UV not installed status confirmed');
  });

  test('should install UV when button is clicked', async () => {
    console.log('[UV INSTALL TEST] Clicking Install UV button...');

    const installButton = page.locator('button:has-text("Install UV")');
    await installButton.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/uv-2-installing.png', fullPage: true });

    // Wait for installation to complete (may take 30-60 seconds)
    console.log('[UV INSTALL TEST] Waiting for installation to complete...');
    await page.waitForTimeout(5000);

    // Check for "UV is installed and ready" message
    // Installation might take time, so poll for the status
    let installed = false;
    for (let i = 0; i < 30; i++) {
      const bodyText = await page.textContent('body');
      if (bodyText?.includes('UV is installed and ready')) {
        installed = true;
        console.log(`[UV INSTALL TEST] UV installed successfully after ${i * 2} seconds`);
        break;
      }
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/uv-3-installed.png', fullPage: true });

    expect(installed).toBe(true);

    // Verify Install UV button is gone
    const installButton2 = page.locator('button:has-text("Install UV")');
    await expect(installButton2).not.toBeVisible();

    console.log('[UV INSTALL TEST] UV installation test completed successfully');
  });
});
