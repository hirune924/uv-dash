import React from 'react';

interface AddEnvVarModalProps {
  isAddingSecret: boolean;
  newVarName: string;
  onVarNameChange: (name: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function AddEnvVarModal({ isAddingSecret, newVarName, onVarNameChange, onConfirm, onClose }: AddEnvVarModalProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onConfirm();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="fade-in bg-bg-secondary rounded-xl border border-border w-[400px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border">
          <h3 className="text-base font-semibold">
            {isAddingSecret ? '🔒 Add Secret' : 'Add Environment Variable'}
          </h3>
        </div>
        <div className="p-6">
          <input
            type="text"
            value={newVarName}
            onChange={(e) => onVarNameChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAddingSecret ? 'e.g., API_KEY, DATABASE_PASSWORD' : 'e.g., PORT, DEBUG'}
            className="w-full px-3 py-2 bg-bg-tertiary text-text-primary border border-border rounded text-sm focus:outline-none focus:border-border-focus transition-colors"
            autoFocus
          />
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-accent-blue text-white rounded hover:bg-accent-blue-hover transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
