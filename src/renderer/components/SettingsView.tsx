import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GlobalSecret } from '../../shared/types';

interface SettingsViewProps {
  uvInstalled: boolean;
  onInstallUv: () => void;
}

export function SettingsView({ uvInstalled, onInstallUv }: SettingsViewProps) {
  const { t, i18n } = useTranslation('settings');
  const [secrets, setSecrets] = useState<GlobalSecret[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSecret, setEditingSecret] = useState<GlobalSecret | null>(null);
  const [secretForm, setSecretForm] = useState({
    name: '',
    value: '',
    description: '',
  });

  // Load secrets list
  const loadSecrets = async () => {
    const result = await window.electronAPI.listGlobalSecrets();
    setSecrets(result);
  };

  useEffect(() => {
    loadSecrets();
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

    const result = await window.electronAPI.updateGlobalSecret(editingSecret.id, {
      name: secretForm.name,
      value: secretForm.value || undefined,
      description: secretForm.description || undefined,
    });

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

  return (
    <div>
      {/* Global Secrets Section */}
      <div className="bg-bg-secondary rounded-lg p-5 border border-border mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold">Global Secrets</h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1 bg-accent-blue text-white rounded hover:bg-opacity-80 transition-colors text-xs font-medium"
          >
            + Add Secret
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
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(secret.id)}
                      className="px-2 py-1 text-xs bg-status-error text-white rounded hover:bg-opacity-80"
                    >
                      Delete
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
        <h3 className="text-sm font-semibold mb-3">UV Status</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${uvInstalled ? 'bg-status-running' : 'bg-status-error'}`} />
            <span className="text-sm">
              {uvInstalled ? 'UV is installed and ready' : 'UV is not installed'}
            </span>
          </div>
          {!uvInstalled && (
            <button
              onClick={onInstallUv}
              className="px-4 py-2 bg-accent-blue text-white rounded hover:bg-accent-blue-hover transition-colors"
            >
              Install UV
            </button>
          )}
        </div>
      </div>

      <div className="bg-bg-secondary rounded-lg p-5 border border-border">
        <h3 className="text-sm font-semibold mb-2">About</h3>
        <p className="text-sm text-text-secondary leading-relaxed">
          UV Dash is a desktop application for managing Python projects using UV.
          Install, run, and manage your Python applications with ease.
        </p>
        <div className="mt-4 text-xs text-text-tertiary space-y-1">
          <p>Version: 0.1.0</p>
          <p>Built with Electron + React + TypeScript + Tailwind CSS</p>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary rounded-lg p-6 w-full max-w-md border border-border">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {editingSecret ? 'Edit Secret' : 'Add New Secret'}
            </h3>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Name <span className="text-status-error">*</span>
                </label>
                <input
                  type="text"
                  value={secretForm.name}
                  onChange={(e) => setSecretForm({ ...secretForm, name: e.target.value })}
                  placeholder="e.g., OpenAI API Key"
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary focus:outline-none focus:border-accent-blue"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  This name helps you identify the secret. Each app can assign its own environment variable name.
                </p>
              </div>

              {/* Value */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Value {!editingSecret && <span className="text-status-error">*</span>}
                </label>
                <input
                  type="password"
                  value={secretForm.value}
                  onChange={(e) => setSecretForm({ ...secretForm, value: e.target.value })}
                  placeholder={editingSecret ? 'Leave empty to keep current value' : 'Secret value'}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent-blue"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={secretForm.description}
                  onChange={(e) => setSecretForm({ ...secretForm, description: e.target.value })}
                  placeholder="Optional description"
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
                Cancel
              </button>
              <button
                onClick={editingSecret ? handleUpdate : handleCreate}
                className="flex-1 px-4 py-2 bg-accent-blue text-white rounded hover:bg-opacity-80 transition-colors"
              >
                {editingSecret ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
