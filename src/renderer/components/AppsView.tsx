import React, { useState, useEffect } from 'react';
import type { AppInfo, ProcessHealth } from '../../shared/types';
import { UI } from '../../shared/constants';
import { EditAppModal } from './EditAppModal';
import { AddEnvVarModal } from './AddEnvVarModal';

interface AppsViewProps {
  apps: AppInfo[];
  onUpdate: () => void;
}

export function AppsView({ apps, onUpdate }: AppsViewProps) {
  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary">
        <div className="text-5xl mb-4">📦</div>
        <p className="text-base font-medium mb-2">No apps installed</p>
        <p className="text-sm">Click "New App" to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
      {apps.map((app) => (
        <AppCard key={app.id} app={app} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

interface AppCardProps {
  app: AppInfo;
  onUpdate: () => void;
}

export function AppCard({ app, onUpdate }: AppCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [editName, setEditName] = useState(app.name);
  const [editCommand, setEditCommand] = useState(app.runCommand || '');
  const [editEnv, setEditEnv] = useState<Record<string, string>>(app.env || {});
  const [editSecrets, setEditSecrets] = useState<Record<string, string>>(app.secrets || {});
  const [editSecretRefs, setEditSecretRefs] = useState<Record<string, string>>(app.secretRefs || {});
  const [showAddVarModal, setShowAddVarModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [isAddingSecret, setIsAddingSecret] = useState(false);
  const [health, setHealth] = useState<ProcessHealth | null>(null);

  // Poll health info (only when running)
  useEffect(() => {
    if (app.status !== 'running') {
      setHealth(null);
      return;
    }

    const fetchHealth = async () => {
      try {
        const healthData = await window.electronAPI.getAppHealth(app.id);
        setHealth(healthData);
      } catch (error) {
        console.error('Failed to fetch health:', error);
      }
    };

    // Initial fetch
    fetchHealth();

    // Poll every 5 seconds
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, [app.status, app.id]);

  const handleRun = async () => {
    await window.electronAPI.runApp(app.id);
    onUpdate();
  };

  const handleStop = async () => {
    await window.electronAPI.stopApp(app.id);
    onUpdate();
  };

  const handleRemove = async () => {
    if (confirm(`Delete "${app.name}"?`)) {
      await window.electronAPI.removeApp(app.id);
      onUpdate();
    }
  };

  const handleOpenBrowser = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await window.electronAPI.openInBrowser(app.id);
  };

  const handleCopyUrl = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (app.port) {
      const url = `http://localhost:${app.port}`;
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), UI.URL_COPIED_DISPLAY_MS);
    }
  };

  const handleSaveEdit = async (
    newEnv?: Record<string, string>,
    newSecrets?: Record<string, string>,
    newSecretRefs?: Record<string, string>
  ) => {
    // Backend handles: undefined = don't change, {} = clear field
    await window.electronAPI.updateApp(app.id, {
      name: editName,
      runCommand: editCommand || undefined,
      env: newEnv,
      secrets: newSecrets,
      secretRefs: newSecretRefs,
    });
    setEditModalOpened(false);
    onUpdate();
  };

  const handleAddEnvVar = (e: React.MouseEvent, isSecret: boolean = false) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAddingSecret(isSecret);
    setNewVarName('');
    setShowAddVarModal(true);
  };

  const handleConfirmAddVar = () => {
    if (newVarName && newVarName.trim()) {
      if (isAddingSecret) {
        setEditSecrets({ ...editSecrets, [newVarName.trim()]: '' });
      } else {
        setEditEnv({ ...editEnv, [newVarName.trim()]: '' });
      }
    }
    setShowAddVarModal(false);
    setNewVarName('');
  };

  const handleRemoveEnvVar = (e: React.MouseEvent, key: string, isSecret: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSecret) {
      const newSecrets = { ...editSecrets };
      delete newSecrets[key];
      setEditSecrets(newSecrets);
    } else {
      const newEnv = { ...editEnv };
      delete newEnv[key];
      setEditEnv(newEnv);
    }
  };

  const handleEnvValueChange = (key: string, value: string, isSecret: boolean) => {
    if (isSecret) {
      setEditSecrets({ ...editSecrets, [key]: value });
    } else {
      setEditEnv({ ...editEnv, [key]: value });
    }
  };

  const statusConfig = {
    not_installed: { color: 'bg-text-secondary', label: 'Not Installed' },
    installing: { color: 'bg-status-installing', label: 'Installing...' },
    installed: { color: 'bg-status-installed', label: 'Ready' },
    running: { color: 'bg-status-running', label: 'Running' },
    error: { color: 'bg-status-error', label: 'Error' },
  }[app.status];

  return (
    <>
      <div
        className="fade-in bg-bg-secondary rounded-lg border border-border p-5 flex flex-col gap-3 transition-all hover:border-border-focus"
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => setShowMenu(false)}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-base font-semibold mb-1.5">{app.name}</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
              <span className="text-xs text-text-secondary">{statusConfig.label}</span>
            </div>
          </div>

          {app.status !== 'installing' && (
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setEditName(app.name);
                  setEditCommand(app.runCommand || '');
                  setEditEnv(app.env || {});
                  setEditSecrets(app.secrets || {});
                  setEditSecretRefs(app.secretRefs || {});
                  setEditModalOpened(true);
                }}
                className="px-2 py-1 bg-bg-tertiary hover:bg-bg-hover text-text-secondary rounded text-xs transition-colors"
                title="Edit"
              >
                ✏️
              </button>
              {app.status === 'running' && app.port && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenBrowser(e as any);
                  }}
                  className="px-3 py-1 bg-accent-blue hover:bg-accent-blue-hover text-white rounded text-xs transition-colors cursor-pointer"
                  title={`Open localhost:${app.port}`}
                >
                  🌐 Open
                </button>
              )}
              {app.status === 'installed' && (
                <button
                  onClick={handleRun}
                  className="px-3 py-1 bg-accent-green hover:bg-accent-green-hover text-white rounded text-xs transition-colors"
                >
                  Run
                </button>
              )}
              {app.status === 'running' && (
                <button
                  onClick={handleStop}
                  className="px-3 py-1 bg-accent-red hover:opacity-90 text-white rounded text-xs transition-opacity"
                >
                  Stop
                </button>
              )}
              <button
                onClick={handleRemove}
                className="px-3 py-1 bg-bg-tertiary hover:bg-bg-hover text-text-secondary rounded text-xs transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="text-xs text-text-tertiary font-mono space-y-1">
          <div>
            <span className="text-text-secondary">Source:</span> {app.sourcePath}
          </div>
          {app.installPath && (
            <div>
              <span className="text-text-secondary">Install:</span> {app.installPath}
            </div>
          )}
          {app.runCommand && (
            <div>
              <span className="text-text-secondary">Command:</span> uv run {app.runCommand}
            </div>
          )}
          {app.port && (
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">URL:</span>
              <button
                onClick={handleCopyUrl}
                className="text-accent-blue hover:text-accent-blue-hover transition-colors cursor-pointer flex items-center gap-1"
                title="Click to copy URL"
              >
                http://localhost:{app.port}
                {urlCopied ? (
                  <span className="text-[10px] text-status-running">✓ Copied</span>
                ) : (
                  <span className="text-[10px]">📋</span>
                )}
              </button>
            </div>
          )}
          {((app.env && Object.keys(app.env).length > 0) || (app.secrets && Object.keys(app.secrets).length > 0) || (app.secretRefs && Object.keys(app.secretRefs).length > 0)) && (
            <div>
              <span className="text-text-secondary">Env vars:</span>{' '}
              {(app.env ? Object.keys(app.env).length : 0) + (app.secrets ? Object.keys(app.secrets).length : 0) + (app.secretRefs ? Object.keys(app.secretRefs).length : 0)} configured
              {app.secrets && Object.keys(app.secrets).length > 0 && (
                <span className="text-[10px] ml-1 text-status-error">🔒 {Object.keys(app.secrets).length} secret(s)</span>
              )}
              {app.secretRefs && Object.keys(app.secretRefs).length > 0 && (
                <span className="text-[10px] ml-1 text-accent-blue">📦 {Object.keys(app.secretRefs).length} global</span>
              )}
            </div>
          )}
          {app.status === 'running' && app.pid && (
            <div className="flex items-center gap-2 pt-1 border-t border-border-focus/30 mt-1">
              <span className="text-text-secondary">Process:</span>
              <span className="text-[11px]">
                PID {app.pid} •{' '}
                {health ? (
                  <>
                    {health.status === 'running' && <span className="text-status-running">✓ Alive</span>}
                    {health.status === 'zombie' && <span className="text-status-error">⚠ Zombie</span>}
                    {health.status === 'unknown' && <span className="text-status-installing">? Unknown</span>}
                  </>
                ) : (
                  <span className="text-text-tertiary">...</span>
                )}
              </span>
            </div>
          )}
        </div>

        {app.errorMessage && (
          <div className="p-2 bg-bg-tertiary rounded border-l-2 border-status-error text-xs text-status-error">
            {app.errorMessage}
          </div>
        )}
      </div>

      {editModalOpened && (
        <EditAppModal
          editName={editName}
          editCommand={editCommand}
          editEnv={editEnv}
          editSecrets={editSecrets}
          editSecretRefs={editSecretRefs}
          onNameChange={setEditName}
          onCommandChange={setEditCommand}
          onSave={handleSaveEdit}
          onClose={() => setEditModalOpened(false)}
        />
      )}

      {showAddVarModal && (
        <AddEnvVarModal
          isAddingSecret={isAddingSecret}
          newVarName={newVarName}
          onVarNameChange={setNewVarName}
          onConfirm={handleConfirmAddVar}
          onClose={() => setShowAddVarModal(false)}
        />
      )}
    </>
  );
}
