import { ChildProcess } from 'child_process';
import pidusage from 'pidusage';

export interface ProcessHealth {
  pid: number;
  isAlive: boolean;
  memoryUsage?: number; // MB
  cpuUsage?: number; // %
  startTime: number; // Unix timestamp
  lastChecked: number; // Unix timestamp
  status: 'running' | 'zombie' | 'unknown';
}

/**
 * Check if process is actually alive
 */
export function isProcessAlive(pid: number): boolean {
  try {
    // signal 0 does nothing but can check if process exists
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get process health information
 */
export async function getProcessHealth(
  pid: number,
  startTime: number
): Promise<ProcessHealth> {
  const isAlive = isProcessAlive(pid);

  let status: 'running' | 'zombie' | 'unknown' = 'unknown';
  if (isAlive) {
    status = 'running';
  } else if (Date.now() - startTime > 5000) {
    // If dead after 5+ seconds since startup, it's a zombie
    status = 'zombie';
  }

  // Get CPU/memory usage
  let memoryUsage: number | undefined;
  let cpuUsage: number | undefined;

  if (isAlive) {
    try {
      const stats = await pidusage(pid);
      memoryUsage = Math.round(stats.memory / 1024 / 1024); // bytes → MB
      cpuUsage = Math.round(stats.cpu * 10) / 10; // 1 decimal place
    } catch (error) {
      // May error immediately after process termination
      // Leave as undefined in that case
    }
  }

  return {
    pid,
    isAlive,
    memoryUsage,
    cpuUsage,
    startTime,
    lastChecked: Date.now(),
    status,
  };
}

/**
 * Get PIDs of entire child process tree (for zombie detection)
 */
export async function getProcessTreePids(
  parentPid: number
): Promise<number[]> {
  // Search for child processes with ps command
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    // macOS/Linux
    const { stdout } = await execAsync(
      `ps -o pid= --ppid ${parentPid} 2>/dev/null || pgrep -P ${parentPid} 2>/dev/null || echo ""`
    );

    const pids = stdout
      .trim()
      .split('\n')
      .map((line: string) => parseInt(line.trim(), 10))
      .filter((pid: number) => !isNaN(pid));

    return [parentPid, ...pids];
  } catch (error) {
    // Windows support postponed
    return [parentPid];
  }
}
