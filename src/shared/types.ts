/**
 * Application status
 */
export type AppStatus = 'not_installed' | 'installing' | 'installed' | 'running' | 'error';

/**
 * Source type
 */
export type SourceType = 'zip' | 'github' | 'local';

/**
 * Common response type
 */
export interface OperationResult {
  success: boolean;
  error?: string;
}

/**
 * Global secret
 */
export interface GlobalSecret {
  id: string; // UUID
  name: string; // Display name (e.g., "OpenAI API Key")
  value: string; // Encrypted value
  description?: string; // Description (optional)
  createdAt: number;
  updatedAt: number;
}

/**
 * Application information
 */
export interface AppInfo {
  id: string;
  name: string;
  status: AppStatus;
  sourcePath: string; // ZIP/GitHub URL/local path
  sourceType: SourceType;
  installPath?: string; // Installation destination
  runCommand?: string; // Run command (e.g., "python main.py", "start", etc.)
  env?: Record<string, string>; // Environment variables (plain text)
  secrets?: Record<string, string>; // Sensitive information (stored encrypted) - kept for backward compatibility
  secretRefs?: Record<string, string>; // Reference to global secrets (environment variable name → Secret ID)
  errorMessage?: string;
  pid?: number; // Running process ID
  port?: number; // Port number for web apps
}

/**
 * Installation request
 */
export interface InstallRequest {
  sourceType: SourceType;
  sourcePath: string; // ZIP URL, GitHub URL, or local path
  ref?: string; // Branch/tag/commit for GitHub
  subdir?: string; // Monorepo support
  runCommand?: string; // Run command (auto-detection attempted if omitted)
}

/**
 * Log message
 */
export interface LogMessage {
  appId: string;
  timestamp: number;
  level: 'info' | 'error' | 'warning';
  message: string;
}

/**
 * Process stats (CPU, memory, liveness)
 * @deprecated Use ProcessStats from process-monitor.ts
 */
export interface ProcessHealth {
  pid: number;
  isAlive: boolean;
  memoryUsage?: number; // MB
  cpuUsage?: number; // %
  startTime: number; // Unix timestamp
  lastChecked: number; // Unix timestamp
  status: 'running' | 'zombie' | 'unknown';
}

// Type alias for backward compatibility
export type { ProcessHealth as ProcessStats };

/**
 * Update information
 */
export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

// Electron API type definition (used on renderer side)
export interface ElectronAPI {
  // App management
  listApps: () => Promise<AppInfo[]>;
  installApp: (request: InstallRequest) => Promise<{ success: boolean; appId?: string; error?: string }>;
  updateApp: (appId: string, updates: Partial<Pick<AppInfo, 'name' | 'runCommand' | 'env' | 'secrets' | 'secretRefs'>>) => Promise<{ success: boolean; error?: string }>;
  runApp: (appId: string) => Promise<{ success: boolean; error?: string }>;
  stopApp: (appId: string) => Promise<{ success: boolean; error?: string }>;
  removeApp: (appId: string) => Promise<{ success: boolean; error?: string }>;
  openInBrowser: (appId: string) => Promise<{ success: boolean; error?: string }>;

  // Global secrets management
  listGlobalSecrets: () => Promise<GlobalSecret[]>;
  createGlobalSecret: (secret: Omit<GlobalSecret, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; secretId?: string; error?: string }>;
  updateGlobalSecret: (secretId: string, updates: Partial<Pick<GlobalSecret, 'name' | 'value' | 'description'>>) => Promise<{ success: boolean; error?: string }>;
  deleteGlobalSecret: (secretId: string) => Promise<{ success: boolean; error?: string }>;
  getSecretUsage: (secretId: string) => Promise<{ appIds: string[] }>; // Which apps are using this secret

  // Event subscriptions
  onLog: (callback: (log: LogMessage) => void) => () => void;
  onAppUpdated: (callback: (app: AppInfo) => void) => () => void; // App state change event

  // Auto-updater events
  onUpdateChecking: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateDownloading: (callback: (progress: DownloadProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;

  // UV management
  checkUv: () => Promise<{ installed: boolean; version?: string }>;
  installUv: () => Promise<{ success: boolean; error?: string }>;
  updateUv: () => Promise<{ success: boolean; error?: string }>;
  listPythonVersions: () => Promise<{ success: boolean; versions?: string[]; error?: string }>;
  installPythonVersion: (version: string) => Promise<{ success: boolean; error?: string }>;

  // Git management
  checkGit: () => Promise<boolean>;
  getGitVersion: () => Promise<string | null>;
  getGitDownloadUrl: () => Promise<string>;
  openGitDownload: () => Promise<void>;

  // File dialogs
  selectDirectory: () => Promise<string | null>;
  selectZipFile: () => Promise<string | null>;

  // Process health monitoring
  getAppHealth: (appId: string) => Promise<ProcessHealth | null>;
  getAllAppHealth: () => Promise<Record<string, ProcessHealth>>;

  // Language switching
  changeLanguage: (lng: string) => Promise<{ success: boolean }>;

  // Auto-updater
  checkForUpdates: () => Promise<void>;
  quitAndInstall: () => Promise<void>;

  // Advanced Settings
  cleanupOrphanedDirs: () => Promise<{ success: boolean; count?: number; error?: string }>;
  getAppsDirectory: () => Promise<string>;
  setAppsDirectory: (directory: string) => Promise<{ success: boolean; error?: string }>;

  // Utility
  openExternal: (url: string) => Promise<void>;
}

// Window type extension
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    getFilePath: (file: File) => string;
  }
}
