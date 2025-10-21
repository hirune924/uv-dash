import React, { useEffect, useState } from 'react';
import type { UpdateInfo, DownloadProgress } from '../../shared/types';

type UpdateState =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'downloading'; progress: DownloadProgress }
  | { type: 'ready'; info: UpdateInfo }
  | { type: 'error'; message: string };

export function UpdateNotification() {
  const [updateState, setUpdateState] = useState<UpdateState>({ type: 'idle' });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Subscribe to update events
    const unsubChecking = window.electronAPI.onUpdateChecking(() => {
      // Don't show notification while checking - too intrusive
      setUpdateState({ type: 'checking' });
    });

    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      // Show notification when update is available
      setUpdateState({ type: 'available', info });
      setIsVisible(true);
    });

    const unsubNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      // No notification needed - silently reset
      setUpdateState({ type: 'idle' });
    });

    const unsubDownloading = window.electronAPI.onUpdateDownloading((progress) => {
      // Show notification during download
      setUpdateState({ type: 'downloading', progress });
      setIsVisible(true);
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      // Show notification when ready to install
      setUpdateState({ type: 'ready', info });
      setIsVisible(true);
    });

    const unsubError = window.electronAPI.onUpdateError((error) => {
      // Don't show error notification - just log it
      console.error('[Update Error]', error.message);
      setUpdateState({ type: 'idle' });
    });

    // Cleanup
    return () => {
      unsubChecking();
      unsubAvailable();
      unsubNotAvailable();
      unsubDownloading();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => setUpdateState({ type: 'idle' }), 300);
  };

  const handleRestartNow = async () => {
    await window.electronAPI.quitAndInstall();
  };

  // Don't render if not visible
  if (!isVisible || updateState.type === 'idle') {
    return null;
  }

  // Render based on state
  return (
    <div
      className={`fixed bottom-4 left-4 z-50 transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ width: '320px' }}
    >
      <div className="bg-bg-primary border border-border-default rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
          <div className="flex items-center gap-2">
            {updateState.type === 'checking' && (
              <>
                <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-text-primary">Checking for updates...</span>
              </>
            )}
            {updateState.type === 'available' && (
              <>
                <span className="text-lg">🔄</span>
                <span className="text-sm font-medium text-text-primary">Update Available</span>
              </>
            )}
            {updateState.type === 'downloading' && (
              <>
                <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium text-text-primary">Downloading...</span>
              </>
            )}
            {updateState.type === 'ready' && (
              <>
                <span className="text-lg">✅</span>
                <span className="text-sm font-medium text-text-primary">Update Ready</span>
              </>
            )}
            {updateState.type === 'error' && (
              <>
                <span className="text-lg">⚠️</span>
                <span className="text-sm font-medium text-status-error">Update Error</span>
              </>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-text-secondary hover:text-text-primary transition-colors"
            title="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3">
          {updateState.type === 'available' && (
            <p className="text-sm text-text-secondary">
              Version {updateState.info.version} is available.
              <br />
              Downloading in the background...
            </p>
          )}

          {updateState.type === 'downloading' && (
            <div className="space-y-2">
              <div className="w-full bg-bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent-primary h-full transition-all duration-300"
                  style={{ width: `${updateState.progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-text-secondary">
                {updateState.progress.percent.toFixed(1)}% •{' '}
                {(updateState.progress.transferred / 1024 / 1024).toFixed(1)} MB /{' '}
                {(updateState.progress.total / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          )}

          {updateState.type === 'ready' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Version {updateState.info.version} is ready to install.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRestartNow}
                  className="flex-1 px-3 py-2 bg-accent-primary text-white rounded-md text-sm font-medium hover:bg-accent-primary/90 transition-colors"
                >
                  Restart Now
                </button>
                <button
                  onClick={handleDismiss}
                  className="flex-1 px-3 py-2 bg-bg-secondary text-text-primary rounded-md text-sm font-medium hover:bg-bg-tertiary transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {updateState.type === 'error' && (
            <p className="text-sm text-status-error">
              {updateState.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
