import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import { loadSettings, saveSettings } from '../storage/settings';

const execAsync = promisify(exec);

// uv installation path
function getUvPath(): string {
  // Place under user directory
  const homeDir = os.homedir();
  const uvDir = path.join(homeDir, '.uvdash', 'bin');

  if (process.platform === 'win32') {
    return path.join(uvDir, 'uv.exe');
  }
  return path.join(uvDir, 'uv');
}

// Check if uv exists
export async function checkUv(): Promise<{ installed: boolean; version?: string }> {
  const uvPath = getUvPath();

  // Check if exists in custom path
  if (fs.existsSync(uvPath)) {
    try {
      const { stdout } = await execAsync(`"${uvPath}" --version`);
      const version = stdout.trim().replace('uv ', '');
      return { installed: true, version };
    } catch (error) {
      // If can't execute, reinstallation needed
      return { installed: false };
    }
  }

  // Check if in system PATH
  try {
    const { stdout } = await execAsync('uv --version');
    const version = stdout.trim().replace('uv ', '');
    return { installed: true, version };
  } catch (error) {
    return { installed: false };
  }
}

// Download and install uv
export async function installUv(
  onProgress?: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    onProgress?.('Starting uv download...');

    const uvDir = path.dirname(getUvPath());
    if (!fs.existsSync(uvDir)) {
      fs.mkdirSync(uvDir, { recursive: true });
    }

    // Download URL based on platform
    const platform = process.platform;
    const arch = process.arch;

    let downloadUrl: string;
    if (platform === 'darwin') {
      if (arch === 'arm64') {
        downloadUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-apple-darwin.tar.gz';
      } else {
        downloadUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-apple-darwin.tar.gz';
      }
    } else if (platform === 'win32') {
      downloadUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip';
    } else if (platform === 'linux') {
      downloadUrl = 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz';
    } else {
      return { success: false, error: `Unsupported platform: ${platform}` };
    }

    onProgress?.(`Downloading: ${downloadUrl}`);

    // Platform-specific installation
    if (platform === 'win32') {
      // Windows: Try multiple methods with fallback
      let installed = false;

      // Method 1: PowerShell 5.x with official script
      try {
        onProgress?.('Method 1: Trying PowerShell installation...');
        await execAsync('powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"', {
          timeout: 90000,
          env: { ...process.env, UV_INSTALL_DIR: uvDir },
        });
        onProgress?.('PowerShell installation completed');
        installed = true;
      } catch (error1: any) {
        onProgress?.(`PowerShell failed: ${error1.message}`);
        if (error1.stderr) onProgress?.(`stderr: ${error1.stderr}`);

        // Method 2: PowerShell 7 (pwsh)
        try {
          onProgress?.('Method 2: Trying pwsh (PowerShell 7) installation...');
          await execAsync('pwsh -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"', {
            timeout: 90000,
            env: { ...process.env, UV_INSTALL_DIR: uvDir },
          });
          onProgress?.('pwsh installation completed');
          installed = true;
        } catch (error2: any) {
          onProgress?.(`pwsh failed: ${error2.message}`);
          if (error2.stderr) onProgress?.(`stderr: ${error2.stderr}`);

          // Method 3: winget
          try {
            onProgress?.('Method 3: Trying winget installation...');
            await execAsync('winget install --id=astral-sh.uv -e --silent', {
              timeout: 90000,
            });
            onProgress?.('winget installation completed');
            installed = true;
          } catch (error3: any) {
            onProgress?.(`winget failed: ${error3.message}`);
            if (error3.stderr) onProgress?.(`stderr: ${error3.stderr}`);

            // Method 4: Direct ZIP download would go here
            throw new Error('All Windows installation methods failed');
          }
        }
      }

      if (installed) {
        onProgress?.('uv installation completed');
      }
    } else {
      // macOS/Linux: Use official script (works reliably)
      onProgress?.('Running installation script...');
      const installScript = 'curl -LsSf https://astral.sh/uv/install.sh | sh';

      const result = await execAsync(installScript, {
        timeout: 90000,
        env: {
          ...process.env,
          UV_INSTALL_DIR: uvDir,
        },
      });

      if (result.stdout) {
        onProgress?.(`stdout: ${result.stdout}`);
      }
      if (result.stderr) {
        onProgress?.(`stderr: ${result.stderr}`);
      }

      onProgress?.('uv installation completed');
    }

    // Verify installation
    const check = await checkUv();
    if (check.installed) {
      return { success: true };
    } else {
      return { success: false, error: 'Installation completed but uv not found' };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to install uv: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Update uv to the latest version using self update
export async function updateUv(
  onProgress?: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    onProgress?.('Updating uv to the latest version...');

    const uvPath = getUvPath();
    const command = fs.existsSync(uvPath) ? uvPath : 'uv';

    // Run uv self update with UV_NO_MODIFY_PATH=1 to prevent PATH modification
    const result = await execAsync(`"${command}" self update`, {
      timeout: 90000,
      env: {
        ...process.env,
        UV_NO_MODIFY_PATH: '1',
      },
    });

    if (result.stdout) {
      onProgress?.(`stdout: ${result.stdout}`);
    }
    if (result.stderr) {
      onProgress?.(`stderr: ${result.stderr}`);
    }

    onProgress?.('uv update completed');

    // Verify the update
    const check = await checkUv();
    if (check.installed) {
      return { success: true };
    } else {
      return { success: false, error: 'Update completed but uv not found' };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to update uv: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Execute uv command (using system or custom path uv)
export async function runUvCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const uvPath = getUvPath();
  const command = fs.existsSync(uvPath) ? uvPath : 'uv';

  const { stdout, stderr } = await execAsync(`"${command}" ${args.join(' ')}`);
  return { stdout, stderr };
}

// List available Python versions
export async function listPythonVersions(
  onProgress?: (message: string) => void
): Promise<{ success: boolean; versions?: string[]; error?: string }> {
  try {
    onProgress?.('Fetching available Python versions...');
    const uvPath = getUvPath();
    const command = fs.existsSync(uvPath) ? uvPath : 'uv';

    const result = await execAsync(`"${command}" python list`, {
      timeout: 30000,
    });

    if (result.stdout) {
      onProgress?.(`stdout: ${result.stdout}`);
    }

    // Parse output to extract version numbers
    // Expected format: "cpython-3.13.0-..." or similar
    const lines = result.stdout.split('\n');
    const versions: string[] = [];
    const versionSet = new Set<string>();

    for (const line of lines) {
      // Match patterns like "cpython-3.13.0", "3.13", etc.
      const match = line.match(/(\d+\.\d+)(?:\.\d+)?/);
      if (match && match[1]) {
        const version = match[1]; // e.g., "3.13"
        if (!versionSet.has(version)) {
          versionSet.add(version);
          versions.push(version);
        }
      }
    }

    // Sort versions in descending order (newest first)
    versions.sort((a, b) => {
      const [aMajor, aMinor] = a.split('.').map(Number);
      const [bMajor, bMinor] = b.split('.').map(Number);
      if (aMajor !== bMajor) return bMajor - aMajor;
      return bMinor - aMinor;
    });

    return { success: true, versions };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list Python versions: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Install Python version and set as default
export async function installPythonVersion(
  version: string,
  onProgress?: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    onProgress?.(`Installing Python ${version} and setting as default...`);
    const uvPath = getUvPath();
    const command = fs.existsSync(uvPath) ? uvPath : 'uv';

    const result = await execAsync(`"${command}" python install ${version} --default`, {
      timeout: 300000, // 5 minutes for installation
      env: {
        ...process.env,
        UV_NO_MODIFY_PATH: '1',
      },
    });

    if (result.stdout) {
      onProgress?.(`stdout: ${result.stdout}`);
    }
    if (result.stderr) {
      onProgress?.(`stderr: ${result.stderr}`);
    }

    onProgress?.(`Python ${version} installed and set as default`);

    // Save default Python version to settings
    const settings = loadSettings();
    settings.defaultPythonVersion = version;
    saveSettings(settings);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to install Python ${version}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
