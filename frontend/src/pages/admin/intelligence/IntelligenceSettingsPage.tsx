import React, { useState, useEffect, useCallback } from 'react';
import {
  getHealth,
  getConfig,
  updateConfig,
  getProcesses,
  triggerDiscovery,
  HealthStatus,
  ConfigEntry,
  SystemProcessEntry,
} from '../../../services/intelligenceApi';

export default function IntelligenceSettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [processes, setProcesses] = useState<SystemProcessEntry[]>([]);
  const [processCount, setProcessCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'status' | 'config' | 'processes'>('status');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadData = useCallback(async () => {
    const [h, c, p] = await Promise.all([
      getHealth().catch(() => null),
      getConfig().catch(() => null),
      getProcesses({ limit: 50 }).catch(() => null),
    ]);
    if (h) setHealth(h.data);
    if (c) setConfigs(c.data);
    if (p) {
      setProcesses(p.data.rows);
      setProcessCount(p.data.count);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveConfig = async (key: string) => {
    try {
      const parsed = JSON.parse(editValue);
      await updateConfig(key, parsed);
      setEditingKey(null);
      await loadData();
    } catch {
      alert('Invalid JSON value');
    }
  };

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>Intelligence Settings</h4>
          <small className="text-muted">Monitor and configure the Intelligence OS engine</small>
        </div>
      </div>

      {/* Status Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <small className="text-muted">Engine Status</small>
                <span className={`badge ${health?.engine_status === 'online' ? 'bg-success' : 'bg-danger'}`}>
                  {health?.engine_status || 'unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <small className="text-muted">Datasets</small>
                <span className="fw-bold">{health?.datasets_count || 0}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <small className="text-muted">Processes (24h)</small>
                <span className="fw-bold">{health?.processes_count_24h || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="nav nav-tabs mb-4">
        <button className={`nav-link ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>
          System Status
        </button>
        <button className={`nav-link ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
          Configuration
        </button>
        <button className={`nav-link ${activeTab === 'processes' ? 'active' : ''}`} onClick={() => setActiveTab('processes')}>
          Process Log ({processCount})
        </button>
      </nav>

      {activeTab === 'status' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <h6 className="fw-semibold mb-3">Service Health</h6>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <tbody>
                  <tr>
                    <td className="small fw-medium">Intelligence Engine</td>
                    <td><span className={`badge ${health?.engine_status === 'online' ? 'bg-success' : 'bg-danger'}`}>{health?.engine_status}</span></td>
                  </tr>
                  <tr>
                    <td className="small fw-medium">Last Discovery</td>
                    <td className="small">{health?.last_discovery ? new Date(health.last_discovery).toLocaleString() : 'Never'}</td>
                  </tr>
                  <tr>
                    <td className="small fw-medium">Engine Detail</td>
                    <td className="small">
                      {health?.engine_detail ? (
                        <pre className="mb-0 bg-light p-2 rounded" style={{ fontSize: '0.75rem' }}>
                          {JSON.stringify(health.engine_detail, null, 2)}
                        </pre>
                      ) : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-semibold mb-0">Configuration</h6>
            </div>
            {configs.length === 0 ? (
              <p className="text-muted small">No configuration entries yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-semibold">Key</th>
                      <th className="small fw-semibold">Value</th>
                      <th className="small fw-semibold">Updated</th>
                      <th className="small fw-semibold" style={{ width: '100px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((cfg) => (
                      <tr key={cfg.id}>
                        <td className="small fw-medium">{cfg.config_key}</td>
                        <td className="small">
                          {editingKey === cfg.config_key ? (
                            <textarea
                              className="form-control form-control-sm"
                              rows={3}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                            />
                          ) : (
                            <code style={{ fontSize: '0.75rem' }}>{JSON.stringify(cfg.config_value)}</code>
                          )}
                        </td>
                        <td className="small text-muted">{cfg.updated_at ? new Date(cfg.updated_at).toLocaleString() : '-'}</td>
                        <td>
                          {editingKey === cfg.config_key ? (
                            <div className="d-flex gap-1">
                              <button className="btn btn-sm btn-primary" onClick={() => handleSaveConfig(cfg.config_key)}>Save</button>
                              <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingKey(null)}>Cancel</button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => { setEditingKey(cfg.config_key); setEditValue(JSON.stringify(cfg.config_value, null, 2)); }}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'processes' && (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small fw-semibold">Process</th>
                  <th className="small fw-semibold">Module</th>
                  <th className="small fw-semibold">Type</th>
                  <th className="small fw-semibold">Duration</th>
                  <th className="small fw-semibold">Status</th>
                  <th className="small fw-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {processes.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-4 text-muted">No processes recorded yet.</td></tr>
                )}
                {processes.map((p) => (
                  <tr key={p.id}>
                    <td className="small fw-medium">{p.process_name}</td>
                    <td className="small">{p.source_module}</td>
                    <td><span className="badge bg-info">{p.event_type}</span></td>
                    <td className="small">{p.execution_time_ms ? `${p.execution_time_ms}ms` : '-'}</td>
                    <td>
                      <span className={`badge ${p.status === 'completed' ? 'bg-success' : p.status === 'failed' ? 'bg-danger' : 'bg-warning'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="small text-muted">{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
