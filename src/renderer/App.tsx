import React, { useState, useEffect } from 'react';
import type { AppInfo, LogMessage } from '../shared/types';
import { Sidebar } from './components/Sidebar';
import { AppsView } from './components/AppsView';
import { LogsView } from './components/LogsView';
import { SettingsView } from './components/SettingsView';
import { InstallModal } from './components/InstallModal';
import { UpdateNotification } from './components/UpdateNotification';

type View = 'apps' | 'logs' | 'settings';

export function App() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [uvInstalled, setUvInstalled] = useState(false);
  const [uvInstalling, setUvInstalling] = useState(false);
  const [uvInstallError, setUvInstallError] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [currentView, setCurrentView] = useState<View>('apps');

  const loadApps = async () => {
    const appList = await window.electronAPI.listApps();
    setApps(appList);
  };

  const checkUvStatus = async () => {
    const result = await window.electronAPI.checkUv();
    setUvInstalled(result.installed);
  };

  useEffect(() => {
    loadApps();
    checkUvStatus();

    // Subscribe to log events
    const unsubscribeLog = window.electronAPI.onLog((log) => {
      setLogs((prev) => [...prev.slice(-99), log]);
    });

    // Subscribe to app update events (instead of polling)
    const unsubscribeAppUpdated = window.electronAPI.onAppUpdated((updatedApp) => {
      setApps((prev) => {
        const index = prev.findIndex((app) => app.id === updatedApp.id);
        if (index !== -1) {
          // Update existing app
          const newApps = [...prev];
          newApps[index] = updatedApp;
          return newApps;
        } else {
          // Add new app
          return [...prev, updatedApp];
        }
      });
    });

    return () => {
      unsubscribeLog();
      unsubscribeAppUpdated();
    };
  }, []);

  const handleInstallUv = async () => {
    setUvInstalling(true);
    setUvInstallError(null);
    try {
      const result = await window.electronAPI.installUv();
      if (!result.success) {
        setUvInstallError(result.error || 'Installation failed');
      } else {
        setUvInstallError(null);
      }
      await checkUvStatus();
    } finally {
      setUvInstalling(false);
    }
  };

  return (
    <div className="flex h-screen w-screen">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        uvInstalled={uvInstalled}
        uvInstalling={uvInstalling}
        onInstallUv={handleInstallUv}
        appsCount={apps.length}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-[60px] border-b border-border bg-bg-secondary flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold">
              {currentView === 'apps' ? 'Applications' : currentView === 'logs' ? 'Logs' : 'Settings'}
            </h1>
            {currentView === 'apps' && (
              <p className="text-xs text-text-secondary mt-0.5">{apps.length} installed</p>
            )}
          </div>
          {currentView === 'apps' && (
            <button
              onClick={() => setShowInstallModal(true)}
              disabled={!uvInstalled}
              className="px-4 py-2 bg-accent-blue text-white rounded flex items-center gap-1.5 hover:bg-accent-blue-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-base">+</span>
              New App
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto p-6">
          {currentView === 'apps' && <AppsView apps={apps} onUpdate={loadApps} />}
          {currentView === 'logs' && <LogsView logs={logs} apps={apps} />}
          {currentView === 'settings' && <SettingsView uvInstalled={uvInstalled} uvInstalling={uvInstalling} uvInstallError={uvInstallError} onInstallUv={handleInstallUv} />}
        </div>
      </main>

      {showInstallModal && (
        <InstallModal
          onClose={() => setShowInstallModal(false)}
          onInstall={() => {
            setShowInstallModal(false);
            loadApps();
          }}
        />
      )}

      {/* Auto-update notification (bottom-left) */}
      <UpdateNotification />
    </div>
  );
}
