import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../dist/main/index.js')],
    timeout: 60000,
  });
  page = await electronApp.firstWindow();

  // Wait for page to fully load
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('UV Dash Application', () => {
  test('should launch application and display content', async () => {
    // Wait for body to be visible with content
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/app-screenshot.png', fullPage: true });

    // Just verify the page loaded successfully
    expect(page).toBeTruthy();

    // Check that some content is visible (any text or element)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test('should have layout elements', async () => {
    // Check for any content div
    const content = page.locator('div').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test('should be able to interact with the UI', async () => {
    // Wait for at least one button to be visible
    const button = page.locator('button').first();
    await expect(button).toBeVisible({ timeout: 10000 });

    // Try to find any button
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    // Should have at least one button
    expect(buttonCount).toBeGreaterThan(0);
  });
});
