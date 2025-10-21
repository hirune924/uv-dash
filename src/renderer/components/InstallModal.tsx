import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SourceType } from '../../shared/types';

interface InstallModalProps {
  onClose: () => void;
  onInstall: () => void;
}

export function InstallModal({ onClose, onInstall }: InstallModalProps) {
  const { t } = useTranslation('install');
  const [sourceType, setSourceType] = useState<SourceType>('local');
  const [sourcePath, setSourcePath] = useState('');
  const [ref, setRef] = useState('');
  const [subdir, setSubdir] = useState('');
  const [runCommand, setRunCommand] = useState('');
  const [hasGit, setHasGit] = useState<boolean>(true);
  const [checkingGit, setCheckingGit] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState(false);

  // Check if Git is installed
  useEffect(() => {
    const checkGit = async () => {
      try {
        const installed = await window.electronAPI.checkGit();
        setHasGit(installed);
      } catch (error) {
        console.error('Failed to check Git installation:', error);
        setHasGit(false);
      } finally {
        setCheckingGit(false);
      }
    };
    checkGit();
  }, []);

  const handleOpenGitDownload = async () => {
    await window.electronAPI.openGitDownload();
  };

  const handleBrowse = async () => {
    if (sourceType === 'local') {
      const path = await window.electronAPI.selectDirectory();
      if (path !== null) setSourcePath(path);
    } else if (sourceType === 'zip') {
      const path = await window.electronAPI.selectZipFile();
      if (path !== null) setSourcePath(path);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (sourceType === 'local' || sourceType === 'zip') {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (sourceType !== 'local' && sourceType !== 'zip') return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];

    // Use Electron's webUtils to get the real file path
    try {
      const path = window.getFilePath(file);

      // Auto-detect ZIP files and switch source type
      if (path.toLowerCase().endsWith('.zip')) {
        setSourceType('zip');
        setSourcePath(path);
      } else if (sourceType === 'local') {
        // Set directory path for local source
        setSourcePath(path);
      }
    } catch (error) {
      console.error('Failed to get file path:', error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Close modal immediately and continue installation in background
    onInstall();
    window.electronAPI.installApp({
      sourceType,
      sourcePath,
      ref: ref || undefined,
      subdir: subdir || undefined,
      runCommand: runCommand || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
    >
      <div
        className="fade-in bg-bg-secondary rounded-xl border border-border w-[520px] max-h-[80vh] overflow-auto shadow-2xl"
      >
        <div className="px-6 py-5 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-semibold">Install New App</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Source Type</label>
              <div className="flex gap-2">
                {(['local', 'zip', ...(hasGit ? ['github' as const] : [])] as SourceType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSourceType(type)}
                    className={`flex-1 py-2.5 rounded text-sm font-medium capitalize transition-colors ${
                      sourceType === type
                        ? 'bg-accent-blue text-white'
                        : 'bg-bg-tertiary text-text-secondary border border-border hover:bg-bg-hover'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              {!checkingGit && !hasGit && (
                <div className="mt-3 p-3 bg-yellow-600/10 border border-yellow-600/30 rounded">
                  <p className="text-yellow-600 text-sm mb-2">
                    {t('git.required')}
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenGitDownload}
                    className="px-3 py-1.5 bg-accent-blue text-white rounded text-xs hover:bg-accent-blue-hover transition-colors"
                  >
                    {t('git.install')}
                  </button>
                </div>
              )}
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <label className="block text-sm font-medium mb-2">
                {sourceType === 'local' ? 'Path' : 'URL'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sourcePath}
                  onChange={(e) => setSourcePath(e.target.value)}
                  required
                  placeholder={
                    sourceType === 'local' ? '/path/to/project' :
                    sourceType === 'github' ? 'https://github.com/user/repo' :
                    'https://example.com/app.zip'
                  }
                  className={`flex-1 px-3 py-2 bg-bg-tertiary text-text-primary border rounded text-sm focus:outline-none focus:border-border-focus transition-colors ${
                    isDragging ? 'border-accent-blue border-2' : 'border-border'
                  }`}
                />
                {(sourceType === 'local' || sourceType === 'zip') && (
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="px-4 py-2 bg-bg-tertiary text-text-secondary border border-border rounded hover:bg-bg-hover transition-colors text-sm"
                  >
                    Browse
                  </button>
                )}
              </div>
              {(sourceType === 'local' || sourceType === 'zip') && (
                <p className="text-[11px] text-text-tertiary mt-1.5">
                  💡 Drag and drop {sourceType === 'local' ? 'a folder' : 'a ZIP file'} here or click Browse
                </p>
              )}
            </div>

            {sourceType === 'github' && (
              <div>
                <label className="block text-sm font-medium mb-2">Branch/Tag (optional)</label>
                <input
                  type="text"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="main"
                  className="w-full px-3 py-2 bg-bg-tertiary text-text-primary border border-border rounded text-sm focus:outline-none focus:border-border-focus transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Subdirectory (optional)</label>
              <input
                type="text"
                value={subdir}
                onChange={(e) => setSubdir(e.target.value)}
                placeholder="packages/app"
                className="w-full px-3 py-2 bg-bg-tertiary text-text-primary border border-border rounded text-sm focus:outline-none focus:border-border-focus transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Run Command (optional)</label>
              <input
                type="text"
                value={runCommand}
                onChange={(e) => setRunCommand(e.target.value)}
                placeholder="python main.py"
                className="w-full px-3 py-2 bg-bg-tertiary text-text-primary border border-border rounded text-sm focus:outline-none focus:border-border-focus transition-colors"
              />
              <p className="text-[11px] text-text-tertiary mt-1.5">
                Command to run with `uv run`. Leave empty to auto-detect from pyproject.toml.
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-accent-blue text-white rounded hover:bg-accent-blue-hover transition-colors"
              >
                Install
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
