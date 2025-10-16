import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AppInfo } from '../../shared/types';
import { encryptSecrets, decryptSecrets } from './secure-storage';

// Path to persistence file
function getStorageFilePath(): string {
  const homeDir = os.homedir();
  const uvdashDir = path.join(homeDir, '.uvdash');

  // Create directory if it doesn't exist
  if (!fs.existsSync(uvdashDir)) {
    fs.mkdirSync(uvdashDir, { recursive: true });
  }

  return path.join(uvdashDir, 'apps.json');
}

// App information for persistence
// Note: Now includes pid/port for process recovery after restart
interface PersistedAppInfo extends Omit<AppInfo, 'status' | 'errorMessage'> {
  // status will be determined on restore (running if process alive, else installed)
}

// Save app information
export function saveApps(apps: Map<string, AppInfo>): void {
  try {
    const filePath = getStorageFilePath();
    console.log(`[persistence] Saving to: ${filePath}`);

    // Extract only information to persist
    const persistedApps: Record<string, PersistedAppInfo> = {};

    for (const [id, app] of apps.entries()) {
      // Don't save running or error states (start from installed on next launch)
      if (app.status === 'installing') {
        continue; // Don't save while installing
      }

      // Encrypt secrets before persisting
      const encryptedSecrets = app.secrets ? encryptSecrets(app.secrets) : undefined;

      persistedApps[id] = {
        id: app.id,
        name: app.name,
        sourcePath: app.sourcePath,
        sourceType: app.sourceType,
        installPath: app.installPath,
        runCommand: app.runCommand,
        env: app.env,
        secrets: encryptedSecrets,
        pid: app.pid, // Save PID for process recovery
        port: app.port, // Save port for process recovery
      };

      console.log(`[persistence] Saving app ${id}: pid=${app.pid}, port=${app.port}`);
    }

    fs.writeFileSync(filePath, JSON.stringify(persistedApps, null, 2), 'utf-8');
    console.log(`[persistence] Successfully saved ${Object.keys(persistedApps).length} apps`);
  } catch (error) {
    console.error('[persistence] Failed to save apps:', error);
  }
}

// Load app information
export function loadApps(): Map<string, AppInfo> {
  const apps = new Map<string, AppInfo>();

  try {
    const filePath = getStorageFilePath();
    console.log(`[persistence] Loading from: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.log(`[persistence] File does not exist, returning empty map`);
      return apps; // Return empty Map if file doesn't exist
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`[persistence] File content (${content.length} chars):`, content.substring(0, 500));
    const persistedApps: Record<string, PersistedAppInfo> = JSON.parse(content);

    for (const [id, persistedApp] of Object.entries(persistedApps)) {
      // Decrypt secrets when loading
      const decryptedSecrets = persistedApp.secrets ? decryptSecrets(persistedApp.secrets) : undefined;

      // Set status to 'installed' when restoring
      const restoredApp = {
        ...persistedApp,
        secrets: decryptedSecrets,
        status: 'installed' as const,
      };
      apps.set(id, restoredApp);

      console.log(`[persistence] Loaded app ${id}: pid=${persistedApp.pid}, port=${persistedApp.port}`);
    }

    console.log(`[persistence] Successfully loaded ${apps.size} apps`);
    return apps;
  } catch (error) {
    console.error('[persistence] Failed to load apps:', error);
    console.error('[persistence] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return apps;
  }
}
