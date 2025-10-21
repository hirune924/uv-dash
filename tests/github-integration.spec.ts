import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { TestEnvironment } from './helpers/test-env';

let electronApp: ElectronApplication;
let page: Page;
const testEnv = new TestEnvironment();

// Use a real public GitHub repository (lightweight FastAPI example)
const GITHUB_REPO_URL = 'https://github.com/astral-sh/uv-fastapi-example';
const EXPECTED_APP_NAME = 'uv-fastapi-example';

test.describe.serial('GitHub Integration Test', () => {
  test.beforeAll(async () => {
    console.log('[BEFORE ALL] Starting GitHub test suite setup');
    testEnv.setup();
    console.log('[BEFORE ALL] TestEnv setup complete, launching Electron');
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      timeout: 60000,
    });

    // Capture Electron console output
    electronApp.on('console', (msg) => {
      console.log(`[Electron] ${msg.text()}`);
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('button').filter({ hasText: /new app/i })).toBeVisible({ timeout: 10000 });
    console.log('[BEFORE ALL] Electron launched and ready');
  });

  test.afterAll(async () => {
    console.log('[AFTER ALL] Starting test suite cleanup');
    if (electronApp) {
      await electronApp.close();
      console.log('[AFTER ALL] Electron closed');
    }
    testEnv.cleanupInstallations();
    testEnv.teardown();
    console.log('[AFTER ALL] Cleanup complete');
  });

  test('should install app from GitHub repository', async () => {
    await page.screenshot({ path: 'test-results/github-1-initial.png', fullPage: true });

    // Click New App button
    const newAppButton = page.locator('button').filter({ hasText: /new app/i });
    await newAppButton.click();
    await expect(page.locator('button:has-text("github")')).toBeVisible({ timeout: 5000 });

    // Select GitHub source type
    const githubButton = page.locator('button:has-text("github")');
    await githubButton.click();
    await expect(page.locator('input[placeholder="https://github.com/user/repo"]')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/github-2-modal-github-selected.png', fullPage: true });

    // Fill in GitHub repository URL
    const urlInput = page.locator('input[placeholder="https://github.com/user/repo"]');
    await urlInput.fill(GITHUB_REPO_URL);

    await page.screenshot({ path: 'test-results/github-3-form-filled.png', fullPage: true });

    // Click Install
    const installButton = page.locator('button:has-text("Install")');
    await installButton.click();

    // Wait for installation to complete by checking for "Ready" status
    // GitHub clone + uv sync should be fast with lightweight FastAPI dependency
    await page.locator('text=Ready').first().waitFor({ timeout: 120000 });

    await page.screenshot({ path: 'test-results/github-4-installed.png', fullPage: true });

    // Verify app appears with correct name
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain(EXPECTED_APP_NAME);
  });

  test('should display GitHub source information', async () => {

    await page.screenshot({ path: 'test-results/github-5-app-details.png', fullPage: true });

    // Verify the GitHub URL is shown in the source field
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('github.com');
  });

  test('should be able to edit GitHub-installed app', async () => {
    // Find and click the Edit button
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();
    await expect(page.locator('text=Edit App')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/github-6-edit-modal.png', fullPage: true });

    // Verify edit modal shows app name
    const modalText = await page.textContent('body');
    expect(modalText).toContain('Edit App');
    expect(modalText).toContain(EXPECTED_APP_NAME);

    // Close modal
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();
    await expect(page.locator('text=Edit App')).not.toBeVisible({ timeout: 5000 });
  });

  test('should be able to delete GitHub-installed app', async () => {

    // Find the app card
    const appCard = page.locator('div').filter({ hasText: new RegExp(EXPECTED_APP_NAME, 'i') }).first();

    // Set up dialog handler to accept the confirmation
    page.once('dialog', dialog => {
      console.log('[TEST] Dialog message:', dialog.message());
      dialog.accept();
    });

    // Click Delete button
    const deleteButton = appCard.locator('button:has-text("Delete")');
    await deleteButton.click();

    // Wait for the app to be removed from the UI
    await page.locator(`text=${EXPECTED_APP_NAME}`).first().waitFor({ state: 'detached', timeout: 10000 });

    await page.screenshot({ path: 'test-results/github-7-deleted.png', fullPage: true });

    // Verify app is gone
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain(EXPECTED_APP_NAME);

    // Should show "0 installed"
    expect(bodyText).toMatch(/0\s+installed/i);
  });
});
