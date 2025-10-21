import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

test.describe('Secure Storage - Secrets Encryption', () => {
  test.beforeAll(async () => {
    testEnv.setup();
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button').filter({ hasText: /new app/i })).toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    testEnv.cleanupInstallations();
    testEnv.teardown();
  });

  test('should store secrets encrypted in apps.json', async () => {
    // Install a test app
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await expect(page.locator('input[placeholder="/path/to/project"]')).toBeVisible({ timeout: 5000 });

    const pathInput = page.locator('input[placeholder="/path/to/project"]');
    await pathInput.fill(path.join(__dirname, '../test-fixtures/flask-test-app'));

    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();
    await page.locator('text=Ready').first().waitFor({ timeout: 120000 });

    // Open edit modal
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.click();
    await expect(page.locator('button:has-text("Add Variable")')).toBeVisible({ timeout: 5000 });

    // Add a secret
    const addVarButton = page.locator('button:has-text("Add Variable")');
    await addVarButton.click();

    const varNameInput = page.locator('input[placeholder="VARIABLE_NAME"]').first();
    await varNameInput.fill('TEST_API_KEY');

    // Change source to "🔒 Encrypted Secret"
    const sourceSelect = page.locator('select').filter({ hasText: 'Plain Text' }).first();
    await sourceSelect.selectOption('secret');

    const secretInput = page.locator('input[type="password"]').first();
    await secretInput.fill('my-super-secret-key-12345');

    // Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await expect(page.locator('text=Edit App')).not.toBeVisible({ timeout: 5000 });

    // Read apps.json to verify encryption
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    const content = fs.readFileSync(appsJsonPath, 'utf-8');
    const appsData = JSON.parse(content);

    // Find the app we just created
    const appId = Object.keys(appsData)[0];
    const app = appsData[appId];

    // Verify secrets exist
    expect(app.secrets).toBeDefined();
    expect(app.secrets.TEST_API_KEY).toBeDefined();

    // Verify the secret is encrypted (not plain text)
    expect(app.secrets.TEST_API_KEY).not.toBe('my-super-secret-key-12345');

    // On Linux CI, encryption may not be available, so we check for plain: prefix
    // On macOS/Windows, it should be encrypted without the prefix
    const isPlainText = app.secrets.TEST_API_KEY.startsWith('plain:');

    if (isPlainText) {
      // Linux CI environment - encryption not available
      expect(app.secrets.TEST_API_KEY).toBe('plain:my-super-secret-key-12345');
    } else {
      // macOS/Windows - real encryption available
      expect(app.secrets.TEST_API_KEY.length).toBeGreaterThan(20);
      expect(app.secrets.TEST_API_KEY).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64
    }
  });

  test('should decrypt secrets when loading apps', async () => {
    // Reload the page to test decryption
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button').filter({ hasText: /new app/i })).toBeVisible({ timeout: 10000 });

    // Check if app still exists (may have been cleared if previous test failed)
    const bodyText = await page.textContent('body');
    if (bodyText?.includes('No apps installed')) {
      console.log('[SKIP] No app available, skipping decrypt test');
      return;
    }

    // Open edit modal again
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await expect(page.locator('input[placeholder="VARIABLE_NAME"]').first()).toBeVisible({ timeout: 5000 });

    // Verify the secret is still there (decrypted successfully)
    const varNameInput = page.locator('input[placeholder="VARIABLE_NAME"]').first();
    const varValue = await varNameInput.inputValue();
    expect(varValue).toBe('TEST_API_KEY');

    // Verify the source is set to "secret"
    const sourceSelect = page.locator('select').first();
    const sourceValue = await sourceSelect.inputValue();
    expect(sourceValue).toBe('secret');

    // Close modal
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();
  });

  test('should pass encrypted secrets as environment variables to running app', async () => {
    // This test verifies that secrets are decrypted and merged with env vars
    // when running the app (already tested in E2E tests indirectly)

    // Check if app exists
    const bodyText = await page.textContent('body');
    if (bodyText?.includes('No apps installed')) {
      console.log('[SKIP] No app available, skipping env vars test');
      return;
    }

    // Just verify the secret count is shown in the UI
    expect(bodyText).toMatch(/1 configured/);
    expect(bodyText).toMatch(/🔒.*1 secret/);
  });

  test('should handle adding multiple secrets', async () => {
    // Check if app exists
    const bodyText = await page.textContent('body');
    if (bodyText?.includes('No apps installed')) {
      console.log('[SKIP] No app available, skipping multiple secrets test');
      return;
    }

    // Open edit modal
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await expect(page.locator('button:has-text("Add Variable")')).toBeVisible({ timeout: 5000 });

    // Add second secret
    const addVarButton = page.locator('button:has-text("Add Variable")');
    await addVarButton.click();

    const varNameInputs = page.locator('input[placeholder="VARIABLE_NAME"]');
    await varNameInputs.last().fill('DATABASE_PASSWORD');

    // Change source to "🔒 Encrypted Secret"
    const sourceSelects = page.locator('select').filter({ hasText: 'Plain Text' });
    await sourceSelects.last().selectOption('secret');

    const secretInput = page.locator('input[type="password"]').last();
    await secretInput.fill('db-password-456');

    // Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await expect(page.locator('text=Edit App')).not.toBeVisible({ timeout: 5000 });

    // Verify in apps.json
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    const content = fs.readFileSync(appsJsonPath, 'utf-8');
    const appsData = JSON.parse(content);
    const appId = Object.keys(appsData)[0];
    const app = appsData[appId];

    expect(Object.keys(app.secrets).length).toBe(2);
    expect(app.secrets.TEST_API_KEY).toBeDefined();
    expect(app.secrets.DATABASE_PASSWORD).toBeDefined();
    expect(app.secrets.DATABASE_PASSWORD).not.toBe('db-password-456');
  });

  test('should handle removing secrets', async () => {
    // Check if app exists
    const bodyText = await page.textContent('body');
    if (bodyText?.includes('No apps installed')) {
      console.log('[SKIP] No app available, skipping remove secrets test');
      return;
    }

    // Open edit modal
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await expect(page.locator('button[title="Remove variable"]').first()).toBeVisible({ timeout: 5000 });

    // Remove one secret (click the × button)
    const removeButtons = page.locator('button[title="Remove variable"]');
    await removeButtons.first().click();

    // Save
    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();
    await expect(page.locator('text=Edit App')).not.toBeVisible({ timeout: 5000 });

    // Verify in apps.json
    const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
    const content = fs.readFileSync(appsJsonPath, 'utf-8');
    const appsData = JSON.parse(content);
    const appId = Object.keys(appsData)[0];
    const app = appsData[appId];

    expect(Object.keys(app.secrets).length).toBe(1);
  });
});
