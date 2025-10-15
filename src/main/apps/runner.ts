import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parse as parseShellCommand } from 'shell-quote';
import kill from 'tree-kill';
import { PROCESS } from '../../shared/constants';
import { isProcessAlive, getProcessHealth, ProcessHealth } from './process-monitor';
import i18n from '../i18n';

/**
 * Process execution information
 */
interface ProcessInfo {
  process: ChildProcess;
  startTime: number;
  appId: string;
  installPath: string;
}

/**
 * Map for managing running processes
 * Key: appId, Value: ProcessInfo
 */
const runningProcesses = new Map<string, ProcessInfo>();

/**
 * Map for tracking timeouts during process stopping
 * Prevents duplicate execution during SIGKILL timeout
 * Key: appId, Value: NodeJS.Timeout
 */
const stoppingProcesses = new Map<string, NodeJS.Timeout>();

/**
 * Polling timer for health checks
 * Key: appId, Value: NodeJS.Timeout
 */
const healthPollingTimers = new Map<string, NodeJS.Timeout>();

/**
 * Health check polling interval (milliseconds)
 */
const HEALTH_POLLING_INTERVAL_MS = 5000; // Every 5 seconds

/**
 * Get uv command path (prioritize app-installed version, fallback to system PATH)
 */
function getUvCommand(): string {
  const homeDir = os.homedir();
  const uvDir = path.join(homeDir, '.uvdash', 'bin');
  const uvPath = process.platform === 'win32'
    ? path.join(uvDir, 'uv.exe')
    : path.join(uvDir, 'uv');

  // If app-installed uv exists, use it
  if (fs.existsSync(uvPath)) {
    return uvPath;
  }

  // Otherwise use system PATH uv
  return 'uv';
}

/**
 * Start health check polling
 */
function startHealthPolling(
  appId: string,
  onLog: (message: string) => void,
  onProcessStopped?: () => void
): void {
  // Do nothing if already polling
  if (healthPollingTimers.has(appId)) {
    return;
  }

  const timer = setInterval(async () => {
    const processInfo = runningProcesses.get(appId);
    if (!processInfo) {
      // Stop polling if process info doesn't exist
      stopHealthPolling(appId);
      return;
    }

    const { process: proc, startTime } = processInfo;
    if (!proc.pid) {
      return;
    }

    // Check process health
    const health = await getProcessHealth(proc.pid, startTime);

    // If zombie process is detected
    if (health.status === 'zombie') {
      onLog(i18n.t('apps:process.zombie', { pid: proc.pid }));
      runningProcesses.delete(appId);
      stopHealthPolling(appId);

      if (onProcessStopped) {
        onProcessStopped();
      }
    }

    // If process is dead (still in Map but PID is invalid)
    if (!health.isAlive) {
      onLog(i18n.t('apps:process.terminated', { pid: proc.pid }));
      runningProcesses.delete(appId);
      stopHealthPolling(appId);

      if (onProcessStopped) {
        onProcessStopped();
      }
    }
  }, HEALTH_POLLING_INTERVAL_MS);

  healthPollingTimers.set(appId, timer);
}

/**
 * Stop health check polling
 */
function stopHealthPolling(appId: string): void {
  const timer = healthPollingTimers.get(appId);
  if (timer) {
    clearInterval(timer);
    healthPollingTimers.delete(appId);
  }
}

/**
 * Set up process event handlers (common processing)
 * @param proc - Target ChildProcess
 * @param appId - Application ID
 * @param onLog - Log callback
 * @param onPortDetected - Callback when port is detected (optional)
 * @param onProcessStopped - Callback when process is stopped (optional)
 * @returns { success: boolean; pid?: number }
 */
function setupProcessHandlers(
  proc: ChildProcess,
  appId: string,
  onLog: (message: string) => void,
  onPortDetected?: (port: number) => void,
  onProcessStopped?: () => void
): { success: boolean; pid?: number } {
  // Stream stdout to log + detect port
  proc.stdout?.on('data', (data) => {
    const message = data.toString();
    onLog(message);

    // Detect port number
    if (onPortDetected) {
      const port = detectPortFromLog(message);
      if (port) {
        onPortDetected(port);
      }
    }
  });

  proc.stderr?.on('data', (data) => {
    const message = data.toString();
    onLog(message);

    // Also detect port from stderr (Flask etc. output to stderr)
    if (onPortDetected) {
      const port = detectPortFromLog(message);
      if (port) {
        onPortDetected(port);
      }
    }
  });

  proc.on('error', (error) => {
    onLog(i18n.t('apps:error.process', { error: error.message }));
    runningProcesses.delete(appId);

    // Clear timeout if set
    const timeout = stoppingProcesses.get(appId);
    if (timeout) {
      clearTimeout(timeout);
      stoppingProcesses.delete(appId);
    }

    // Stop polling
    stopHealthPolling(appId);

    if (onProcessStopped) {
      onProcessStopped();
    }
  });

  proc.on('close', (code) => {
    onLog(i18n.t('apps:process.exited', { code }));
    runningProcesses.delete(appId);

    // Clear timeout if set
    const timeout = stoppingProcesses.get(appId);
    if (timeout) {
      clearTimeout(timeout);
      stoppingProcesses.delete(appId);
    }

    // Stop polling
    stopHealthPolling(appId);

    if (onProcessStopped) {
      onProcessStopped();
    }
  });

  // Register process (with metadata)
  const processInfo: ProcessInfo = {
    process: proc,
    startTime: Date.now(),
    appId,
    installPath: '', // Set later
  };
  runningProcesses.set(appId, processInfo);

  // Start health check polling
  startHealthPolling(appId, onLog, onProcessStopped);

  onLog(i18n.t('apps:process.started', { pid: proc.pid }));

  return { success: true, pid: proc.pid };
}

/**
 * Auto-detect start command from pyproject.toml (for fallback)
 * Look for "start" script in [project.scripts] section
 * @param installPath - Installation path
 * @returns Start command (null if not found)
 */
function detectStartCommand(installPath: string): string | null {
  const pyprojectPath = path.join(installPath, 'pyproject.toml');

  if (!fs.existsSync(pyprojectPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(pyprojectPath, 'utf-8');

    // Look for start script in [project.scripts] section
    const scriptsMatch = content.match(/\[project\.scripts\]([\s\S]*?)(?=\[|$)/);
    if (scriptsMatch) {
      const scriptsSection = scriptsMatch[1];
      const startMatch = scriptsSection.match(/start\s*=\s*"([^"]+)"/);
      if (startMatch) {
        return startMatch[1];
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Detect port number from log message
 * Supports Flask, Streamlit, FastAPI, Django and other frameworks
 * @param message - Log message
 * @returns Detected port number (null if not found or if error message)
 */
function detectPortFromLog(message: string): number | null {
  // Exclude error messages and connection messages (prevent false positives)
  const errorPatterns = [
    /error/i,
    /failed/i,
    /refused/i,
    /timeout/i,
    /cannot/i,
    /unable/i,
    /already in use/i,
    /bind/i,
    /connecting to/i,
    /connect to/i,
    /connection to/i,
  ];

  // Exclude error-related messages
  for (const pattern of errorPatterns) {
    if (pattern.test(message)) {
      return null;
    }
  }

  // Framework-specific patterns (high priority)
  const frameworkPatterns = [
    // Flask: " * Running on http://127.0.0.1:5000"
    { pattern: /\*\s+Running on.*?:(\d+)/i, framework: 'Flask' },
    // Streamlit: "Local URL: http://localhost:8501"
    { pattern: /Local URL:\s*https?:\/\/[^:]+:(\d+)/i, framework: 'Streamlit' },
    // FastAPI/Uvicorn: "Uvicorn running on http://127.0.0.1:8000"
    { pattern: /Uvicorn running on.*?:(\d+)/i, framework: 'FastAPI/Uvicorn' },
    // Django: "Starting development server at http://127.0.0.1:8000/"
    { pattern: /Starting development server at.*?:(\d+)/i, framework: 'Django' },
  ];

  for (const { pattern } of frameworkPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port >= PROCESS.PORT_MIN && port <= PROCESS.PORT_MAX) {
        return port;
      }
    }
  }

  // Common server startup messages (containing positive keywords like listening/running/started/starting)
  const positivePatterns = [
    /(?:listening|running|started|starting|serving|available).*?(?:on|at).*?:(\d+)/i,
    /(?:listening|running|started|starting|serving|available).*?(?:port|PORT)[\s:]+(\d+)/i,
    /server.*?(?:listening|running|started|starting).*?:(\d+)/i,
  ];

  for (const pattern of positivePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port >= PROCESS.PORT_MIN && port <= PROCESS.PORT_MAX) {
        return port;
      }
    }
  }

  // URL format detection (http://host:port)
  const urlPatterns = [
    /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\*):(\d+)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port >= PROCESS.PORT_MIN && port <= PROCESS.PORT_MAX) {
        return port;
      }
    }
  }

  return null;
}

/**
 * Start application
 * Execute Python app using uv run
 * @param appId - Application ID
 * @param installPath - Installation path
 * @param runCommand - Run command (auto-detected if omitted)
 * @param env - Environment variables
 * @param onLog - Log callback
 * @param onPortDetected - Callback when port is detected
 * @param onProcessStopped - Callback when process is stopped
 * @returns { success: boolean; pid?: number; error?: string }
 */
export async function runApp(
  appId: string,
  installPath: string,
  runCommand: string | undefined,
  env: Record<string, string> | undefined,
  onLog: (message: string) => void,
  onPortDetected?: (port: number) => void,
  onProcessStopped?: () => void
): Promise<{ success: boolean; pid?: number; error?: string }> {
  try {
    // Check if already running
    if (runningProcesses.has(appId)) {
      return { success: false, error: i18n.t('apps:error.already_running') };
    }

    // Determine start command (use specified one, otherwise auto-detect)
    let commandToRun = runCommand;
    if (!commandToRun) {
      commandToRun = detectStartCommand(installPath);
    }

    if (!commandToRun) {
      return {
        success: false,
        error: i18n.t('apps:error.no_command'),
      };
    }

    // Parse command (safely split with shell-quote)
    const parsed = parseShellCommand(commandToRun);
    let commandArgs = parsed
      .filter((arg): arg is string => typeof arg === 'string')
      .map(arg => String(arg));

    if (commandArgs.length === 0) {
      return { success: false, error: i18n.t('apps:error.empty_command') };
    }

    // Handle cases where user already starts with "uv"
    let uvCommand = 'run'; // Default is uv run

    if (commandArgs[0] === 'uv') {
      if (commandArgs[1] === 'run') {
        // Remove "uv run" if included
        commandArgs = commandArgs.slice(2);
        onLog(i18n.t('apps:command.run', { command: commandArgs.join(' ') }));
      } else if (commandArgs[1] === 'x' || commandArgs[1] === '--with') {
        // If "uvx" or "uv x", use as-is (completely replace uv command)
        onLog(i18n.t('apps:command.run', { command: commandArgs.join(' ') }));
        const proc = spawn(getUvCommand(), commandArgs.slice(1), {
          cwd: installPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            ...env,
          },
        });
        // Common post-processing for proc
        return setupProcessHandlers(proc, appId, onLog, onPortDetected, onProcessStopped);
      } else {
        // Other uv subcommands (uv sync etc.) use as-is
        onLog(i18n.t('apps:command.run', { command: commandArgs.join(' ') }));
        const proc = spawn(getUvCommand(), commandArgs.slice(1), {
          cwd: installPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            ...env,
          },
        });
        return setupProcessHandlers(proc, appId, onLog, onPortDetected, onProcessStopped);
      }
    } else {
      onLog(i18n.t('apps:command.run', { command: commandArgs.join(' ') }));
    }

    // Execute command with uv run
    const proc = spawn(getUvCommand(), ['run', ...commandArgs], {
      cwd: installPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...env, // Add user-defined environment variables
      },
    });

    return setupProcessHandlers(proc, appId, onLog, onPortDetected, onProcessStopped);
  } catch (error) {
    return {
      success: false,
      error: i18n.t('apps:error.start_failed', { message: error instanceof Error ? error.message : String(error) }),
    };
  }
}

/**
 * Stop application
 * Force kill with SIGKILL after timeout following SIGTERM
 * @param appId - Application ID
 * @param onLog - Log callback
 * @returns { success: boolean; error?: string }
 */
export async function stopApp(
  appId: string,
  onLog: (message: string) => void
): Promise<{ success: boolean; error?: string }> {
  const processInfo = runningProcesses.get(appId);

  if (!processInfo) {
    return { success: false, error: i18n.t('apps:error.not_running') };
  }

  const proc = processInfo.process;

  if (!proc.pid) {
    return { success: false, error: i18n.t('apps:error.no_pid') };
  }

  // Stop health check polling
  stopHealthPolling(appId);

  // Prevent duplicate execution if already stopping
  if (stoppingProcesses.has(appId)) {
    return { success: false, error: i18n.t('apps:error.already_stopping') };
  }

  try {
    onLog(i18n.t('apps:process.stopping'));

    // First try graceful shutdown with SIGTERM (using tree-kill for entire process tree)
    await new Promise<void>((resolve, reject) => {
      kill(proc.pid!, 'SIGTERM', (error) => {
        if (error) {
          // Only warn as process may already be terminated
          onLog(i18n.t('apps:process.sigterm_warning', { message: error.message }));
        } else {
          onLog(i18n.t('apps:process.sigterm_sent', { pid: proc.pid }));
        }
        resolve();
      });
    });

    // Set timeout to force kill with SIGKILL after SIGKILL_TIMEOUT_MS
    // (Will be cleared by close/error event if process exits normally)
    const timeout = setTimeout(() => {
      // Only force kill if process still exists
      if (runningProcesses.has(appId) && proc.pid) {
        onLog(i18n.t('apps:process.force_kill'));
        kill(proc.pid, 'SIGKILL', (error) => {
          if (error) {
            onLog(i18n.t('apps:error.sigkill_error', { message: error.message }));
          } else {
            onLog(i18n.t('apps:process.force_killed'));
          }
          // Remove timeout record (fallback if not removed by close event)
          stoppingProcesses.delete(appId);
        });
      } else {
        // If process already terminated
        stoppingProcesses.delete(appId);
      }
    }, PROCESS.SIGKILL_TIMEOUT_MS);

    // Record timeout (so it can be cleared in close/error events)
    stoppingProcesses.set(appId, timeout);

    onLog(i18n.t('apps:process.stop_requested'));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: i18n.t('apps:error.stop_failed', { message: error instanceof Error ? error.message : String(error) }),
    };
  }
}

/**
 * Check if process is running
 * @param appId - Application ID
 * @returns true if running
 */
export function isRunning(appId: string): boolean {
  const processInfo = runningProcesses.get(appId);
  if (!processInfo) {
    return false;
  }

  // Actually verify if process is alive
  const proc = processInfo.process;
  if (!proc.pid) {
    return false;
  }

  return isProcessAlive(proc.pid);
}

/**
 * Get process health information
 * @param appId - Application ID
 * @returns Health information (null if process doesn't exist)
 */
export async function getAppHealth(appId: string): Promise<ProcessHealth | null> {
  const processInfo = runningProcesses.get(appId);
  if (!processInfo) {
    return null;
  }

  const proc = processInfo.process;
  if (!proc.pid) {
    return null;
  }

  return await getProcessHealth(proc.pid, processInfo.startTime);
}

/**
 * Get health information for all running apps
 * @returns Map of health information keyed by appId
 */
export async function getAllAppHealth(): Promise<Record<string, ProcessHealth>> {
  const healthMap: Record<string, ProcessHealth> = {};

  for (const [appId, processInfo] of runningProcesses.entries()) {
    const proc = processInfo.process;
    if (proc.pid) {
      healthMap[appId] = await getProcessHealth(proc.pid, processInfo.startTime);
    }
  }

  return healthMap;
}
