import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';
import {
  getHealth,
  getConfig,
  updateConfig,
  getProcesses,
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

  // Per-page trust signal (Basecamp todo 10027085963): the Intelligence OS
  // engine health + configuration shown here is the live source of record for
  // how the intelligence subsystem behaves at runtime.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'intelligence settings',
    updatedAt: new Date().toISOString(),
    summary: 'Live Intelligence OS engine health and configuration governing the intelligence subsystem.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Engine Status',
        status: health?.engine_status === 'online' ? 'live' : 'error',
        evidence: [{ label: 'Engine', value: health?.engine_status || 'unknown' }],
      },
    ],
  }), [health]);

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
    <>
      <PageHeader
        title="Intelligence Settings"
        icon="settings-3-line"
        subtitle="Monitor and configure the Intelligence OS engine."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Intelligence Settings' }]}
        trust={trust}
      >
        <div className="row g-3">
          <div className="col-6 col-lg-4">
            <StatCard
              label="Engine Status"
              value={health?.engine_status || 'unknown'}
              icon="pulse-line"
              tone={health?.engine_status === 'online' ? 'success' : 'danger'}
            />
          </div>
          <div className="col-6 col-lg-4">
            <StatCard
              label="Datasets"
              value={health?.datasets_count || 0}
              icon="database-2-line"
              tone="info"
            />
          </div>
          <div className="col-6 col-lg-4">
            <StatCard
              label="Processes (24h)"
              value={health?.processes_count_24h || 0}
              icon="loader-4-line"
              tone="primary"
            />
          </div>
        </div>
      </PageHeader>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>
            System Status
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
            Configuration
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'processes' ? 'active' : ''}`} onClick={() => setActiveTab('processes')}>
            Process Log ({processCount})
          </button>
        </li>
      </ul>

      {activeTab === 'status' && (
        <SectionCard title="Service Health" icon="heart-pulse-line">
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <tbody>
                <tr>
                  <td className="small fw-medium">Intelligence Engine</td>
                  <td>
                    <StatusBadge
                      label={health?.engine_status || 'unknown'}
                      tone={health?.engine_status === 'online' ? 'success' : 'danger'}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="small fw-medium">Last Discovery</td>
                  <td className="small">{health?.last_discovery ? new Date(health.last_discovery).toLocaleString() : 'Never'}</td>
                </tr>
                <tr>
                  <td className="small fw-medium">Engine Detail</td>
                  <td className="small">
                    {health?.engine_detail ? (
                      <pre className="mb-0 p-2 rounded" style={{ fontSize: '0.75rem', background: 'var(--surface-subtle)' }}>
                        {JSON.stringify(health.engine_detail, null, 2)}
                      </pre>
                    ) : 'N/A'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {activeTab === 'config' && (
        <SectionCard title="Configuration" icon="settings-4-line">
          {configs.length === 0 ? (
            <p className="text-muted small mb-0">No configuration entries yet.</p>
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
                      <td className="small text-muted">{cfg.updated_at ? new Date(cfg.updated_at).toLocaleString() : '—'}</td>
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
        </SectionCard>
      )}

      {activeTab === 'processes' && (
        <SectionCard title="Process Log" icon="terminal-box-line" padded={false}>
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
                    <td><StatusBadge label={p.event_type} tone="info" /></td>
                    <td className="small">{p.execution_time_ms ? `${p.execution_time_ms}ms` : '—'}</td>
                    <td>
                      <StatusBadge
                        label={p.status}
                        tone={p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'}
                      />
                    </td>
                    <td className="small text-muted">{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </>
  );
}
