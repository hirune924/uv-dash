import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GlobalSecret } from '../../shared/types';

interface SettingsViewProps {
  uvInstalled: boolean;
  uvInstalling: boolean;
  uvInstallError: string | null;
  onInstallUv: () => void;
}

export function SettingsView({ uvInstalled, uvInstalling, uvInstallError, onInstallUv }: SettingsViewProps) {
  const { t, i18n } = useTranslation('settings');
  const [secrets, setSecrets] = useState<GlobalSecret[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSecret, setEditingSecret] = useState<GlobalSecret | null>(null);
  const [secretForm, setSecretForm] = useState({
    name: '',
    value: '',
    description: '',
  });

  // Advanced Settings state
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [appsDirectory, setAppsDirectory] = useState<string>('');
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);

  // Python version state
  const [pythonVersions, setPythonVersions] = useState<string[]>([]);
  const [selectedPythonVersion, setSelectedPythonVersion] = useState<string>('3.13');
  const [pythonVersionLoading, setPythonVersionLoading] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Load secrets list
  const loadSecrets = async () => {
    const result = await window.electronAPI.listGlobalSecrets();
    setSecrets(result);
  };

  // Load apps directory
  const loadAppsDirectory = async () => {
    const dir = await window.electronAPI.getAppsDirectory();
    setAppsDirectory(dir);
  };

  // Load Python versions
  const loadPythonVersions = async () => {
    setLoadingVersions(true);
    try {
      const result = await window.electronAPI.listPythonVersions();
      if (result.success && result.versions) {
        setPythonVersions(result.versions);
        // Set default to 3.13 if available, otherwise first version
        if (result.versions.includes('3.13')) {
          setSelectedPythonVersion('3.13');
        } else if (result.versions.length > 0) {
          setSelectedPythonVersion(result.versions[0]);
        }
      } else {
        console.error('Failed to load Python versions:', result.error);
      }
    } catch (error) {
      console.error('Error loading Python versions:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    loadSecrets();
    loadAppsDirectory();
    loadPythonVersions();
  }, []);

  // Reset form
  const resetForm = () => {
    setSecretForm({ name: '', value: '', description: '' });
    setEditingSecret(null);
    setShowAddModal(false);
  };

  // Create secret
  const handleCreate = async () => {
    if (!secretForm.name || !secretForm.value) {
      alert(t('secrets.required_fields'));
      return;
    }

    const result = await window.electronAPI.createGlobalSecret({
      name: secretForm.name,
      value: secretForm.value,
      description: secretForm.description || undefined,
    });

    if (result.success) {
      await loadSecrets();
      resetForm();
    } else {
      alert(t('secrets.create_failed', { error: result.error }));
    }
  };

  // Update secret
  const handleUpdate = async () => {
    if (!editingSecret) return;

    // Build updates object, excluding undefined values (Electron IPC doesn't handle undefined)
    const updates: { name: string; value?: string; description?: string } = {
      name: secretForm.name,
      // Always include description (even if empty string) to allow clearing it
      description: secretForm.description,
    };

    // Only include value if it's not empty (empty means keep existing value)
    if (secretForm.value) {
      updates.value = secretForm.value;
    }

    const result = await window.electronAPI.updateGlobalSecret(editingSecret.id, updates);

    if (result.success) {
      await loadSecrets();
      resetForm();
    } else {
      alert(t('secrets.update_failed', { error: result.error }));
    }
  };

  // Delete secret
  const handleDelete = async (secretId: string) => {
    const usage = await window.electronAPI.getSecretUsage(secretId);
    if (usage.appIds.length > 0) {
      const confirm = window.confirm(
        t('secrets.delete_confirm', { count: usage.appIds.length })
      );
      if (!confirm) return;
    }

    const result = await window.electronAPI.deleteGlobalSecret(secretId);
    if (result.success) {
      await loadSecrets();
    } else {
      alert(t('secrets.delete_failed', { error: result.error }));
    }
  };

  // Open edit modal
  const openEditModal = (secret: GlobalSecret) => {
    setEditingSecret(secret);
    setSecretForm({
      name: secret.name,
      value: '',
      description: secret.description || '',
    });
    setShowAddModal(true);
  };

  // Advanced Settings handlers
  const handleCleanupOrphanedDirs = async () => {
    const confirmed = window.confirm(t('advanced.cleanup.confirm'));
    if (!confirmed) return;

    setCleanupLoading(true);
    try {
      const result = await window.electronAPI.cleanupOrphanedDirs();
      if (result.success) {
        const plural = result.count === 1 ? 'y' : 'ies';
        alert(t('advanced.cleanup.success', { count: result.count, plural }));
      } else {
        alert(t('advanced.cleanup.error', { error: result.error }));
      }
    } catch (error) {
      alert(`Error: ${error}`);
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleSelectAppsDirectory = async () => {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      setAppsDirectory(dir);
    }
  };

  const handleSaveAppsDirectory = async () => {
    if (!appsDirectory) {
      alert(t('advanced.directory.error_empty'));
      return;
    }

    setDirectoryLoading(true);
    try {
      const result = await window.electronAPI.setAppsDirectory(appsDirectory);
      if (result.success) {
        alert(t('advanced.directory.success'));
        await loadAppsDirectory();
      } else {
        alert(t('advanced.directory.error', { error: result.error }));
      }
    } catch (error) {
      alert(`Error: ${error}`);
    } finally {
      setDirectoryLoading(false);
    }
  };

  const handleUpdateUv = async () => {
    setUpdateLoading(true);
    try {
      const result = await window.electronAPI.updateUv();
      if (result.success) {
        alert(t('advanced.update_uv.success'));
      } else {
        alert(t('advanced.update_uv.error', { error: result.error }));
      }
    } catch (error) {
      alert(`Error: ${error}`);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleInstallPythonVersion = async () => {
    if (!selectedPythonVersion) {
      alert(t('advanced.python_version.error_no_version'));
      return;
    }

    const confirmed = window.confirm(
      t('advanced.python_version.confirm', { version: selectedPythonVersion })
    );
    if (!confirmed) return;

    setPythonVersionLoading(true);
    try {
      const result = await window.electronAPI.installPythonVersion(selectedPythonVersion);
      if (result.success) {
        alert(t('advanced.python_version.success', { version: selectedPythonVersion }));
      } else {
        alert(t('advanced.python_version.error', { error: result.error }));
      }
    } catch (error) {
      alert(`Error: ${error}`);
    } finally {
      setPythonVersionLoading(false);
    }
  };

  return (
    <div>
      {/* Global Secrets Section */}
      <div className="bg-bg-secondary rounded-lg p-5 border border-border mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold">{t('secrets.title')}</h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1 bg-accent-blue text-white rounded hover:bg-opacity-80 transition-colors text-xs font-medium"
          >
            {t('secrets.add_button')}
          </button>
        </div>

        {secrets.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t('secrets.no_secrets')}
          </p>
        ) : (
          <div className="space-y-2">
            {secrets.map((secret) => (
              <div
                key={secret.id}
                className="bg-bg-tertiary border border-border rounded p-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{secret.name}</p>
                    {secret.description && (
                      <p className="text-xs text-text-secondary mt-1">{secret.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(secret)}
                      className="px-2 py-1 text-xs bg-bg-secondary text-text-primary rounded hover:bg-opacity-80"
                    >
                      {t('secrets.edit_button')}
                    </button>
                    <button
                      onClick={() => handleDelete(secret.id)}
                      className="px-2 py-1 text-xs bg-status-error text-white rounded hover:bg-opacity-80"
                    >
                      {t('secrets.delete_button')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Language Section */}
      <div className="bg-bg-secondary rounded-lg p-5 border border-border mb-4">
        <h3 className="text-sm font-semibold mb-3">{t('language.title')}</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-text-secondary">{t('language.label')}</label>
          <select
            value={i18n.language}
            onChange={(e) => {
              i18n.changeLanguage(e.target.value);
              window.electronAPI.changeLanguage(e.target.value);
            }}
            className="px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary focus:outline-none focus:border-accent-blue"
          >
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <p className="text-xs text-text-tertiary mt-2">
          {t('language.description')}
        </p>
      </div>

      <div className="bg-bg-secondary rounded-lg p-5 border border-border mb-4">
        <h3 className="text-sm font-semibold mb-3">{t('uv.title')}</h3>

        {/* Show error message if installation failed and UV is not installed */}
        {!uvInstalled && uvInstallError && (
          <div className="mb-4 p-4 bg-status-error/10 border border-status-error/30 rounded">
            <p className="text-sm text-status-error font-medium mb-2">
              {t('uv.error_title')}
            </p>
            <p className="text-xs text-text-secondary mb-3">
              {uvInstallError}
            </p>
            <p className="text-xs text-text-secondary mb-3">
              {t('uv.error_manual')}
            </p>
            <button
              onClick={() => window.electronAPI.openExternal('https://docs.astral.sh/uv/getting-started/installation/')}
              className="px-3 py-1.5 bg-accent-blue text-white rounded text-xs hover:bg-opacity-80 transition-colors"
            >
              {t('uv.error_guide_button')}
            </button>
          </div>
        )}

        {/* Show installing message when installation is in progress */}
        {uvInstalling && (
          <div className="mb-4 p-4 bg-accent-blue/10 border border-accent-blue/30 rounded">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-text-primary font-medium">
                {t('uv.installing')}
              </p>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              {t('uv.installing_description')}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${uvInstalled ? 'bg-status-running' : uvInstalling ? 'bg-accent-orange' : 'bg-status-error'}`} />
            <span className="text-sm">
              {uvInstalled ? t('uv.installed') : uvInstalling ? t('uv.installing') : t('uv.not_installed')}
            </span>
          </div>
          {!uvInstalled && (
            <button
              onClick={onInstallUv}
              disabled={uvInstalling}
              className="px-4 py-2 bg-accent-blue text-white rounded hover:bg-accent-blue-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uvInstalling ? t('uv.install_button_loading') : t('uv.install_button')}
            </button>
          )}
        </div>
      </div>

      {/* Advanced Settings Section */}
      <div className="bg-bg-secondary rounded-lg border border-border mb-4">
        <button
          onClick={() => setAdvancedExpanded(!advancedExpanded)}
          className="w-full p-5 flex justify-between items-center hover:bg-bg-tertiary transition-colors"
        >
          <h3 className="text-sm font-semibold">{t('advanced.title')}</h3>
          <span className="text-text-secondary">{advancedExpanded ? '▼' : '▶'}</span>
        </button>

        {advancedExpanded && (
          <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
            {/* Cleanup Orphaned Directories */}
            <div className="pb-4 border-b border-border">
              <h4 className="text-sm font-medium text-text-primary mb-2">{t('advanced.cleanup.title')}</h4>
              <p className="text-xs text-text-secondary mb-3">
                {t('advanced.cleanup.description')}
              </p>
              <button
                onClick={handleCleanupOrphanedDirs}
                disabled={cleanupLoading}
                className="px-4 py-2 bg-status-error text-white rounded hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {cleanupLoading ? t('advanced.cleanup.button_loading') : t('advanced.cleanup.button')}
              </button>
            </div>

            {/* Apps Installation Directory */}
            <div className="pb-4 border-b border-border">
              <h4 className="text-sm font-medium text-text-primary mb-2">{t('advanced.directory.title')}</h4>
              <p className="text-xs text-text-secondary mb-3">
                {t('advanced.directory.description')} <code className="bg-bg-tertiary px-1 py-0.5 rounded font-mono text-xs">{appsDirectory}</code>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={appsDirectory}
                  onChange={(e) => setAppsDirectory(e.target.value)}
                  className="flex-1 px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary focus:outline-none focus:border-accent-blue text-sm font-mono"
                  placeholder={t('advanced.directory.placeholder')}
                />
                <button
                  onClick={handleSelectAppsDirectory}
                  className="px-4 py-2 bg-bg-tertiary text-text-primary rounded hover:bg-opacity-80 transition-colors text-sm"
                >
                  {t('advanced.directory.browse_button')}
                </button>
                <button
                  onClick={handleSaveAppsDirectory}
                  disabled={directoryLoading}
                  className="px-4 py-2 bg-accent-blue text-white rounded hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {directoryLoading ? t('advanced.directory.save_button_loading') : t('advanced.directory.save_button')}
                </button>
              </div>
            </div>

            {/* Update UV */}
            <div className="pb-4 border-b border-border">
              <h4 className="text-sm font-medium text-text-primary mb-2">{t('advanced.update_uv.title')}</h4>
              <p className="text-xs text-text-secondary mb-3">
                {t('advanced.update_uv.description')} <code className="px-1 py-0.5 bg-bg-tertiary rounded font-mono text-xs">uv self update</code>).
              </p>
              <button
                onClick={handleUpdateUv}
                disabled={updateLoading}
                className="px-4 py-2 bg-accent-blue text-white rounded hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {updateLoading ? t('advanced.update_uv.button_loading') : t('advanced.update_uv.button')}
              </button>
            </div>

            {/* Default Python Version */}
            <div>
              <h4 className="text-sm font-medium text-text-primary mb-2">{t('advanced.python_version.title')}</h4>
              <p className="text-xs text-text-secondary mb-3">
                {t('advanced.python_version.description')}
              </p>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedPythonVersion}
                  onChange={(e) => setSelectedPythonVersion(e.target.value)}
                  disabled={loadingVersions || pythonVersionLoading}
                  className="px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary focus:outline-none focus:border-accent-blue text-sm disabled:opacity-50"
                >
                  {loadingVersions ? (
                    <option>{t('advanced.python_version.loading')}</option>
                  ) : pythonVersions.length === 0 ? (
                    <option>{t('advanced.python_version.no_versions')}</option>
                  ) : (
                    pythonVersions.map((version) => (
                      <option key={version} value={version}>
                        Python {version}
                      </option>
                    ))
                  )}
                </select>
                <button
                  onClick={handleInstallPythonVersion}
                  disabled={pythonVersionLoading || loadingVersions || pythonVersions.length === 0}
                  className="px-4 py-2 bg-accent-blue text-white rounded hover:bg-opacity-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {pythonVersionLoading ? t('advanced.python_version.button_loading') : t('advanced.python_version.button')}
                </button>
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                {t('advanced.python_version.note')}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-bg-secondary rounded-lg p-5 border border-border">
        <h3 className="text-sm font-semibold mb-2">{t('about.title')}</h3>
        <p className="text-sm text-text-secondary leading-relaxed">
          {t('about.description')}
        </p>
        <div className="mt-4 text-xs text-text-tertiary space-y-1">
          <p>{t('about.version', { version: '0.1.0' })}</p>
          <p>{t('about.tech')}</p>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary rounded-lg p-6 w-full max-w-md border border-border">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {editingSecret ? t('secrets.modal.title_edit') : t('secrets.modal.title_add')}
            </h3>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t('secrets.modal.name_label')} <span className="text-status-error">{t('secrets.modal.required')}</span>
                </label>
                <input
                  type="text"
                  value={secretForm.name}
                  onChange={(e) => setSecretForm({ ...secretForm, name: e.target.value })}
                  placeholder={t('secrets.modal.name_placeholder')}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary focus:outline-none focus:border-accent-blue"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  {t('secrets.modal.name_help')}
                </p>
              </div>

              {/* Value */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t('secrets.modal.value_label')} {!editingSecret && <span className="text-status-error">{t('secrets.modal.required')}</span>}
                </label>
                <input
                  type="password"
                  value={secretForm.value}
                  onChange={(e) => setSecretForm({ ...secretForm, value: e.target.value })}
                  placeholder={editingSecret ? t('secrets.modal.value_placeholder_edit') : t('secrets.modal.value_placeholder_new')}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-blue"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t('secrets.modal.description_label')}
                </label>
                <textarea
                  value={secretForm.description}
                  onChange={(e) => setSecretForm({ ...secretForm, description: e.target.value })}
                  placeholder={t('secrets.modal.description_placeholder')}
                  rows={3}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary focus:outline-none focus:border-accent-blue resize-none"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={resetForm}
                className="flex-1 px-4 py-2 bg-bg-tertiary text-text-primary rounded hover:bg-opacity-80 transition-colors"
              >
                {t('secrets.modal.cancel_button')}
              </button>
              <button
                onClick={editingSecret ? handleUpdate : handleCreate}
                className="flex-1 px-4 py-2 bg-accent-blue text-white rounded hover:bg-opacity-80 transition-colors"
              >
                {editingSecret ? t('secrets.modal.update_button') : t('secrets.modal.create_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
