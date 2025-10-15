import { spawn } from 'child_process';
import * as os from 'os';

/**
 * Check if git is installed on the system
 */
export async function isGitInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const command = os.platform() === 'win32' ? 'where' : 'which';
    const proc = spawn(command, ['git'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Get git version if installed
 */
export async function getGitVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Extract version from "git version 2.x.x"
        const match = stdout.match(/git version ([\d.]+)/);
        resolve(match ? match[1] : stdout.trim());
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Get the appropriate git installation URL based on the platform
 */
export function getGitDownloadUrl(): string {
  const platform = os.platform();

  switch (platform) {
    case 'darwin':
      return 'https://git-scm.com/download/mac';
    case 'win32':
      return 'https://git-scm.com/download/win';
    case 'linux':
      return 'https://git-scm.com/download/linux';
    default:
      return 'https://git-scm.com/downloads';
  }
}
