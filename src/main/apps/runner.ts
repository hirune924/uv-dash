import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parse as parseShellCommand } from 'shell-quote';
import kill from 'tree-kill';
import { PROCESS } from '../../shared/constants';
import { isProcessAlive, getProcessStats, ProcessStats } from './process-monitor';
import i18n from '../i18n';

/**
 * EventEmitter-based mock ChildProcess for recovered processes
 * Allows recovered processes to use the same event-driven cleanup as normal processes
 */
class RecoveredProcessHandle extends EventEmitter {
  public readonly pid: number;
  public readonly stdout = null;
  public readonly stderr = null;
  public readonly stdin = null;
  private watchInterval?: NodeJS.Timeout;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  /**
   * Start monitoring process existence and emit 'close' when it terminates
   */
  startWatch(intervalMs: number = 300): void {
    if (this.watchInterval) {
      return; // Already watching
    }

    this.watchInterval = setInterval(() => {
      if (!isProcessAlive(this.pid)) {
        this.stopWatch();
        // Emit close event (code/signal unknown for recovered processes)
        this.emit('close', null, null);
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopWatch(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = undefined;
    }
  }

  /**
   * Kill the process (delegates to tree-kill for proper tree termination)
   */
  kill(signal?: NodeJS.Signals | number): boolean {
    try {
      process.kill(this.pid, signal as NodeJS.Signals);
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Process execution information
 */
interface ProcessInfo {
  process: ChildProcess | RecoveredProcessHandle;
  startTime: number;
  appId: string;
  installPath: string;
  logPollInterval?: NodeJS.Timeout;
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
 * Polling timer for stats monitoring
 * Key: appId, Value: NodeJS.Timeout
 */
const statsMonitoringTimers = new Map<string, NodeJS.Timeout>();

/**
 * Stats monitoring polling interval (milliseconds)
 * Monitors CPU/memory usage and process liveness
 */
const STATS_MONITORING_INTERVAL_MS = 5000; // Every 5 seconds

/**
 * Get uv command path (prioritize app-installed version, fallback to system PATH)
 * On Windows, use uvw.exe to prevent console window from appearing
 */
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

/**
 * Get logs directory path
 * Uses app.getPath('userData') to ensure consistency with --user-data-dir in tests
 */
function getLogsDir(): string {
  const userDataPath = app.getPath('userData');
  const logsDir = path.join(userDataPath, 'logs');

  // Create directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  return logsDir;
}

/**
 * Common core cleanup: remove from tracking and stop polling
 * This is the shared cleanup logic used by multiple termination paths
 */
function cleanupProcessResources(appId: string): void {
  runningProcesses.delete(appId);
  stopLogPolling(appId);
  stopStatsMonitoring(appId);
}

/**
 * Common cleanup logic when a process terminates or becomes a zombie
 * Used by stats monitoring when detecting dead/zombie processes
 */
function cleanupTerminatedProcess(
  appId: string,
  reason: 'zombie' | 'terminated',
  pid: number,
  onLog: (message: string) => void,
  onProcessStopped?: () => void
): void {
  // Log appropriate message
  if (reason === 'zombie') {
    onLog(i18n.t('apps:process.zombie', { pid }));
  } else {
    onLog(i18n.t('apps:process.terminated', { pid }));
  }

  // Cleanup resources
  cleanupProcessResources(appId);

  // Notify caller
  if (typeof onProcessStopped === 'function') {
    onProcessStopped();
  }
}

/**
 * Start health check polling
 */
function startStatsMonitoring(
  appId: string,
  onLog: (message: string) => void,
  onProcessStopped?: () => void
): void {
  // Do nothing if already polling
  if (statsMonitoringTimers.has(appId)) {
    return;
  }

  const timer = setInterval(async () => {
    const processInfo = runningProcesses.get(appId);
    if (!processInfo) {
      // Stop polling if process info doesn't exist
      stopStatsMonitoring(appId);
      return;
    }

    const { process: proc, startTime } = processInfo;
    if (!proc.pid) {
      return;
    }

    // Check process health
    const health = await getProcessStats(proc.pid, startTime);

    // If zombie process is detected
    if (health.status === 'zombie') {
      cleanupTerminatedProcess(appId, 'zombie', proc.pid, onLog, onProcessStopped);
      return;
    }

    // If process is dead (still in Map but PID is invalid)
    if (!health.isAlive) {
      cleanupTerminatedProcess(appId, 'terminated', proc.pid, onLog, onProcessStopped);
      return;
    }
  }, STATS_MONITORING_INTERVAL_MS);

  statsMonitoringTimers.set(appId, timer);
}

/**
 * Stop health check polling
 */
function stopStatsMonitoring(appId: string): void {
  const timer = statsMonitoringTimers.get(appId);
  if (timer) {
    clearInterval(timer);
    statsMonitoringTimers.delete(appId);
  }
}

/**
 * Start log file polling for real-time log display and port detection
 */
function startLogPolling(
  appId: string,
  logFilePath: string,
  onLog: (message: string) => void,
  onPortDetected?: (port: number) => void
): NodeJS.Timeout {
  let lastPosition = 0;

  const pollInterval = setInterval(() => {
    try {
      if (!fs.existsSync(logFilePath)) {
        return;
      }

      const stats = fs.statSync(logFilePath);
      if (stats.size > lastPosition) {
        const stream = fs.createReadStream(logFilePath, {
          start: lastPosition,
          end: stats.size,
          encoding: 'utf-8',
        });

        let buffer = '';
        stream.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';

          lines.forEach((line) => {
            if (line.trim()) {
              onLog(line);

              // Detect port from log
              if (onPortDetected) {
                const port = detectPortFromLog(line);
                if (port) {
                  onPortDetected(port);
                }
              }
            }
          });
        });

        stream.on('end', () => {
          lastPosition = stats.size;
        });
      }
    } catch (error) {
      // Silently ignore errors (e.g., file being written to)
    }
  }, 1000); // Poll every 1 second

  return pollInterval;
}

/**
 * Stop log file polling
 */
function stopLogPolling(appId: string): void {
  const processInfo = runningProcesses.get(appId);
  if (processInfo?.logPollInterval) {
    clearInterval(processInfo.logPollInterval);
    processInfo.logPollInterval = undefined;
  }
}

/**
 * Set up process event handlers (common processing)
 * Works for both normal ChildProcess and RecoveredProcessHandle
 * @param proc - Target ChildProcess or RecoveredProcessHandle
 * @param appId - Application ID
 * @param installPath - Installation directory path
 * @param onLog - Log callback
 * @param onPortDetected - Callback when port is detected (optional)
 * @param onProcessStopped - Callback when process is stopped (optional)
 * @param logFilePath - Path to log file for polling (optional, for new processes)
 * @returns { success: boolean; pid?: number }
 */
function setupProcessHandlers(
  proc: ChildProcess | RecoveredProcessHandle,
  appId: string,
  installPath: string,
  onLog: (message: string) => void,
  onPortDetected?: (port: number) => void,
  onProcessStopped?: () => void,
  logFilePath?: string
): { success: boolean; pid?: number } {
  // Note: We no longer use proc.stdout/stderr.on('data') because logs are redirected to file
  // Instead, we poll the log file for real-time updates
  // This works with detached: true on all platforms including Windows

  proc.on('error', (error) => {
    onLog(i18n.t('apps:error.process', { error: error.message }));

    const processInfo = runningProcesses.get(appId);
    runningProcesses.delete(appId);

    // Clear timeout if set
    const timeout = stoppingProcesses.get(appId);
    if (timeout) {
      clearTimeout(timeout);
      stoppingProcesses.delete(appId);
    }

    // Stop polling
    stopStatsMonitoring(appId);
    stopLogPolling(appId);

    // Stop watching if this is a RecoveredProcessHandle
    if (proc instanceof RecoveredProcessHandle) {
      proc.stopWatch();
    }

    if (typeof onProcessStopped === 'function') {
      onProcessStopped();
    }
  });

  proc.on('close', (code, signal) => {
    onLog(i18n.t('apps:process.exited', { code }));

    // Clear timeout if set (for forced shutdown)
    const timeout = stoppingProcesses.get(appId);
    if (timeout) {
      clearTimeout(timeout);
      stoppingProcesses.delete(appId);
    }

    // Stop watching if this is a RecoveredProcessHandle
    if (proc instanceof RecoveredProcessHandle) {
      proc.stopWatch();
    }

    // Common cleanup: remove from tracking and stop polling
    cleanupProcessResources(appId);

    if (typeof onProcessStopped === 'function') {
      onProcessStopped();
    }
  });

  // Register process (with metadata)
  const processInfo: ProcessInfo = {
    process: proc,
    startTime: Date.now(),
    appId,
    installPath,
  };
  runningProcesses.set(appId, processInfo);

  // Start log file polling if log file path is provided (for new processes)
  if (logFilePath) {
    const logPollInterval = startLogPolling(appId, logFilePath, onLog, onPortDetected);
    processInfo.logPollInterval = logPollInterval;
  }

  // Start health check polling
  startStatsMonitoring(appId, onLog, onProcessStopped);

  // Start watching for process termination (RecoveredProcessHandle only)
  if (proc instanceof RecoveredProcessHandle) {
    proc.startWatch();
  }

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
        const uvCmd = getUvCommand();

        // Create log file for this app
        const logsDir = getLogsDir();
        const logFile = path.join(logsDir, `${appId}.log`);
        const logFd = fs.openSync(logFile, 'a');

        const proc = spawn(uvCmd, commandArgs.slice(1), {
          cwd: installPath,
          stdio: ['ignore', logFd, logFd],
          detached: true,
          windowsHide: true,
          windowsVerbatimArguments: false,
          shell: false,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            ...env,
          },
        });

        // Close our file descriptor (child process has its own copy)
        fs.close(logFd, (err) => {
          if (err) console.error('[runner] Failed to close log fd:', err);
        });

        return setupProcessHandlers(proc, appId, installPath, onLog, onPortDetected, onProcessStopped, logFile);
      } else {
        // Other uv subcommands (uv sync etc.) use as-is
        onLog(i18n.t('apps:command.run', { command: commandArgs.join(' ') }));
        const uvCmd = getUvCommand();

        // Create log file for this app
        const logsDir = getLogsDir();
        const logFile = path.join(logsDir, `${appId}.log`);
        const logFd = fs.openSync(logFile, 'a');

        const proc = spawn(uvCmd, commandArgs.slice(1), {
          cwd: installPath,
          stdio: ['ignore', logFd, logFd],
          detached: true,
          windowsHide: true,
          windowsVerbatimArguments: false,
          shell: false,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            ...env,
          },
        });

        // Close our file descriptor (child process has its own copy)
        fs.close(logFd, (err) => {
          if (err) console.error('[runner] Failed to close log fd:', err);
        });

        return setupProcessHandlers(proc, appId, installPath, onLog, onPortDetected, onProcessStopped, logFile);
      }
    } else {
      onLog(i18n.t('apps:command.run', { command: commandArgs.join(' ') }));
    }

    const uvCmd = getUvCommand();

    // Create log file for this app
    const logsDir = getLogsDir();
    const logFile = path.join(logsDir, `${appId}.log`);
    const logFd = fs.openSync(logFile, 'a');

    // Execute command with uv run
    const proc = spawn(uvCmd, ['run', ...commandArgs], {
      cwd: installPath,
      stdio: ['ignore', logFd, logFd],
      detached: true,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        ...env,
      },
    });

    // Close our file descriptor (child process has its own copy)
    fs.close(logFd, (err) => {
      if (err) console.error('[runner] Failed to close log fd:', err);
    });

    return setupProcessHandlers(proc, appId, installPath, onLog, onPortDetected, onProcessStopped, logFile);
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

  // Prevent duplicate execution if already stopping
  if (stoppingProcesses.has(appId)) {
    return { success: false, error: i18n.t('apps:error.already_stopping') };
  }

  // Stop health check polling
  stopStatsMonitoring(appId);

  try {
    onLog(i18n.t('apps:process.stopping'));

    // On Windows, tree-kill always uses taskkill /F (force kill) regardless of signal
    // So we can't do graceful shutdown on Windows - it's always immediate force kill
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: Give app time to flush logs before force kill
      // This is critical for Flask to output port info before termination
      onLog('Waiting for app to flush logs...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Windows: Just kill immediately (tree-kill will use taskkill /T /F)
      await new Promise<void>((resolve) => {
        kill(proc.pid!, 'SIGTERM', (error) => {
          if (error) {
            onLog(i18n.t('apps:process.sigterm_warning', { message: error.message }));
          } else {
            onLog(i18n.t('apps:process.sigterm_sent', { pid: proc.pid }));
          }
          resolve();
        });
      });

      onLog(i18n.t('apps:process.stop_requested'));
      return { success: true };
    }

    // Unix/macOS: Two-stage shutdown (graceful SIGTERM, then force SIGKILL after timeout)
    await new Promise<void>((resolve) => {
      kill(proc.pid!, 'SIGTERM', (error) => {
        if (error) {
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
        // If process already terminated, just clean up
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
 * Recover a process that survived application restart
 * Creates an EventEmitter-based mock to enable event-driven process management
 * Also continues tailing the log file for new output from the recovered process
 * @param appId - Application ID
 * @param pid - Process ID
 * @param installPath - Installation path
 * @param onLog - Log callback
 * @param onPortDetected - Callback when port is detected (optional)
 * @param onProcessStopped - Callback when process is stopped
 */
export function recoverProcess(
  appId: string,
  pid: number,
  installPath: string,
  onLog: (message: string) => void,
  onPortDetected?: (port: number) => void,
  onProcessStopped?: () => void
): void {
  // Load existing logs from file if available
  const logsDir = getLogsDir();
  const logFile = path.join(logsDir, `${appId}.log`);

  if (fs.existsSync(logFile)) {
    try {
      onLog('[Recovery] Loading previous logs from file...');
      const existingLogs = fs.readFileSync(logFile, 'utf-8');
      const lines = existingLogs.split('\n');

      // Send existing logs to UI
      lines.forEach((line) => {
        if (line.trim()) {
          onLog(line);
        }
      });

      onLog('[Recovery] Previous logs loaded successfully');
    } catch (error) {
      onLog(`[Recovery] Warning: Failed to load previous logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    onLog('[Recovery] No previous log file found');
  }

  // Create EventEmitter-based mock that can emit 'close' events
  const recoveredHandle = new RecoveredProcessHandle(pid);

  // Use the same setupProcessHandlers as normal processes
  // This ensures uniform event-driven cleanup for both normal and recovered processes
  // Pass logFilePath to continue tailing the log file for new output
  setupProcessHandlers(recoveredHandle, appId, installPath, onLog, onPortDetected, onProcessStopped, logFile);

  console.log(`[runner] Recovered process for app ${appId} with PID ${pid}`);
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
export async function getAppHealth(appId: string): Promise<ProcessStats | null> {
  const processInfo = runningProcesses.get(appId);
  if (!processInfo) {
    return null;
  }

  const proc = processInfo.process;
  if (!proc.pid) {
    return null;
  }

  return await getProcessStats(proc.pid, processInfo.startTime);
}

/**
 * Get health information for all running apps
 * @returns Map of health information keyed by appId
 */
export async function getAllAppHealth(): Promise<Record<string, ProcessStats>> {
  const healthMap: Record<string, ProcessStats> = {};

  for (const [appId, processInfo] of runningProcesses.entries()) {
    const proc = processInfo.process;
    if (proc.pid) {
      healthMap[appId] = await getProcessStats(proc.pid, processInfo.startTime);
    }
  }

  return healthMap;
}
