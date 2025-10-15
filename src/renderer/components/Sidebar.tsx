import React from 'react';

type View = 'apps' | 'logs' | 'settings';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  uvInstalled: boolean;
  onInstallUv: () => void;
  appsCount: number;
}

export function Sidebar({ currentView, onViewChange, uvInstalled, onInstallUv, appsCount }: SidebarProps) {
  const menuItems: { view: View; icon: string; label: string; badge?: number }[] = [
    { view: 'apps', icon: '📦', label: 'Apps', badge: appsCount },
    { view: 'logs', icon: '📋', label: 'Logs' },
    { view: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <aside className="w-[220px] bg-bg-secondary border-r border-border flex flex-col py-4">
      <div className="px-4 pb-6 border-b border-border">
        <h2 className="text-xl font-bold tracking-tight">UV Dash</h2>
        <p className="text-[11px] text-text-secondary mt-1">Python App Manager</p>
      </div>

      {!uvInstalled && (
        <div className="mx-3 my-4 p-3 bg-bg-tertiary rounded-md border border-accent-orange">
          <p className="text-xs font-medium mb-2">UV not installed</p>
          <button
            onClick={onInstallUv}
            className="w-full py-1.5 bg-accent-orange text-white text-xs rounded hover:opacity-90 transition-opacity"
          >
            Install Now
          </button>
        </div>
      )}

      <nav className="flex-1 px-2 mt-4">
        {menuItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onViewChange(item.view)}
            className={`w-full px-3 py-2.5 rounded mb-1 flex items-center justify-between transition-colors text-sm font-medium
              ${currentView === item.view
                ? 'bg-bg-hover text-text-primary border border-border'
                : 'text-text-secondary hover:bg-bg-hover/50 border border-transparent'
              }`}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="bg-accent-blue text-white px-2 py-0.5 rounded-full text-[11px] font-semibold">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="px-4 pt-4 border-t border-border text-[11px] text-text-tertiary">
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full ${uvInstalled ? 'bg-status-running' : 'bg-status-error'}`} />
          <span>UV {uvInstalled ? 'Ready' : 'Not Available'}</span>
        </div>
        <p>v0.1.0</p>
      </div>
    </aside>
  );
}
