import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();
const appsJsonPath = path.join(os.homedir(), '.uvdash', 'apps.json');
const secretsJsonPath = path.join(os.homedir(), '.uvdash', 'secrets.json');

test.describe.serial('Global Secrets Persistence', () => {
  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    testEnv.cleanupInstallations();
    testEnv.teardown();
  });

  test('SETUP: should create and persist a global secret', async () => {
    testEnv.setup();

    // Launch app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/secrets-persist-1-start.png', fullPage: true });

    // Navigate to Settings
    await page.locator('button:has-text("Settings")').click();
    await page.waitForTimeout(1000);

    // Create first global secret
    await page.locator('button:has-text("+ Add Secret")').click();
    await page.waitForTimeout(1000);

    await page.locator('input[placeholder="e.g., OpenAI API Key"]').fill('TEST_API_KEY');
    await page.locator('input[type="password"]').fill('secret-value-original');
    await page.locator('textarea[placeholder="Optional description"]').fill('Original description');
    await page.locator('button:has-text("Create")').click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/secrets-persist-2-created.png', fullPage: true });

    // Verify secret appears in UI
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('TEST_API_KEY');
    expect(bodyText).toContain('Original description');

    // CHECK 1: Verify secret is encrypted in secrets.json
    const secretsData = JSON.parse(fs.readFileSync(secretsJsonPath, 'utf-8'));
    const secrets = Object.values(secretsData) as any[];
    const testSecret = secrets.find((s: any) => s.name === 'TEST_API_KEY');

    expect(testSecret).toBeDefined();
    expect(testSecret.name).toBe('TEST_API_KEY');
    expect(testSecret.description).toBe('Original description');
    // Value should be encrypted (not plain text)
    expect(testSecret.value).not.toBe('secret-value-original');
    expect(testSecret.value.length).toBeGreaterThan(20);

    console.log('[TEST] Created secret ID:', testSecret.id);
  });

  test('should update secret value and persist to disk', async () => {
    await page.waitForTimeout(500);

    // Find and click Edit button for TEST_API_KEY
    const editButtons = page.locator('button:has-text("Edit")');
    await editButtons.first().click();
    await page.waitForTimeout(1000);

    // Update both description and value
    const descInput = page.locator('textarea[placeholder="Optional description"]');
    await descInput.click();
    await descInput.clear();
    await descInput.fill('Updated description');
    await page.waitForTimeout(300);

    const valueInput = page.locator('input[type="password"]');
    await valueInput.click();
    await valueInput.fill('secret-value-updated');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/secrets-persist-3-edit.png', fullPage: true });

    // Update
    await page.locator('button:has-text("Update")').click();
    await page.waitForTimeout(2000);

    // Verify updated in UI
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Updated description');

    // CHECK 2: Verify update persisted to secrets.json
    const secretsData = JSON.parse(fs.readFileSync(secretsJsonPath, 'utf-8'));
    const secrets = Object.values(secretsData) as any[];
    const testSecret = secrets.find((s: any) => s.name === 'TEST_API_KEY');

    expect(testSecret).toBeDefined();
    expect(testSecret.description).toBe('Updated description');
    // Value should be different from original (encrypted)
    expect(testSecret.value).not.toBe('secret-value-original');
    // And should not be the plain text updated value
    expect(testSecret.value).not.toBe('secret-value-updated');

    const secretId = testSecret.id;
    console.log('[TEST] Updated secret ID:', secretId);

    await page.screenshot({ path: 'test-results/secrets-persist-4-updated.png', fullPage: true });
  });

  test('should install app and add secretRef', async () => {
    // Navigate to Apps
    await page.locator('button:has-text("Apps")').click();
    await page.waitForTimeout(1000);

    // Install flask-test-app
    await page.locator('button').filter({ hasText: /new app/i }).click();
    await page.waitForTimeout(1000);

    await page.locator('input[placeholder="/path/to/project"]')
      .fill(path.join(__dirname, '../test-fixtures/flask-test-app'));
    await page.locator('button:has-text("Install")').click();
    await page.waitForTimeout(2000);
    await page.locator('text=Ready').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/secrets-persist-5-app-installed.png', fullPage: true });

    // Open edit modal
    await page.locator('button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);

    // Add variable MY_API_KEY with global secret reference
    await page.locator('button:has-text("Add Variable")').click();
    await page.waitForTimeout(1000);

    // Set variable name - find the input within the last environment variable container
    let envVarContainers = await page.locator('.bg-bg-tertiary.border.border-border.rounded').all();
    let lastContainer = envVarContainers[envVarContainers.length - 1];

    const varInput = lastContainer.locator('input[type="text"]').first();
    await varInput.click();
    await varInput.selectText();
    await varInput.press('Backspace');
    await page.waitForTimeout(200);
    await varInput.type('API_KEY', { delay: 50 });
    await page.waitForTimeout(500);

    const sourceSelect = lastContainer.locator('select').first();
    await sourceSelect.selectOption('global');
    await page.waitForTimeout(1000);

    // Select TEST_API_KEY from the second select (global secret dropdown)
    const secretSelect = lastContainer.locator('select').nth(1);
    await secretSelect.waitFor({ state: 'visible' });
    const options = await secretSelect.locator('option').allTextContents();
    const testSecretOption = options.find(opt => opt.includes('TEST_API_KEY'));
    expect(testSecretOption).toBeDefined();
    await secretSelect.selectOption({ label: testSecretOption! });
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/secrets-persist-6-secretref-added.png', fullPage: true });

    // Save
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(2000);

    // Verify it shows "📦 1 global" in UI
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/📦.*1 global/);

    await page.screenshot({ path: 'test-results/secrets-persist-7-saved.png', fullPage: true });
  });

  test('CRITICAL: should persist secretRefs to disk', async () => {
    await page.waitForTimeout(1000);

    // CHECK 3: Read apps.json directly to verify secretRefs was saved
    const appsData = JSON.parse(fs.readFileSync(appsJsonPath, 'utf-8'));
    const apps = Object.values(appsData) as any[];
    expect(apps.length).toBeGreaterThan(0);

    const app = apps[0];
    console.log('[TEST] apps.json content:', JSON.stringify(app, null, 2));

    // THIS IS THE CRITICAL BUG CHECK - currently FAILS
    expect(app.secretRefs).toBeDefined();
    expect(Object.keys(app.secretRefs).length).toBeGreaterThan(0);
    expect(app.secretRefs['API_KEY']).toBeDefined();

    const secretId = app.secretRefs['API_KEY'];
    console.log('[TEST] SecretRef saved with ID:', secretId);

    // Verify the secretId matches the one in secrets.json
    const secretsData = JSON.parse(fs.readFileSync(secretsJsonPath, 'utf-8'));
    expect(secretsData[secretId]).toBeDefined();
    expect(secretsData[secretId].name).toBe('TEST_API_KEY');
  });

  test('CRITICAL: should persist secretRefs after app restart', async () => {
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/secrets-persist-8-before-restart.png', fullPage: true });

    // Close app
    await electronApp.close();

    // Restart the app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/secrets-persist-9-after-restart.png', fullPage: true });

    // CHECK 4: Verify secretRef is still visible in UI after restart
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/📦.*1 global/);

    // Open edit modal and verify the secretRef is there
    await page.locator('button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/secrets-persist-10-edit-after-restart.png', fullPage: true });

    // Find the API_KEY variable
    const varInputs = await page.locator('input[type="text"]').all();
    let foundApiKey = false;
    for (const input of varInputs) {
      const value = await input.inputValue();
      if (value === 'API_KEY') {
        foundApiKey = true;
        break;
      }
    }
    expect(foundApiKey).toBe(true);

    // Verify it's still set to global secret
    const selects = await page.locator('select').all();
    let foundGlobal = false;
    for (const select of selects) {
      const value = await select.inputValue();
      if (value === 'global') {
        foundGlobal = true;
        break;
      }
    }
    expect(foundGlobal).toBe(true);

    // Close modal
    await page.locator('button:has-text("Cancel")').click();
    await page.waitForTimeout(500);
  });

  test('RUNTIME: should pass secret value to running app as env var', async () => {
    await page.waitForTimeout(500);

    // Set run command first
    await page.locator('button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);

    const commandInput = page.locator('input[placeholder*="python"], input[placeholder*="command"]').first();
    await commandInput.click();
    await commandInput.clear();
    await commandInput.fill('python app.py');
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(1000);

    // Run the app
    const runButton = page.locator('button:has-text("Run")');
    await runButton.click();
    await page.waitForTimeout(3000);

    // Wait for app to be running
    const stopButton = page.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'test-results/secrets-persist-11-running.png', fullPage: true });

    // Navigate to Logs view to see the secret value in environment
    await page.locator('button:has-text("Logs")').click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/secrets-persist-12-logs.png', fullPage: true });

    // The flask app prints environment variables on startup
    // We should see that MY_API_KEY is set (but the actual value is hidden in the response)
    const logsText = await page.textContent('body');

    // Look for Flask startup messages which indicate the app received the env var
    expect(logsText).toContain('Running on');

    // CHECK 5: Make HTTP request to the Flask app to verify env var was passed
    // The app is running, so we can fetch from it
    await page.waitForTimeout(2000);

    // Go back to Apps view to get the port
    await page.locator('button:has-text("Apps")').click();
    await page.waitForTimeout(1000);

    // Extract port from the UI
    const bodyText = await page.textContent('body');
    const portMatch = bodyText.match(/localhost:(\d+)/);
    expect(portMatch).not.toBeNull();

    const port = portMatch![1];
    console.log('[TEST] App running on port:', port);

    // Make HTTP request to verify secret was passed
    // Note: This requires the app to be accessible, which it should be on localhost
    try {
      const response = await fetch(`http://localhost:${port}/`);
      const data = await response.json();

      console.log('[TEST] Flask response:', data);

      // First check: Verify the app is running and secret is hidden in normal endpoint
      expect(data.message).toBe('Flask Test App is running!');
      expect(data.API_KEY).toBe('***hidden***'); // This proves the secret was decrypted and passed

      // CRITICAL CHECK: Verify the actual decrypted value matches what we set
      // Call test endpoint that returns the actual value
      const verifyResponse = await fetch(`http://localhost:${port}/verify-secret`);
      const verifyData = await verifyResponse.json();

      console.log('[TEST] Secret verification:', verifyData);

      // This is the CRITICAL verification that proves end-to-end decryption works:
      // 1. The secretRef was resolved to the global secret ID
      // 2. The secret was decrypted from secrets.json
      // 3. The EXACT decrypted value was passed as an environment variable to the running process
      expect(verifyData.api_key_received).toBe('secret-value-updated');
      expect(verifyData.api_key_length).toBe(20); // Length of 'secret-value-updated'
    } catch (error) {
      console.error('[TEST] Failed to fetch from Flask app:', error);
      throw error;
    }

    // Stop the app
    await page.locator('button:has-text("Apps")').click();
    await page.waitForTimeout(500);

    const stopBtn = page.locator('button:has-text("Stop")');
    await stopBtn.click();
    await page.waitForTimeout(2000);
  });

  test('CRITICAL: should persist plain env vars to disk', async () => {
    await page.waitForTimeout(500);

    // Open edit modal
    await page.locator('button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);

    // Add plain environment variable
    await page.locator('button:has-text("Add Variable")').click();
    await page.waitForTimeout(1000);

    // Get the last environment variable container
    let envVarContainers = await page.locator('.bg-bg-tertiary.border.border-border.rounded').all();
    let lastContainer = envVarContainers[envVarContainers.length - 1];

    // Set variable name
    const varInput = lastContainer.locator('input[type="text"]').first();
    await varInput.click();
    await varInput.selectText();
    await varInput.press('Backspace');
    await page.waitForTimeout(200);
    await varInput.type('PLAIN_ENV_VAR', { delay: 50 });
    await page.waitForTimeout(500);

    // Keep it as "Plain text" (default) - value input is the second text input in plain text mode
    const valueInput = lastContainer.locator('input[type="text"]').nth(1);
    await valueInput.click();
    await valueInput.fill('plain_value_123');
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/secrets-persist-13-plain-env.png', fullPage: true });

    // Save
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(2000);

    // CHECK 6A: Verify plain env is saved to disk
    const appsData = JSON.parse(fs.readFileSync(appsJsonPath, 'utf-8'));
    const apps = Object.values(appsData) as any[];
    const app = apps[0];

    console.log('[TEST] apps.json with plain env:', JSON.stringify(app, null, 2));

    // env should have PLAIN_ENV_VAR
    expect(app.env).toBeDefined();
    expect(app.env['PLAIN_ENV_VAR']).toBe('plain_value_123');
  });

  test('CRITICAL: should persist local secrets to disk', async () => {
    await page.waitForTimeout(500);

    // Open edit modal
    await page.locator('button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);

    // Add another variable as local secret
    await page.locator('button:has-text("Add Variable")').click();
    await page.waitForTimeout(1000);

    // Get the last environment variable container
    let envVarContainers = await page.locator('.bg-bg-tertiary.border.border-border.rounded').all();
    let lastContainer = envVarContainers[envVarContainers.length - 1];

    // Set variable name
    const varInput = lastContainer.locator('input[type="text"]').first();
    await varInput.click();
    await varInput.selectText();
    await varInput.press('Backspace');
    await page.waitForTimeout(200);
    await varInput.type('LOCAL_SECRET', { delay: 50 });
    await page.waitForTimeout(500);

    // Change to "🔒 Encrypted Secret"
    const sourceSelect = lastContainer.locator('select').first();
    await sourceSelect.selectOption('secret');
    await page.waitForTimeout(500);

    // Set the password value (secret input appears when source is 'secret')
    const valueInput = lastContainer.locator('input[type="password"]').first();
    await valueInput.click();
    await valueInput.fill('local_secret_value_456');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/secrets-persist-14-local-secret.png', fullPage: true });

    // Save
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(2000);

    // CHECK 6B: Verify local secret is saved to disk AND encrypted
    const appsData2 = JSON.parse(fs.readFileSync(appsJsonPath, 'utf-8'));
    const apps2 = Object.values(appsData2) as any[];
    const app2 = apps2[0];

    console.log('[TEST] apps.json with local secret:', JSON.stringify(app2, null, 2));

    // THIS IS THE CRITICAL BUG CHECK for local secrets
    // secrets should have LOCAL_SECRET (encrypted)
    expect(app2.secrets).toBeDefined();
    expect(app2.secrets['LOCAL_SECRET']).toBeDefined();
    expect(app2.secrets['LOCAL_SECRET']).not.toBe('local_secret_value_456'); // Should be encrypted
    expect(app2.secrets['LOCAL_SECRET'].length).toBeGreaterThan(20); // Encrypted strings are long

    // Verify all three types coexist
    expect(app2.env).toBeDefined();
    expect(app2.env['PLAIN_ENV_VAR']).toBe('plain_value_123');
    expect(app2.secretRefs).toBeDefined();
    expect(app2.secretRefs['API_KEY']).toBeDefined();

    const bodyText = await page.textContent('body');
    // Should show "3 configured" (1 env + 1 secret + 1 secretRef)
    expect(bodyText).toMatch(/3 configured/);
    expect(bodyText).toMatch(/🔒.*1 secret/);
    expect(bodyText).toMatch(/📦.*1 global/);
  });

  test('should persist all three types after app restart', async () => {
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/secrets-persist-15-before-restart.png', fullPage: true });

    // Close app
    await electronApp.close();

    // Restart the app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/secrets-persist-16-after-restart.png', fullPage: true });

    // Verify all three types are still there after restart
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/3 configured/);
    expect(bodyText).toMatch(/🔒.*1 secret/);
    expect(bodyText).toMatch(/📦.*1 global/);

    // Open edit modal and verify all are there
    await page.locator('button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/secrets-persist-17-edit-after-restart.png', fullPage: true });

    const varInputs = await page.locator('input[type="text"]').all();
    const varNames = await Promise.all(varInputs.map(input => input.inputValue()));

    expect(varNames).toContain('PLAIN_ENV_VAR');
    expect(varNames).toContain('LOCAL_SECRET');
    expect(varNames).toContain('API_KEY');

    // Close modal
    await page.locator('button:has-text("Cancel")').click();
    await page.waitForTimeout(500);
  });

  test('CRITICAL: should clear all vars when removed (env, secrets, secretRefs)', async () => {
    await page.waitForTimeout(500);

    // Open edit modal
    await page.locator('button[title="Edit"]').first().click();
    await page.waitForTimeout(1000);

    // Remove all three variables
    for (let i = 0; i < 3; i++) {
      const removeButton = page.locator('button[title="Remove variable"]').first();
      await removeButton.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: 'test-results/secrets-persist-14-all-removed.png', fullPage: true });

    // Save
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(2000);

    // Verify no env vars shown in UI
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toMatch(/\d+ configured/);
    expect(bodyText).not.toMatch(/📦.*global/);
    expect(bodyText).not.toMatch(/🔒.*secret/);

    // CHECK 6B: Verify all are cleared in apps.json
    const appsData = JSON.parse(fs.readFileSync(appsJsonPath, 'utf-8'));
    const apps = Object.values(appsData) as any[];
    const app = apps[0];

    console.log('[TEST] apps.json after clearing all:', JSON.stringify(app, null, 2));

    // THIS IS THE CRITICAL BUG CHECK #2 - empty values should be cleared
    // env, secrets, secretRefs should be either undefined or empty
    if (app.env) {
      expect(Object.keys(app.env).length).toBe(0);
    }
    if (app.secrets) {
      expect(Object.keys(app.secrets).length).toBe(0);
    }
    if (app.secretRefs) {
      expect(Object.keys(app.secretRefs).length).toBe(0);
    }
  });

  test('should persist empty secretRefs after restart', async () => {
    await page.waitForTimeout(500);

    // Close and restart app
    await electronApp.close();

    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });
    page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/secrets-persist-14-final.png', fullPage: true });

    // Verify secretRef is still gone after restart
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toMatch(/📦.*1 global/);
  });
});
