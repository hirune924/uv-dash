import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';
import type { UpdateInfo } from 'electron-updater';

/**
 * Auto-updater module for UV Dash
 * Handles checking for updates, downloading, and notifying the renderer process
 */

let mainWindow: BrowserWindow | null = null;

/**
 * Configure auto-updater settings
 */
function configureUpdater() {
  // Auto-download updates when available
  autoUpdater.autoDownload = true;

  // Auto-install updates on app quit
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates on startup (after a delay)
  autoUpdater.autoRunAppAfterInstall = true;

  // Log level (optional, for debugging)
  autoUpdater.logger = console;
}

/**
 * Set up event listeners for auto-updater
 */
function setupEventListeners() {
  // Checking for update
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
    sendToRenderer('update:checking');
  });

  // Update available
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[Updater] Update available:', info.version);
    sendToRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  // No update available
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('[Updater] No update available. Current version:', info.version);
    sendToRenderer('update:not-available', {
      version: info.version,
    });
  });

  // Download progress
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Download progress: ${progress.percent.toFixed(2)}%`);
    sendToRenderer('update:downloading', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[Updater] Update downloaded:', info.version);
    sendToRenderer('update:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  // Error occurred
  autoUpdater.on('error', (error) => {
    console.error('[Updater] Error:', error);
    sendToRenderer('update:error', {
      message: error.message,
    });
  });
}

/**
 * Send message to renderer process
 */
function sendToRenderer(channel: string, data?: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Initialize the auto-updater
 * @param window - Main BrowserWindow instance
 */
export function initUpdater(window: BrowserWindow) {
  mainWindow = window;

  configureUpdater();
  setupEventListeners();

  // Check for updates after a delay (to avoid blocking app startup)
  setTimeout(() => {
    checkForUpdates();
  }, 5000); // 5 seconds after startup
}

/**
 * Manually check for updates
 */
export async function checkForUpdates() {
  try {
    console.log('[Updater] Manual check for updates triggered');
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('[Updater] Failed to check for updates:', error);
  }
}

/**
 * Quit and install the update
 */
export function quitAndInstall() {
  console.log('[Updater] Quitting and installing update...');
  autoUpdater.quitAndInstall(false, true);
}
