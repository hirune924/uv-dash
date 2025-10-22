import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import extract from 'extract-zip';
import type { InstallRequest, AppInfo } from '../../shared/types';
import { loadSettings } from '../storage/settings';

// Helper function to wrap spawn with Promise
function spawnAsync(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: false,
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: `Command failed with exit code ${code}: ${stderr || stdout}`,
        });
      }
    });

    proc.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

// Base directory for app installation
export function getAppsDir(): string {
  const settings = loadSettings();
  if (settings.appsDirectory) {
    return settings.appsDirectory;
  }
  const homeDir = os.homedir();
  return path.join(homeDir, '.uvdash', 'apps');
}

// Get uv command path (prioritize app-installed version, fallback to system PATH)
// On Windows, use uvw.exe to prevent console window from appearing
function getUvCommand(): string {
  const homeDir = os.homedir();
  const uvDir = path.join(homeDir, '.uvdash', 'bin');

  if (process.platform === 'win32') {
    // On Windows, prefer uvw.exe (no console window)
    const uvwPath = path.join(uvDir, 'uvw.exe');
    if (fs.existsSync(uvwPath)) {
      return uvwPath;
    }

    // Fall back to uv.exe if uvw not available
    const uvPath = path.join(uvDir, 'uv.exe');
    if (fs.existsSync(uvPath)) {
      return uvPath;
    }

    // System PATH: try uvw first, then uv
    return 'uvw';
  } else {
    // macOS/Linux: use standard uv
    const uvPath = path.join(uvDir, 'uv');
    if (fs.existsSync(uvPath)) {
      return uvPath;
    }
    return 'uv';
  }
}

// Download, extract source and copy to installation directory
async function prepareSource(
  request: InstallRequest,
  appId: string,
  onLog: (message: string) => void
): Promise<{ success: boolean; installPath?: string; error?: string }> {
  const appsDir = getAppsDir();
  const installPath = path.join(appsDir, appId);

  try {
    // Create installation directory
    if (!fs.existsSync(installPath)) {
      fs.mkdirSync(installPath, { recursive: true });
    }

    switch (request.sourceType) {
      case 'local':
        // Copy local folder
        onLog(`Copying local folder: ${request.sourcePath}`);
        if (!fs.existsSync(request.sourcePath)) {
          return { success: false, error: `Source path does not exist: ${request.sourcePath}` };
        }

        // If subdirectory is specified
        const sourcePath = request.subdir
          ? path.join(request.sourcePath, request.subdir)
          : request.sourcePath;

        if (!fs.existsSync(sourcePath)) {
          return { success: false, error: `Subdirectory does not exist: ${sourcePath}` };
        }

        // Copy files using Node.js fs (cross-platform)
        try {
          fs.cpSync(sourcePath, installPath, { recursive: true });
        } catch (error) {
          return { success: false, error: `Failed to copy files: ${error instanceof Error ? error.message : String(error)}` };
        }
        break;

      case 'github':
        // Clone from GitHub
        onLog(`Cloning from GitHub: ${request.sourcePath}`);
        const ref = request.ref || 'main';

        onLog(`[DEBUG] Git clone command: git clone --depth 1 --branch ${ref} ${request.sourcePath} ${installPath}`);
        onLog(`[DEBUG] Install path: ${installPath}`);
        onLog(`[DEBUG] Platform: ${process.platform}`);
        onLog(`[DEBUG] PATH: ${process.env.PATH}`);

        const cloneResult = await spawnAsync('git', [
          'clone',
          '--depth', '1',
          '--branch', ref,
          request.sourcePath,
          installPath
        ]);

        onLog(`[DEBUG] Git clone result: success=${cloneResult.success}, error=${cloneResult.error || 'none'}`);

        if (!cloneResult.success) {
          onLog(`[ERROR] Git clone failed: ${cloneResult.error}`);
          return { success: false, error: `Failed to clone Git repository: ${cloneResult.error}` };
        }

        onLog('[DEBUG] Git clone completed successfully');

        // Move subdirectory if specified
        if (request.subdir) {
          const subdirPath = path.join(installPath, request.subdir);
          if (!fs.existsSync(subdirPath)) {
            return { success: false, error: `Subdirectory not found: ${request.subdir}` };
          }
          // Move subdirectory contents one level up using Node.js fs (cross-platform)
          const tempDir = path.join(appsDir, `${appId}_temp`);

          try {
            fs.renameSync(subdirPath, tempDir);
            fs.rmSync(installPath, { recursive: true, force: true });
            fs.renameSync(tempDir, installPath);
          } catch (error) {
            return { success: false, error: `Failed to move directory: ${error instanceof Error ? error.message : String(error)}` };
          }
        }
        break;

      case 'zip':
        let zipPath: string;

        // Check if source is a URL or local file
        if (request.sourcePath.startsWith('http://') || request.sourcePath.startsWith('https://')) {
          // Download remote ZIP
          onLog(`Downloading ZIP: ${request.sourcePath}`);
          zipPath = path.join(appsDir, `${appId}.zip`);

          const curlResult = await spawnAsync('curl', ['-L', '-o', zipPath, request.sourcePath]);
          if (!curlResult.success) {
            return { success: false, error: `Failed to download: ${curlResult.error}` };
          }
        } else {
          // Use local ZIP file
          onLog(`Using local ZIP: ${request.sourcePath}`);
          if (!fs.existsSync(request.sourcePath)) {
            return { success: false, error: `ZIP file does not exist: ${request.sourcePath}` };
          }
          zipPath = request.sourcePath;
        }

        // Extract ZIP - try unzip command first, fallback to extract-zip
        onLog('Extracting ZIP...');
        const unzipResult = await spawnAsync('unzip', ['-q', zipPath, '-d', installPath]);

        if (!unzipResult.success) {
          // unzip command failed (likely not installed on Windows)
          // Fallback to cross-platform extract-zip library
          onLog('unzip command not available, using Node.js extraction...');
          try {
            await extract(zipPath, { dir: path.resolve(installPath) });
          } catch (error) {
            return { success: false, error: `Failed to extract ZIP: ${error instanceof Error ? error.message : String(error)}` };
          }
        }

        // Delete downloaded ZIP (not local file)
        if (request.sourcePath.startsWith('http://') || request.sourcePath.startsWith('https://')) {
          fs.unlinkSync(zipPath);
        }

        // Auto-detect single top-level directory if no subdirectory specified
        if (!request.subdir) {
          const entries = fs.readdirSync(installPath);
          // If ZIP contains a single directory, use it as the subdir
          if (entries.length === 1) {
            const singleEntry = entries[0];
            const singleEntryPath = path.join(installPath, singleEntry);
            const stat = fs.statSync(singleEntryPath);
            if (stat.isDirectory()) {
              onLog(`Auto-detected subdirectory: ${singleEntry}`);
              request.subdir = singleEntry;
            }
          }
        }

        // Process subdirectory (same as GitHub)
        if (request.subdir) {
          const subdirPath = path.join(installPath, request.subdir);
          if (!fs.existsSync(subdirPath)) {
            return { success: false, error: `Subdirectory not found: ${request.subdir}` };
          }
          const tempDir = path.join(appsDir, `${appId}_temp`);

          try {
            fs.renameSync(subdirPath, tempDir);
            fs.rmSync(installPath, { recursive: true, force: true });
            fs.renameSync(tempDir, installPath);
          } catch (error) {
            return { success: false, error: `Failed to move directory: ${error instanceof Error ? error.message : String(error)}` };
          }
        }
        break;

      default:
        return { success: false, error: 'Unsupported source type' };
    }

    onLog('Source preparation completed');
    return { success: true, installPath };
  } catch (error) {
    return {
      success: false,
      error: `Error during source preparation: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Execute uv sync
async function runUvSync(
  installPath: string,
  onLog: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    // Delete existing .venv (remove broken .venv from copy source)
    const venvPath = path.join(installPath, '.venv');
    if (fs.existsSync(venvPath)) {
      onLog('Deleting existing .venv...');
      try {
        fs.rmSync(venvPath, { recursive: true, force: true });
      } catch (error) {
        resolve({ success: false, error: `Failed to delete .venv: ${error instanceof Error ? error.message : String(error)}` });
        return;
      }
    }

    onLog('Running uv sync...');

    // Build uv sync command with optional Python version
    const syncArgs = ['sync'];
    const settings = loadSettings();
    const pythonVersion = settings.defaultPythonVersion || '3.13'; // Default to 3.13 if not set
    syncArgs.push('--python', pythonVersion);
    onLog(`Using Python ${pythonVersion}`);

    const uvProcess = spawn(getUvCommand(), syncArgs, {
      cwd: installPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: false,
      shell: false,
    });

    uvProcess.stdout?.on('data', (data) => {
      onLog(data.toString());
    });

    uvProcess.stderr?.on('data', (data) => {
      onLog(data.toString());
    });

    uvProcess.on('close', (code) => {
      if (code === 0) {
        onLog('uv sync completed');
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `uv sync failed (exit code: ${code})` });
      }
    });

    uvProcess.on('error', (error) => {
      resolve({ success: false, error: `Error in uv sync: ${error.message}` });
    });
  });
}

// Install app
export async function installApp(
  request: InstallRequest,
  appId: string,
  onLog: (message: string) => void
): Promise<{ success: boolean; installPath?: string; appName?: string; runCommand?: string; error?: string }> {
  // Prepare source
  const prepareResult = await prepareSource(request, appId, onLog);
  if (!prepareResult.success) {
    return prepareResult;
  }

  const installPath = prepareResult.installPath!;

  // Read pyproject.toml to get app name
  let appName = appId;
  const pyprojectPath = path.join(installPath, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) {
        appName = nameMatch[1];
      }
    } catch (error) {
      // Ignore read failure
    }
  }

  // Execute uv sync
  const syncResult = await runUvSync(installPath, onLog);
  if (!syncResult.success) {
    return { ...syncResult, installPath, appName };
  }

  return {
    success: true,
    installPath,
    appName,
    runCommand: request.runCommand // Return user-specified command
  };
}
