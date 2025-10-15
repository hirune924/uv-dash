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
    await page.waitForTimeout(2000);
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
    await page.waitForTimeout(500);

    // Create first secret
    const addSecretButton = page.locator('button:has-text("+ Add Secret")');
    await addSecretButton.click();
    await page.waitForTimeout(500);

    const nameInput = page.locator('input[placeholder="e.g., OpenAI API Key"]');
    await nameInput.click();
    await nameInput.type('MY_API_KEY', { delay: 50 });

    const valueInput = page.locator('input[type="password"]');
    await valueInput.click();
    await valueInput.type('secret-value-123', { delay: 50 });

    const createButton = page.locator('button:has-text("Create")');
    await createButton.click();
    await page.waitForTimeout(1000);

    // Verify secret was created
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('MY_API_KEY');
  });

  test('should prevent creating duplicate secret name', async () => {
    await page.waitForTimeout(500);

    // Listen for dialog (alert)
    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // Try to create second secret with same name
    const addSecretButton = page.locator('button:has-text("+ Add Secret")');
    await addSecretButton.click();
    await page.waitForTimeout(500);

    const nameInput = page.locator('input[placeholder="e.g., OpenAI API Key"]');
    await nameInput.click();
    await nameInput.type('MY_API_KEY', { delay: 50 }); // Same name!

    const valueInput = page.locator('input[type="password"]');
    await valueInput.click();
    await valueInput.type('different-value-456', { delay: 50 });

    const createButton = page.locator('button:has-text("Create")');
    await createButton.click();
    await page.waitForTimeout(1000);

    // Should show error in alert
    expect(dialogMessage).toMatch(/already exists/i);
    expect(dialogMessage).toContain('MY_API_KEY');

    // Close the modal after error
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();
    await page.waitForTimeout(500);
  });

  test('should allow creating secret with different name', async () => {
    await page.waitForTimeout(500);

    // Create with different name
    const addSecretButton = page.locator('button:has-text("+ Add Secret")');
    await addSecretButton.click();
    await page.waitForTimeout(500);

    const nameInput = page.locator('input[placeholder="e.g., OpenAI API Key"]');
    await nameInput.click();
    await nameInput.type('ANOTHER_KEY', { delay: 50 }); // Different name

    const valueInput = page.locator('input[type="password"]');
    await valueInput.click();
    await valueInput.type('another-value-789', { delay: 50 });

    const createButton = page.locator('button:has-text("Create")');
    await createButton.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/duplicate-3-another-key-created.png', fullPage: true });

    // Should succeed
    const bodyText = await page.textContent('body');
    console.log('Body text contains:', bodyText.substring(0, 500));
    expect(bodyText).toContain('MY_API_KEY');
    expect(bodyText).toContain('ANOTHER_KEY');
  });

});
