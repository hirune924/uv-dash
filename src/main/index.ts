import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import type { AppInfo, InstallRequest, GlobalSecret } from '../shared/types';
import { checkUv, installUv } from './uv/manager';
import { installApp } from './apps/installer';
import { runApp as runAppProcess, stopApp as stopAppProcess, isRunning, getAppHealth, getAllAppHealth, recoverProcess } from './apps/runner';
import { loadApps, saveApps } from './storage/persistence';
import { randomBytes } from 'crypto';
import {
  initGlobalSecrets,
  listGlobalSecrets,
  createGlobalSecret,
  updateGlobalSecret,
  deleteGlobalSecret,
} from './storage/secrets-storage';
import i18n, { changeLanguage } from './i18n';

// Parse command line arguments for --user-data-dir (for E2E testing)
const args = process.argv.slice(1);
const userDataDirIndex = args.findIndex(arg => arg.startsWith('--user-data-dir='));
if (userDataDirIndex !== -1) {
  const userDataDir = args[userDataDirIndex].split('=')[1];
  if (userDataDir) {
    console.log(`[startup] Setting userData path to: ${userDataDir}`);
    app.setPath('userData', userDataDir);
  }
}

let mainWindow: BrowserWindow | null = null;

// Application list (temporarily held in memory)
const apps: Map<string, AppInfo> = new Map();

// Log sending helper
function sendLog(appId: string, message: string, level: 'info' | 'error' | 'warning' = 'info') {
  // Also output logs to console (for debugging - visible during testing)
  const timestamp = new Date().toLocaleTimeString('ja-JP');
  const levelPrefix = level === 'error' ? '[ERROR]' : level === 'warning' ? '[WARN]' : '[INFO]';
  console.log(`[${timestamp}] ${levelPrefix} [${appId}] ${message}`);

  if (mainWindow) {
    mainWindow.webContents.send('log', {
      appId,
      timestamp: Date.now(),
      level,
      message,
    });
  }
}

// App update event sending helper
function sendAppUpdated(app: AppInfo) {
  if (mainWindow) {
    mainWindow.webContents.send('app-updated', app);
  }
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Disabled for security
      contextIsolation: true, // Enabled for security
    },
  });

  // Load renderer HTML
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Send recovered app states after renderer is ready
  mainWindow.webContents.once('did-finish-load', () => {
    // Give renderer a moment to set up IPC listeners
    setTimeout(() => {
      for (const app of apps.values()) {
        if (app.status === 'running') {
          sendAppUpdated(app);
        }
      }
    }, 100);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when the app is ready
app.whenReady().then(async () => {
  try {
    // Initialize global secrets
    initGlobalSecrets();

    // Load persisted app information and attempt to recover running processes
    const persistedApps = loadApps();
    const { isProcessAlive, isPortInUse } = await import('./apps/process-monitor');

    for (const [id, appInfo] of persistedApps.entries()) {
      // Attempt to recover running processes
      const hasPid = appInfo.pid !== undefined;
      const hasPort = appInfo.port !== undefined;

      if (hasPid && hasPort) {
        // Check if both PID and port are still valid
        const pidAlive = isProcessAlive(appInfo.pid!);
        const portInUse = await isPortInUse(appInfo.port!);

        if (pidAlive && portInUse) {
          // Process is still running! Recover it

        // Register process with runner so Stop button works
        recoverProcess(
          id,
          appInfo.pid!,
          appInfo.installPath!,
          (message) => sendLog(id, message),
          (port) => {
            // Callback when port is detected from recovered process logs
            const currentApp = apps.get(id);
            if (currentApp) {
              const updatedApp = {
                ...currentApp,
                port,
              };
              apps.set(id, updatedApp);
              sendAppUpdated(updatedApp);
              saveApps(apps);
              sendLog(id, i18n.t('apps:process.port_detected', { port }), 'info');
            }
          },
          () => {
            // Callback when recovered process stops
            const currentApp = apps.get(id);
            if (currentApp) {
              const stoppedApp = {
                ...currentApp,
                status: 'installed' as const,
                pid: undefined,
                port: undefined,
              };
              apps.set(id, stoppedApp);
              sendAppUpdated(stoppedApp);
              saveApps(apps);
              sendLog(id, i18n.t('apps:process.stopped'), 'info');
            }
          }
        );

        const recoveredApp = {
          ...appInfo,
          status: 'running' as const,
        };
        apps.set(id, recoveredApp);
        // Note: sendAppUpdated() will be called after window is created
        continue;
      }
    }

    // Otherwise, clear runtime state
    apps.set(id, {
      ...appInfo,
      status: appInfo.status === 'running' ? 'installed' : appInfo.status,
      pid: undefined,
      port: undefined,
    });
  }

    // Persist the cleaned/recovered state back to file
    saveApps(apps);

    createWindow();

    // On macOS, recreate window when dock icon is clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('[startup] FATAL ERROR during initialization:', error);
    console.error('[startup] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    // Still try to create window so user can see error
    createWindow();
  }
});

// Quit app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Note: Child processes (uv/python) are NOT terminated when uv-dash exits.
// They continue running in the background, allowing users to restart uv-dash
// and reconnect to running applications. Process recovery happens on startup.

// IPC handlers
ipcMain.handle('list-apps', async () => {
  return Array.from(apps.values());
});

ipcMain.handle('install-app', async (_event, request: InstallRequest) => {
  const appId = randomBytes(8).toString('hex');

  // Add app to list (installing state)
  const appInfo: AppInfo = {
    id: appId,
    name: appId, // Will be updated later
    status: 'installing',
    sourcePath: request.sourcePath,
    sourceType: request.sourceType,
  };
  apps.set(appId, appInfo);
  sendAppUpdated(appInfo); // Emit event

  // Execute installation
  try {
    const result = await installApp(request, appId, (message) => {
      sendLog(appId, message);
    });

    if (result.success) {
      // Success
      const updatedApp = {
        ...appInfo,
        name: result.appName || appId,
        status: 'installed' as const,
        installPath: result.installPath,
        runCommand: result.runCommand,
      };
      apps.set(appId, updatedApp);
      sendAppUpdated(updatedApp); // 1. After successful install
      saveApps(apps); // Persist
      return { success: true, appId };
    } else {
      // Failure
      const errorApp = {
        ...appInfo,
        status: 'error' as const,
        errorMessage: result.error,
      };
      apps.set(appId, errorApp);
      sendAppUpdated(errorApp); // 2. After error install
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorApp = {
      ...appInfo,
      status: 'error' as const,
      errorMessage: errorMsg,
    };
    apps.set(appId, errorApp);
    sendAppUpdated(errorApp); // 3. After catch block in install
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('update-app', async (_event, appId: string, updates: Partial<Pick<AppInfo, 'name' | 'runCommand' | 'env'>>) => {
  const app = apps.get(appId);

  if (!app) {
    return { success: false, error: i18n.t('apps:error.not_found') };
  }

  // Update app information
  const updatedApp = {
    ...app,
    ...updates,
  };

  // If runCommand is set, recover from error state
  if (updates.runCommand && app.status === 'error') {
    updatedApp.status = 'installed';
    updatedApp.errorMessage = undefined;
  }

  apps.set(appId, updatedApp);
  sendAppUpdated(updatedApp); // 4. After updateApp

  saveApps(apps); // Persist

  return { success: true };
});

ipcMain.handle('run-app', async (_event, appId: string) => {
  const app = apps.get(appId);

  if (!app) {
    return { success: false, error: i18n.t('apps:error.not_found') };
  }

  if (app.status !== 'installed') {
    return { success: false, error: i18n.t('apps:error.not_installed') };
  }

  if (isRunning(appId)) {
    return { success: false, error: i18n.t('apps:error.already_running') };
  }

  // Execute (including environment variables and port detection)
  // Merge env, secrets, and resolved global secrets for process execution
  const mergedEnv = { ...app.env, ...app.secrets };

  // Resolve global secrets and add to environment variables
  if (app.secretRefs) {
    const { resolveSecretValue } = await import('./storage/secrets-storage');
    for (const [envVarName, secretId] of Object.entries(app.secretRefs)) {
      const value = resolveSecretValue(secretId);
      if (value) {
        mergedEnv[envVarName] = value;
      }
    }
  }
  const result = await runAppProcess(
    appId,
    app.installPath!,
    app.runCommand,
    mergedEnv, // Pass merged environment variables and decrypted secrets
    (message) => {
      sendLog(appId, message);
    },
    (port) => {
      // Callback when port is detected
      const currentApp = apps.get(appId);
      if (currentApp) {
        const updatedApp = {
          ...currentApp,
          port,
        };
        apps.set(appId, updatedApp);
        sendAppUpdated(updatedApp); // 7. In port detection callback
        saveApps(apps); // Persist port information
        sendLog(appId, i18n.t('apps:process.port_detected', { port }), 'info');
      }
    },
    () => {
      // Callback when process is stopped
      const currentApp = apps.get(appId);
      if (currentApp) {
        const stoppedApp = {
          ...currentApp,
          status: 'installed' as const,
          pid: undefined,
          port: undefined,
        };
        apps.set(appId, stoppedApp);
        sendAppUpdated(stoppedApp); // 8. In process stopped callback
        saveApps(apps); // Persist status update
        sendLog(appId, i18n.t('apps:process.stopped'), 'info');
      }
    }
  );

  if (result.success) {
    // Update state
    const runningApp = {
      ...app,
      status: 'running' as const,
      pid: result.pid,
    };
    apps.set(appId, runningApp);
    sendAppUpdated(runningApp);
    saveApps(apps);
    return { success: true };
  } else {
    const errorApp = {
      ...app,
      status: 'error' as const,
      errorMessage: result.error,
    };
    apps.set(appId, errorApp);
    sendAppUpdated(errorApp);
    return { success: false, error: result.error };
  }
});

ipcMain.handle('stop-app', async (_event, appId: string) => {
  const app = apps.get(appId);

  if (!app) {
    return { success: false, error: i18n.t('apps:error.not_found') };
  }

  if (!isRunning(appId)) {
    return { success: false, error: i18n.t('apps:error.not_running') };
  }

  // Stop
  const result = await stopAppProcess(appId, (message) => {
    sendLog(appId, message);
  });

  if (result.success) {
    // Status update will be done in the process 'close' event (runApp's onProcessStopped callback)
    // Here we only return that the stop request was successful
    return { success: true };
  } else {
    return { success: false, error: result.error };
  }
});

ipcMain.handle('remove-app', async (_event, appId: string) => {
  const app = apps.get(appId);

  if (!app) {
    return { success: false, error: i18n.t('apps:error.not_found') };
  }

  // Stop if running
  if (isRunning(appId)) {
    await stopAppProcess(appId, (message) => {
      sendLog(appId, message);
    });

    // Wait for process to completely stop (race condition prevention)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Delete installation directory
  if (app.installPath) {
    try {
      const fs = require('fs');
      fs.rmSync(app.installPath, { recursive: true, force: true });
      sendLog(appId, i18n.t('apps:process.removed'));
    } catch (error) {
      return {
        success: false,
        error: i18n.t('apps:error.remove_failed', { message: error instanceof Error ? error.message : String(error) }),
      };
    }
  }

  // Remove from list
  apps.delete(appId);
  saveApps(apps); // Persist

  return { success: true };
});

ipcMain.handle('open-in-browser', async (_event, appId: string) => {
  const app = apps.get(appId);

  if (!app) {
    return { success: false, error: i18n.t('apps:error.not_found') };
  }

  if (!app.port) {
    return { success: false, error: i18n.t('apps:error.no_port') };
  }

  try {
    const url = `http://localhost:${app.port}`;
    await shell.openExternal(url);
    sendLog(appId, i18n.t('apps:process.opened_in_browser', { url }), 'info');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: i18n.t('apps:error.browser_open_failed', { message: error instanceof Error ? error.message : String(error) }),
    };
  }
});

ipcMain.handle('check-uv', async () => {
  return await checkUv();
});

ipcMain.handle('install-uv', async () => {
  return await installUv((message) => {
    sendLog('system', message);
  });
});

// Git check related IPC handlers
ipcMain.handle('check-git', async () => {
  const { isGitInstalled } = await import('./system/git-checker');
  return await isGitInstalled();
});

ipcMain.handle('get-git-version', async () => {
  const { getGitVersion } = await import('./system/git-checker');
  return await getGitVersion();
});

ipcMain.handle('get-git-download-url', async () => {
  const { getGitDownloadUrl } = await import('./system/git-checker');
  return getGitDownloadUrl();
});

ipcMain.handle('open-git-download', async () => {
  const { getGitDownloadUrl } = await import('./system/git-checker');
  await shell.openExternal(getGitDownloadUrl());
});

// Global secret management IPC handlers
ipcMain.handle('list-global-secrets', async () => {
  return listGlobalSecrets();
});

ipcMain.handle('create-global-secret', async (_event, secret: Omit<GlobalSecret, 'id' | 'createdAt' | 'updatedAt'>) => {
  return createGlobalSecret(secret);
});

ipcMain.handle('update-global-secret', async (_event, secretId: string, updates: Partial<Pick<GlobalSecret, 'name' | 'envVarName' | 'value' | 'description'>>) => {
  return updateGlobalSecret(secretId, updates);
});

ipcMain.handle('delete-global-secret', async (_event, secretId: string) => {
  return deleteGlobalSecret(secretId);
});

ipcMain.handle('get-secret-usage', async (_event, secretId: string) => {
  // Check which apps are using this secret
  const appIds: string[] = [];
  for (const [id, app] of apps) {
    if (app.secretRefs && Object.values(app.secretRefs).includes(secretId)) {
      appIds.push(id);
    }
  }
  return { appIds };
});

// File dialog IPC handlers
ipcMain.handle('select-directory', async () => {
  const { dialog } = await import('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('select-zip-file', async () => {
  const { dialog } = await import('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select ZIP File',
    filters: [
      { name: 'ZIP Files', extensions: ['zip'] },
      { name: 'All Files', extensions: ['*'] }
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Process health monitoring IPC handlers
ipcMain.handle('get-app-health', async (_event, appId: string) => {
  return getAppHealth(appId);
});

ipcMain.handle('get-all-app-health', async () => {
  return getAllAppHealth();
});

// Language switching IPC handlers
ipcMain.handle('change-language', async (_event, lng: string) => {
  changeLanguage(lng);
  return { success: true };
});
