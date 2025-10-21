import React, { useState, useEffect } from 'react';
import type { GlobalSecret } from '../../shared/types';

type EnvVarSource = 'text' | 'secret' | 'global';

interface EnvVar {
  key: string;
  source: EnvVarSource;
  value?: string; // For text and secret
  globalSecretId?: string; // For global
  existingEncryptedValue?: string; // For secret: keep existing encrypted value if not changed
}

interface EditAppModalProps {
  editName: string;
  editCommand: string;
  editEnv: Record<string, string>;
  editSecrets: Record<string, string>;
  editSecretRefs: Record<string, string>;
  onNameChange: (name: string) => void;
  onCommandChange: (command: string) => void;
  onSave: (env: Record<string, string>, secrets: Record<string, string>, secretRefs: Record<string, string>) => void;
  onClose: () => void;
}

export function EditAppModal({
  editName,
  editCommand,
  editEnv,
  editSecrets,
  editSecretRefs,
  onNameChange,
  onCommandChange,
  onSave,
  onClose,
}: EditAppModalProps) {
  const [globalSecrets, setGlobalSecrets] = useState<GlobalSecret[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);

  // Load global secrets on mount
  useEffect(() => {
    const loadSecrets = async () => {
      const secrets = await window.electronAPI.listGlobalSecrets();
      setGlobalSecrets(secrets);
    };
    loadSecrets();
  }, []);

  // Convert props to unified envVars list
  useEffect(() => {
    const vars: EnvVar[] = [];

    // Add text variables
    Object.entries(editEnv).forEach(([key, value]) => {
      vars.push({ key, source: 'text', value });
    });

    // Add secrets (leave value empty to show placeholder, keep encrypted value for preservation)
    Object.entries(editSecrets).forEach(([key, encryptedValue]) => {
      vars.push({ key, source: 'secret', value: '', existingEncryptedValue: encryptedValue });
    });

    // Add global secret refs
    Object.entries(editSecretRefs).forEach(([key, globalSecretId]) => {
      vars.push({ key, source: 'global', globalSecretId });
    });

    setEnvVars(vars);
  }, [editEnv, editSecrets, editSecretRefs]);

  const handleAddVariable = () => {
    const newKey = `NEW_VAR_${Date.now()}`;
    setEnvVars([...envVars, { key: newKey, source: 'text', value: '' }]);
  };

  const handleRemoveVariable = (index: number) => {
    const newVars = [...envVars];
    newVars.splice(index, 1);
    setEnvVars(newVars);
  };

  const handleKeyChange = (index: number, newKey: string) => {
    const newVars = [...envVars];
    newVars[index].key = newKey;
    setEnvVars(newVars);
  };

  const handleSourceChange = (index: number, newSource: EnvVarSource) => {
    const newVars = [...envVars];
    const oldSource = newVars[index].source;
    newVars[index].source = newSource;

    // Reset values when changing source
    if (newSource === 'global') {
      newVars[index].value = undefined;
      newVars[index].globalSecretId = globalSecrets[0]?.id || '';
      newVars[index].existingEncryptedValue = undefined;
    } else {
      newVars[index].globalSecretId = undefined;
      newVars[index].value = '';
      // Clear existing encrypted value when changing source
      if (oldSource === 'secret') {
        newVars[index].existingEncryptedValue = undefined;
      }
    }

    setEnvVars(newVars);
  };

  const handleValueChange = (index: number, newValue: string) => {
    const newVars = [...envVars];
    newVars[index].value = newValue;
    setEnvVars(newVars);
  };

  const handleGlobalSecretChange = (index: number, secretId: string) => {
    const newVars = [...envVars];
    newVars[index].globalSecretId = secretId;
    setEnvVars(newVars);
  };

  const handleSave = () => {
    // Convert envVars to separate env/secrets/secretRefs objects
    const newEnv: Record<string, string> = {};
    const newSecrets: Record<string, string> = {};
    const newSecretRefs: Record<string, string> = {};

    envVars.forEach((v) => {
      if (v.source === 'text') {
        newEnv[v.key] = v.value || '';
      } else if (v.source === 'secret') {
        // If value is empty and we have an existing encrypted value, keep it
        // Otherwise, use the new value (or empty string if user cleared it intentionally)
        if (!v.value && v.existingEncryptedValue) {
          newSecrets[v.key] = v.existingEncryptedValue;
        } else {
          newSecrets[v.key] = v.value || '';
        }
      } else if (v.source === 'global' && v.globalSecretId) {
        newSecretRefs[v.key] = v.globalSecretId;
      }
    });

    // Pass the complete new state to parent
    onSave(newEnv, newSecrets, newSecretRefs);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
    >
      <div
        className="fade-in bg-bg-secondary rounded-xl border border-border w-[580px] max-h-[80vh] flex flex-col shadow-2xl"
      >
        <div className="px-6 py-5 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-semibold">Edit App</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium mb-2">App Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => onNameChange(e.target.value)}
              required
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary border border-border rounded text-sm focus:outline-none focus:border-border-focus transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Run Command</label>
            <input
              type="text"
              value={editCommand}
              onChange={(e) => onCommandChange(e.target.value)}
              placeholder="python main.py or streamlit run app.py"
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary border border-border rounded text-sm focus:outline-none focus:border-border-focus transition-colors"
            />
            <p className="text-[11px] text-text-tertiary mt-1.5">
              Command to run (automatically wrapped with <code className="px-1 py-0.5 bg-bg-secondary rounded">uv run</code>). Leave empty to auto-detect.
            </p>
          </div>

          {/* Unified Environment Variables Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Environment Variables</label>
              <button
                type="button"
                onClick={handleAddVariable}
                className="text-xs px-2 py-1 bg-accent-blue text-white rounded hover:bg-accent-blue-hover transition-colors"
              >
                + Add Variable
              </button>
            </div>

            {envVars.length === 0 ? (
              <p className="text-xs text-text-tertiary py-2">No environment variables configured</p>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto">
                {envVars.map((envVar, index) => (
                  <div key={index} className="bg-bg-tertiary border border-border rounded p-3 space-y-2">
                    {/* Key input */}
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={envVar.key}
                        onChange={(e) => handleKeyChange(index, e.target.value)}
                        placeholder="VARIABLE_NAME"
                        className="flex-1 px-2 py-1.5 bg-bg-secondary text-text-primary border border-border rounded text-xs font-mono focus:outline-none focus:border-border-focus transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(index)}
                        className="text-text-secondary hover:text-status-error text-lg"
                        title="Remove variable"
                      >
                        ×
                      </button>
                    </div>

                    {/* Source selector */}
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-text-secondary whitespace-nowrap">Value from:</span>
                      <select
                        value={envVar.source}
                        onChange={(e) => handleSourceChange(index, e.target.value as EnvVarSource)}
                        className="flex-1 px-2 py-1.5 bg-bg-secondary text-text-primary border border-border rounded text-xs focus:outline-none focus:border-border-focus transition-colors"
                      >
                        <option value="text">Plain Text</option>
                        <option value="secret">🔒 Encrypted Secret</option>
                        <option value="global">📦 Global Secret</option>
                      </select>
                    </div>

                    {/* Value input (conditional based on source) */}
                    {envVar.source === 'text' && (
                      <input
                        type="text"
                        value={envVar.value || ''}
                        onChange={(e) => handleValueChange(index, e.target.value)}
                        placeholder="Value (plain text)"
                        className="w-full px-2 py-1.5 bg-bg-secondary text-text-primary border border-border rounded text-xs font-mono focus:outline-none focus:border-border-focus transition-colors"
                      />
                    )}

                    {envVar.source === 'secret' && (
                      <input
                        type="password"
                        value={envVar.value || ''}
                        onChange={(e) => handleValueChange(index, e.target.value)}
                        placeholder={envVar.existingEncryptedValue ? "Leave empty to keep current value" : "Enter secret value"}
                        className="w-full px-2 py-1.5 bg-bg-secondary text-text-primary border border-border rounded text-xs font-mono focus:outline-none focus:border-border-focus transition-colors"
                      />
                    )}

                    {envVar.source === 'global' && (
                      <>
                        <select
                          value={envVar.globalSecretId || ''}
                          onChange={(e) => handleGlobalSecretChange(index, e.target.value)}
                          className="w-full px-2 py-1.5 bg-bg-secondary text-text-primary border border-border rounded text-xs focus:outline-none focus:border-border-focus transition-colors"
                        >
                          {globalSecrets.length === 0 ? (
                            <option value="">No global secrets available</option>
                          ) : (
                            globalSecrets.map((secret) => (
                              <option key={secret.id} value={secret.id}>
                                {secret.name}
                                {secret.description ? ` - ${secret.description}` : ''}
                              </option>
                            ))
                          )}
                        </select>
                        {globalSecrets.length === 0 && (
                          <p className="text-[10px] text-text-tertiary">
                            Create global secrets in Settings to use them here.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-text-tertiary mt-2">
              <strong>Plain Text:</strong> Stored as-is. <strong>🔒 Encrypted Secret:</strong> Encrypted using OS keychain (macOS Keychain / Windows Credential Manager). <strong>📦 Global Secret:</strong> Shared across apps.
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 bg-accent-blue text-white rounded hover:bg-accent-blue-hover transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
