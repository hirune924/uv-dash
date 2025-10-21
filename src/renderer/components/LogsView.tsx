import React, { useState, useMemo, useEffect } from 'react';
import type { LogMessage, ProcessHealth, AppInfo } from '../../shared/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface LogsViewProps {
  logs: LogMessage[];
  apps: AppInfo[]; // Add app list
}

interface HealthDataPoint {
  time: string;
  cpu: number;
  memory: number;
}

export function LogsView({ logs, apps }: LogsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [selectedAppId, setSelectedAppId] = useState<string>('all');
  const [health, setHealth] = useState<ProcessHealth | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthDataPoint[]>([]);
  const [allHealth, setAllHealth] = useState<Record<string, ProcessHealth>>({});
  const [allHealthHistory, setAllHealthHistory] = useState<Record<string, HealthDataPoint[]>>({});
  const [healthSectionExpanded, setHealthSectionExpanded] = useState(true);

  // Get selected app
  const selectedApp = useMemo(() => {
    return apps.find(app => app.id === selectedAppId);
  }, [apps, selectedAppId]);

  // Get running apps
  const runningApps = useMemo(() => {
    return apps.filter(app => app.status === 'running');
  }, [apps]);

  // Poll health info for selected app (when specific app is selected)
  useEffect(() => {
    // If specific app is selected and in running state
    if (!selectedApp || selectedAppId === 'all' || selectedApp.status !== 'running') {
      setHealth(null);
      setHealthHistory([]);
      return;
    }

    const fetchHealth = async () => {
      try {
        const healthData = await window.electronAPI.getAppHealth(selectedAppId);
        if (healthData) {
          setHealth(healthData);

          // Add to history (keep last 30 points = 2.5 minutes)
          const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setHealthHistory(prev => {
            const newHistory = [...prev, {
              time: now,
              cpu: healthData.cpuUsage || 0,
              memory: healthData.memoryUsage || 0,
            }];
            return newHistory.slice(-30); // Keep only last 30 points
          });
        }
      } catch (error) {
        console.error('Failed to fetch health:', error);
      }
    };

    // Initial fetch
    fetchHealth();

    // Poll every 5 seconds
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, [selectedAppId, selectedApp]);

  // Poll health info for all apps (when All Apps is selected)
  useEffect(() => {
    if (selectedAppId !== 'all' || runningApps.length === 0) {
      setAllHealth({});
      setAllHealthHistory({});
      return;
    }

    const fetchAllHealth = async () => {
      try {
        const healthData = await window.electronAPI.getAllAppHealth();
        setAllHealth(healthData);

        // Add to history for each app
        const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setAllHealthHistory(prev => {
          const newHistory = { ...prev };
          for (const [appId, health] of Object.entries(healthData)) {
            if (!newHistory[appId]) {
              newHistory[appId] = [];
            }
            newHistory[appId] = [...newHistory[appId], {
              time: now,
              cpu: health.cpuUsage || 0,
              memory: health.memoryUsage || 0,
            }].slice(-30); // Keep only last 30 points
          }
          return newHistory;
        });
      } catch (error) {
        console.error('Failed to fetch all health:', error);
      }
    };

    // Initial fetch
    fetchAllHealth();

    // Poll every 5 seconds
    const interval = setInterval(fetchAllHealth, 5000);
    return () => clearInterval(interval);
  }, [selectedAppId, runningApps.length]);

  // Get unique appId list
  const appIds = useMemo(() => {
    const ids = new Set(logs.map((log) => log.appId));
    return Array.from(ids).sort();
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Level filter
      if (selectedLevel !== 'all' && log.level !== selectedLevel) {
        return false;
      }
      // App ID filter
      if (selectedAppId !== 'all' && log.appId !== selectedAppId) {
        return false;
      }
      // Search filter
      if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [logs, selectedLevel, selectedAppId, searchQuery]);

  // Log statistics
  const stats = useMemo(() => {
    return {
      total: logs.length,
      info: logs.filter((l) => l.level === 'info').length,
      warning: logs.filter((l) => l.level === 'warning').length,
      error: logs.filter((l) => l.level === 'error').length,
    };
  }, [logs]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Filter Controls */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <div className="flex gap-4 items-center flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 bg-bg-tertiary border border-border rounded text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-blue"
            />
          </div>

          {/* Level Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedLevel('all')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                selectedLevel === 'all'
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setSelectedLevel('info')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                selectedLevel === 'info'
                  ? 'bg-status-running text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              Info ({stats.info})
            </button>
            <button
              onClick={() => setSelectedLevel('warning')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                selectedLevel === 'warning'
                  ? 'bg-accent-orange text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              Warning ({stats.warning})
            </button>
            <button
              onClick={() => setSelectedLevel('error')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                selectedLevel === 'error'
                  ? 'bg-status-error text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              Error ({stats.error})
            </button>
          </div>

          {/* App Filter */}
          {appIds.length > 0 && (
            <select
              value={selectedAppId}
              onChange={(e) => setSelectedAppId(e.target.value)}
              className="px-3 py-1.5 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue"
            >
              <option value="all">All Apps ({appIds.length})</option>
              {appIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}

          {/* Clear Button */}
          {(searchQuery || selectedLevel !== 'all' || selectedAppId !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedLevel('all');
                setSelectedAppId('all');
              }}
              className="px-3 py-1.5 bg-bg-tertiary text-text-secondary hover:text-text-primary rounded text-xs font-medium transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Process Health for All Apps (when All Apps is selected) */}
      {selectedAppId === 'all' && runningApps.length > 0 && Object.keys(allHealth).length > 0 && (
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setHealthSectionExpanded(!healthSectionExpanded)}>
            <h3 className="text-sm font-semibold text-text-primary">
              Process Health - All Running Apps ({runningApps.length})
            </h3>
            <button
              className="text-text-secondary hover:text-text-primary transition-colors text-sm px-2"
              title={healthSectionExpanded ? "Collapse section" : "Expand section"}
            >
              {healthSectionExpanded ? '▼' : '▶'}
            </button>
          </div>

          {healthSectionExpanded && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {runningApps.map(app => {
              const appHealth = allHealth[app.id];
              const appHistory = allHealthHistory[app.id] || [];

              if (!appHealth) return null;

              return (
                <div key={app.id} className="bg-bg-tertiary rounded p-3 border border-border">
                  <h4 className="text-xs font-semibold mb-2 text-text-primary">{app.name}</h4>

                  {/* Current Status */}
                  <div className="flex gap-4 mb-2 text-[10px]">
                    <div>
                      <span className="text-text-secondary">PID:</span>{' '}
                      <span className="text-text-primary font-mono">{appHealth.pid}</span>
                    </div>
                    <div>
                      {appHealth.status === 'running' && <span className="text-status-running">✓ Alive</span>}
                      {appHealth.status === 'zombie' && <span className="text-status-error">⚠ Zombie</span>}
                      {appHealth.status === 'unknown' && <span className="text-status-installing">? Unknown</span>}
                    </div>
                    <div>
                      <span className="text-text-secondary">CPU:</span>{' '}
                      <span className="text-text-primary font-mono">{appHealth.cpuUsage?.toFixed(1) || '0.0'}%</span>
                    </div>
                    <div>
                      <span className="text-text-secondary">Memory:</span>{' '}
                      <span className="text-text-primary font-mono">{appHealth.memoryUsage || 0} MB</span>
                    </div>
                  </div>

                  {/* Chart */}
                  {appHistory.length >= 2 && (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={appHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis
                            dataKey="time"
                            stroke="#9CA3AF"
                            tick={{ fontSize: 8 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            yAxisId="cpu"
                            stroke="#10B981"
                            tick={{ fontSize: 8 }}
                          />
                          <YAxis
                            yAxisId="memory"
                            orientation="right"
                            stroke="#3B82F6"
                            tick={{ fontSize: 8 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1F2937',
                              border: '1px solid #374151',
                              borderRadius: '4px',
                              fontSize: '10px'
                            }}
                          />
                          <Line
                            yAxisId="cpu"
                            type="monotone"
                            dataKey="cpu"
                            stroke="#10B981"
                            strokeWidth={1.5}
                            dot={false}
                            name="CPU %"
                          />
                          <Line
                            yAxisId="memory"
                            type="monotone"
                            dataKey="memory"
                            stroke="#3B82F6"
                            strokeWidth={1.5}
                            dot={false}
                            name="Memory (MB)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* Process Health (only displayed when selected app is running) */}
      {selectedApp && selectedAppId !== 'all' && selectedApp.status === 'running' && health && (
        <div className="bg-bg-secondary rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setHealthSectionExpanded(!healthSectionExpanded)}>
            <h3 className="text-sm font-semibold text-text-primary">
              Process Health - {selectedApp.name}
            </h3>
            <button
              className="text-text-secondary hover:text-text-primary transition-colors text-sm px-2"
              title={healthSectionExpanded ? "Collapse section" : "Expand section"}
            >
              {healthSectionExpanded ? '▼' : '▶'}
            </button>
          </div>

          {healthSectionExpanded && (
            <>
          {/* Current Status */}
          <div className="flex gap-6 mb-4 text-xs">
            <div>
              <span className="text-text-secondary">PID:</span>{' '}
              <span className="text-text-primary font-mono">{health.pid}</span>
            </div>
            <div>
              <span className="text-text-secondary">Status:</span>{' '}
              {health.status === 'running' && <span className="text-status-running">✓ Alive</span>}
              {health.status === 'zombie' && <span className="text-status-error">⚠ Zombie</span>}
              {health.status === 'unknown' && <span className="text-status-installing">? Unknown</span>}
            </div>
            <div>
              <span className="text-text-secondary">CPU:</span>{' '}
              <span className="text-text-primary font-mono">{health.cpuUsage?.toFixed(1) || '0.0'}%</span>
            </div>
            <div>
              <span className="text-text-secondary">Memory:</span>{' '}
              <span className="text-text-primary font-mono">{health.memoryUsage || 0} MB</span>
            </div>
            <div>
              <span className="text-text-secondary">Uptime:</span>{' '}
              <span className="text-text-primary font-mono">
                {Math.floor((Date.now() - health.startTime) / 1000 / 60)}m
              </span>
            </div>
          </div>

          {/* Chart (displayed when sufficient history is available) */}
          {healthHistory.length >= 2 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="time"
                    stroke="#9CA3AF"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="cpu"
                    stroke="#10B981"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'CPU %', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
                  />
                  <YAxis
                    yAxisId="memory"
                    orientation="right"
                    stroke="#3B82F6"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Memory (MB)', angle: 90, position: 'insideRight', style: { fontSize: 10 } }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '4px',
                      fontSize: '11px'
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                  <Line
                    yAxisId="cpu"
                    type="monotone"
                    dataKey="cpu"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={false}
                    name="CPU %"
                  />
                  <Line
                    yAxisId="memory"
                    type="monotone"
                    dataKey="memory"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={false}
                    name="Memory (MB)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
            </>
          )}
        </div>
      )}

      {/* Log Display */}
      <div className="flex-1 bg-bg-tertiary rounded-lg p-4 overflow-auto font-mono text-xs border border-border">
        {filteredLogs.length === 0 ? (
          <p className="text-text-secondary">
            {logs.length === 0 ? 'No logs yet...' : 'No logs match the current filters.'}
          </p>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="mb-1.5 leading-relaxed">
              <span className="text-text-tertiary">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>{' '}
              <span
                className={`font-medium ${
                  log.level === 'error'
                    ? 'text-status-error'
                    : log.level === 'warning'
                    ? 'text-accent-orange'
                    : 'text-status-running'
                }`}
              >
                [{log.level.toUpperCase()}]
              </span>{' '}
              <span className="text-accent-blue font-medium">[{log.appId}]</span>{' '}
              <span className="text-text-primary">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
