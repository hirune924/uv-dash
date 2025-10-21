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
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button:has-text("Settings"), a:has-text("Settings")')).toBeVisible({ timeout: 10000 });
    console.log('[UV INSTALL TEST] Electron launched');
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
      console.log('[UV INSTALL TEST] Electron closed');
    }
  });

  test('should show not installed status and successfully install UV', async () => {
    test.setTimeout(180000); // 3 minutes for installation

    console.log('[UV INSTALL TEST] Checking UV status...');

    // Navigate to Settings tab
    const settingsTab = page.locator('button:has-text("Settings"), a:has-text("Settings")');
    await settingsTab.click();
    await expect(page.locator('text=UV Status')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/uv-1-not-installed.png', fullPage: true });

    // Verify "UV is not installed" message
    let bodyText = await page.textContent('body');
    expect(bodyText).toContain('UV is not installed');

    // Verify Install UV button exists
    const installButton = page.locator('button:has-text("Install UV")');
    await expect(installButton).toBeVisible({ timeout: 5000 });

    console.log('[UV INSTALL TEST] UV not installed status confirmed');

    // Click Install UV button
    console.log('[UV INSTALL TEST] Clicking Install UV button...');
    await installButton.click();
    // Wait for installation to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    await page.screenshot({ path: 'test-results/uv-2-installing.png', fullPage: true });

    // Wait for installation to complete (may take 60-120 seconds)
    console.log('[UV INSTALL TEST] Waiting for installation to complete (up to 120 seconds)...');

    // Poll for "UV is installed and ready" message
    let installed = false;
    for (let i = 0; i < 60; i++) {
      bodyText = await page.textContent('body');
      if (bodyText?.includes('UV is installed and ready')) {
        installed = true;
        console.log(`[UV INSTALL TEST] UV installed successfully after ${i * 2} seconds`);
        break;
      }

      // Also check for installation error
      if (bodyText?.includes('installation failed') || bodyText?.includes('error')) {
        console.log(`[UV INSTALL TEST] Installation error detected: ${bodyText.substring(0, 200)}`);
        break;
      }

      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: 'test-results/uv-3-installed.png', fullPage: true });

    // Final body text for debugging
    bodyText = await page.textContent('body');
    console.log(`[UV INSTALL TEST] Final body text contains "installed": ${bodyText?.includes('installed')}`);

    expect(installed).toBe(true);

    // Verify Install UV button is gone
    const installButton2 = page.locator('button:has-text("Install UV")');
    await expect(installButton2).not.toBeVisible();

    console.log('[UV INSTALL TEST] UV installation test completed successfully');
  });
});
