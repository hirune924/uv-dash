import { test, expect, _electron as electron } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestEnvironment } from './helpers/test-env';

test.describe('Advanced Settings', () => {
  let testEnv: TestEnvironment;
  let electronApp: any;
  let page: any;

  test.beforeEach(async () => {
    testEnv = new TestEnvironment();
    testEnv.setup();

    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button:has-text("Settings")')).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    if (testEnv) {
      testEnv.teardown();
      testEnv.cleanupInstallations();
    }
  });

  test('should display Advanced Settings section in Settings page', async () => {
    // Navigate to Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('text=Advanced Settings').first()).toBeVisible({ timeout: 5000 });

    // Check for Advanced Settings section
    const advancedSection = await page.locator('text=Advanced Settings').first();
    await expect(advancedSection).toBeVisible();

    // Advanced Settings should be collapsed by default
    const cleanupButton = page.locator('button:has-text("Cleanup Now")');
    await expect(cleanupButton).not.toBeVisible();
  });

  test('should expand and collapse Advanced Settings', async () => {
    // Navigate to Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('button:has-text("Advanced Settings")')).toBeVisible({ timeout: 5000 });

    // Click to expand
    await page.click('button:has-text("Advanced Settings")');
    await expect(page.locator('text=Cleanup Orphaned Directories').first()).toBeVisible({ timeout: 5000 });

    // Check all three features are visible
    await expect(page.locator('text=Cleanup Orphaned Directories').first()).toBeVisible();
    await expect(page.locator('text=Apps Installation Directory').first()).toBeVisible();
    await expect(page.locator('text=Update UV').first()).toBeVisible();

    // Click to collapse
    await page.click('button:has-text("Advanced Settings")');
    // Wait for content to be hidden
    await expect(page.locator('button:has-text("Cleanup Now")')).not.toBeVisible({ timeout: 5000 });

    // Check features are hidden
    const cleanupButton = page.locator('button:has-text("Cleanup Now")');
    await expect(cleanupButton).not.toBeVisible();
  });

  test('should cleanup orphaned directories', async () => {
    const appsDir = path.join(os.homedir(), '.uvdash', 'apps');

    // Create an orphaned directory (not in apps.json)
    const orphanedDir = path.join(appsDir, 'orphaned-app-test-' + Date.now());
    fs.mkdirSync(orphanedDir, { recursive: true });
    fs.writeFileSync(path.join(orphanedDir, 'test.txt'), 'test content');

    // Verify orphaned directory exists
    expect(fs.existsSync(orphanedDir)).toBe(true);

    // Navigate to Settings and expand Advanced Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('button:has-text("Advanced Settings")')).toBeVisible({ timeout: 5000 });
    await page.click('button:has-text("Advanced Settings")');
    await expect(page.locator('button:has-text("Cleanup Now")')).toBeVisible({ timeout: 5000 });

    // Set up dialog handlers
    let confirmDialogShown = false;
    let successDialogShown = false;

    page.on('dialog', async (dialog) => {
      console.log(`[TEST] Dialog message: ${dialog.message()}`);
      if (!confirmDialogShown && dialog.message().includes('delete all directories')) {
        // Confirm dialog
        confirmDialogShown = true;
        await dialog.accept();
      } else if (dialog.message().includes('Successfully cleaned up')) {
        // Success alert
        successDialogShown = true;
        await dialog.accept();
      }
    });

    // Click cleanup button
    await page.click('button:has-text("Cleanup Now")');

    // Wait for cleanup to complete by checking for success dialog
    // The test sets up dialog handlers that will handle the dialogs
    await expect(page.locator('button:has-text("Cleanup Now")')).toBeVisible({ timeout: 10000 });

    // Verify orphaned directory was deleted
    const exists = fs.existsSync(orphanedDir);
    if (exists) {
      console.log('[TEST] ERROR: Directory still exists:', orphanedDir);
      console.log('[TEST] Directory contents:', fs.readdirSync(appsDir));
    }
    expect(exists).toBe(false);
  });

  test('should display current apps directory', async () => {
    // Navigate to Settings and expand Advanced Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('button:has-text("Advanced Settings")')).toBeVisible({ timeout: 5000 });
    await page.click('button:has-text("Advanced Settings")');
    await expect(page.locator('input[placeholder*="/path/to/apps/directory"]')).toBeVisible({ timeout: 5000 });

    // Check that current directory is displayed
    const directoryInput = page.locator('input[placeholder*="/path/to/apps/directory"]');
    await expect(directoryInput).toBeVisible();

    const currentValue = await directoryInput.inputValue();
    expect(currentValue).toContain('apps'); // Should contain 'apps' in the path
  });

  test('should allow manual input of apps directory', async () => {
    // Navigate to Settings and expand Advanced Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('button:has-text("Advanced Settings")')).toBeVisible({ timeout: 5000 });
    await page.click('button:has-text("Advanced Settings")');
    await expect(page.locator('input[placeholder*="/path/to/apps/directory"]')).toBeVisible({ timeout: 5000 });

    // Find the directory input
    const directoryInput = page.locator('input[placeholder*="/path/to/apps/directory"]');

    // Clear and enter new path
    const newPath = path.join(os.tmpdir(), 'custom-apps-' + Date.now());
    await directoryInput.clear();
    await directoryInput.fill(newPath);

    // Set up dialog handler for success message
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('updated successfully');
      await dialog.accept();
    });

    // Click Save
    await page.click('button:has-text("Save")');

    // Wait for operation to complete - dialog handler will accept the success message
    // Just wait for the input to still be visible (page doesn't navigate away)
    await expect(directoryInput).toBeVisible({ timeout: 10000 });

    // Verify directory was created
    expect(fs.existsSync(newPath)).toBe(true);

    // Verify the input reflects the new value
    const updatedValue = await directoryInput.inputValue();
    expect(updatedValue).toBe(newPath);
  });

  test('should have Update UV button', async () => {
    // Navigate to Settings and expand Advanced Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('button:has-text("Advanced Settings")')).toBeVisible({ timeout: 5000 });
    await page.click('button:has-text("Advanced Settings")');
    await expect(page.locator('text=Update UV').first()).toBeVisible({ timeout: 5000 });

    // Check for Update UV section
    await expect(page.locator('text=Update UV').first()).toBeVisible();

    // Check for Update UV button
    const updateButton = page.locator('button:has-text("Update UV")').last();
    await expect(updateButton).toBeVisible();
    await expect(updateButton).toBeEnabled();
  });
});
