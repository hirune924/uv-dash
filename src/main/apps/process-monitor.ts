import { ChildProcess } from 'child_process';
import * as net from 'net';
import pidusage from 'pidusage';

export interface ProcessStats {
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
 * Check if a port is currently in use (listening)
 * @param port - Port number to check
 * @returns Promise<boolean> - true if port is in use
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use
      } else {
        resolve(false); // Other error, assume not in use
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(false); // Port is available
    });

    // Bind to 0.0.0.0 to check all interfaces (Flask binds to 0.0.0.0)
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Get process stats (CPU, memory, liveness)
 * Aggregates metrics from entire process tree (parent + children)
 */
export async function getProcessStats(
  pid: number,
  startTime: number
): Promise<ProcessStats> {
  const isAlive = isProcessAlive(pid);

  let status: 'running' | 'zombie' | 'unknown' = 'unknown';
  if (isAlive) {
    status = 'running';
  } else if (Date.now() - startTime > 5000) {
    // If dead after 5+ seconds since startup, it's a zombie
    status = 'zombie';
  }

  // Get CPU/memory usage for entire process tree
  let memoryUsage: number | undefined;
  let cpuUsage: number | undefined;

  if (isAlive) {
    try {
      // Get all PIDs in process tree (parent + children)
      const allPids = await getProcessTreePids(pid);

      // pidusage supports array of PIDs
      const stats = await pidusage(allPids);

      // Aggregate metrics from all processes
      let totalMemory = 0;
      let totalCpu = 0;

      for (const [pidStr, stat] of Object.entries(stats)) {
        totalMemory += stat.memory;
        totalCpu += stat.cpu;
      }

      memoryUsage = Math.round(totalMemory / 1024 / 1024); // bytes → MB
      cpuUsage = Math.round(totalCpu * 10) / 10; // 1 decimal place
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
