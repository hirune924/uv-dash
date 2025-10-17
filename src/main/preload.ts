import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronAPI } from '../shared/types';

// API exposed to renderer process
const electronAPI: ElectronAPI = {
  // App management
  listApps: () => ipcRenderer.invoke('list-apps'),
  installApp: (request) => ipcRenderer.invoke('install-app', request),
  updateApp: (appId, updates) => ipcRenderer.invoke('update-app', appId, updates),
  runApp: (appId) => ipcRenderer.invoke('run-app', appId),
  stopApp: (appId) => ipcRenderer.invoke('stop-app', appId),
  removeApp: (appId) => ipcRenderer.invoke('remove-app', appId),
  openInBrowser: (appId) => ipcRenderer.invoke('open-in-browser', appId),

  // Event subscriptions
  onLog: (callback) => {
    const subscription = (_event: any, log: any) => callback(log);
    ipcRenderer.on('log', subscription);
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('log', subscription);
    };
  },

  onAppUpdated: (callback) => {
    const subscription = (_event: any, app: any) => callback(app);
    ipcRenderer.on('app-updated', subscription);
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('app-updated', subscription);
    };
  },

  // Global secrets management
  listGlobalSecrets: () => ipcRenderer.invoke('list-global-secrets'),
  createGlobalSecret: (secret) => ipcRenderer.invoke('create-global-secret', secret),
  updateGlobalSecret: (secretId, updates) => ipcRenderer.invoke('update-global-secret', secretId, updates),
  deleteGlobalSecret: (secretId) => ipcRenderer.invoke('delete-global-secret', secretId),
  getSecretUsage: (secretId) => ipcRenderer.invoke('get-secret-usage', secretId),

  // UV management
  checkUv: () => ipcRenderer.invoke('check-uv'),
  installUv: () => ipcRenderer.invoke('install-uv'),

  // Git management
  checkGit: () => ipcRenderer.invoke('check-git'),
  getGitVersion: () => ipcRenderer.invoke('get-git-version'),
  getGitDownloadUrl: () => ipcRenderer.invoke('get-git-download-url'),
  openGitDownload: () => ipcRenderer.invoke('open-git-download'),

  // File dialogs
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectZipFile: () => ipcRenderer.invoke('select-zip-file'),

  // Process health monitoring
  getAppHealth: (appId) => ipcRenderer.invoke('get-app-health', appId),
  getAllAppHealth: () => ipcRenderer.invoke('get-all-app-health'),

  // Language switching
  changeLanguage: (lng) => ipcRenderer.invoke('change-language', lng),

  // Utility
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Expose webUtils for drag and drop file path extraction
contextBridge.exposeInMainWorld('getFilePath', (file: File) => {
  return webUtils.getPathForFile(file);
});
