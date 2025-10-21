import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

test.describe.serial('Duplicate Secret Names Prevention', () => {
  test.beforeAll(async () => {
    testEnv.setup();
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button:has-text("Settings")')).toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    testEnv.teardown();
  });

  test('should create first secret successfully', async () => {
    // Navigate to Settings
    const settingsTab = page.locator('button:has-text("Settings")');
    await settingsTab.click();
    await expect(page.locator('button:has-text("+ Add Secret")')).toBeVisible({ timeout: 5000 });

    // Create first secret
    const addSecretButton = page.locator('button:has-text("+ Add Secret")');
    await addSecretButton.click();
    await expect(page.locator('input[placeholder="e.g., OpenAI API Key"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('input[placeholder="e.g., OpenAI API Key"]');
    await nameInput.fill('MY_API_KEY');

    const valueInput = page.locator('input[type="password"]');
    await valueInput.fill('secret-value-123');

    const createButton = page.locator('button:has-text("Create")');
    await createButton.click();
    await expect(page.locator('text=MY_API_KEY')).toBeVisible({ timeout: 5000 });

    // Verify secret was created
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('MY_API_KEY');
  });

  test('should prevent creating duplicate secret name', async () => {
    // Listen for dialog (alert)
    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // Try to create second secret with same name
    const addSecretButton = page.locator('button:has-text("+ Add Secret")');
    await addSecretButton.click();
    await expect(page.locator('input[placeholder="e.g., OpenAI API Key"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('input[placeholder="e.g., OpenAI API Key"]');
    await nameInput.fill('MY_API_KEY'); // Same name!

    const valueInput = page.locator('input[type="password"]');
    await valueInput.fill('different-value-456');

    const createButton = page.locator('button:has-text("Create")');
    await createButton.click();
    // Wait a bit for dialog to appear
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should show error in alert
    expect(dialogMessage).toMatch(/already exists/i);
    expect(dialogMessage).toContain('MY_API_KEY');

    // Close the modal after error
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();
    await expect(page.locator('text=+ Add Secret')).toBeVisible({ timeout: 5000 });
  });

  test('should allow creating secret with different name', async () => {
    // Create with different name
    const addSecretButton = page.locator('button:has-text("+ Add Secret")');
    await addSecretButton.click();
    await expect(page.locator('input[placeholder="e.g., OpenAI API Key"]')).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator('input[placeholder="e.g., OpenAI API Key"]');
    await nameInput.fill('ANOTHER_KEY'); // Different name

    const valueInput = page.locator('input[type="password"]');
    await valueInput.fill('another-value-789');

    const createButton = page.locator('button:has-text("Create")');
    await createButton.click();
    await expect(page.locator('text=ANOTHER_KEY')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/duplicate-3-another-key-created.png', fullPage: true });

    // Should succeed
    const bodyText = await page.textContent('body');
    console.log('Body text contains:', bodyText.substring(0, 500));
    expect(bodyText).toContain('MY_API_KEY');
    expect(bodyText).toContain('ANOTHER_KEY');
  });

});
