import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getHealth,
  getDatasets,
  getDictionary,
  triggerDiscovery,
  HealthStatus,
  DatasetEntry,
} from '../../../services/intelligenceApi';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';

export default function IntelligenceDiscoveryPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [dictionary, setDictionary] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'datasets' | 'dictionary'>('datasets');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [h, d] = await Promise.all([
        getHealth().catch(() => null),
        getDatasets().catch(() => null),
      ]);
      if (h) setHealth(h.data);
      if (d) setDatasets(d.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRunDiscovery = async () => {
    setDiscoveryRunning(true);
    try {
      await triggerDiscovery();
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Discovery failed');
    } finally {
      setDiscoveryRunning(false);
    }
  };

  const handleLoadDictionary = async () => {
    try {
      const res = await getDictionary();
      setDictionary(res.data);
    } catch {
      setDictionary(null);
    }
  };

  // Per-page trust signal (Basecamp todo 10027085963) derived from discovery engine health.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'intelligence discovery',
    updatedAt: new Date().toISOString(),
    summary: `${datasets.length} tables discovered; engine ${health?.engine_status || 'unknown'}.`,
    href: '/admin/trust',
    pillars: [
      {
        name: 'Engine',
        status: health?.engine_status === 'online' ? 'verified' : 'error',
        evidence: [{ label: 'Status', value: health?.engine_status || 'unknown' }],
      },
    ],
  }), [datasets.length, health]);

  return (
    <>
      <PageHeader
        title="Intelligence Discovery"
        icon="search-eye-line"
        subtitle="Auto-discover and profile database tables."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Intelligence Discovery' }]}
        trust={trust}
        actions={
          <div className="d-flex gap-2 align-items-center">
            {health && (
              <StatusBadge
                label={`Engine: ${health.engine_status}`}
                tone={health.engine_status === 'online' ? 'success' : 'danger'}
              />
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={handleRunDiscovery}
              disabled={discoveryRunning}
            >
              {discoveryRunning ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status">
                    <span className="visually-hidden">Running...</span>
                  </span>
                  Running Discovery...
                </>
              ) : (
                'Run Discovery'
              )}
            </button>
          </div>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Tables Discovered" value={datasets.length} icon="table-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Total Rows"
              value={datasets.reduce((sum, d) => sum + (d.row_count || 0), 0).toLocaleString()}
              icon="database-2-line"
              tone="info"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Active Datasets"
              value={datasets.filter((d) => d.status === 'discovered').length}
              icon="checkbox-circle-line"
              tone="success"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Last Scan"
              value={health?.last_discovery ? new Date(health.last_discovery).toLocaleDateString() : 'Never'}
              icon="time-line"
              tone="neutral"
            />
          </div>
        </div>
      </PageHeader>

      {/* Tabs */}
      <nav className="nav nav-tabs mb-4">
        <button
          className={`nav-link ${activeTab === 'datasets' ? 'active' : ''}`}
          onClick={() => setActiveTab('datasets')}
        >
          Dataset Registry
        </button>
        <button
          className={`nav-link ${activeTab === 'dictionary' ? 'active' : ''}`}
          onClick={() => { setActiveTab('dictionary'); handleLoadDictionary(); }}
        >
          Data Dictionary
        </button>
      </nav>

      {activeTab === 'datasets' && (
        <SectionCard padded={false}>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small fw-semibold">Table Name</th>
                  <th className="small fw-semibold">Columns</th>
                  <th className="small fw-semibold">Rows</th>
                  <th className="small fw-semibold">Status</th>
                  <th className="small fw-semibold">Last Scanned</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="text-center py-4 text-muted">Loading...</td></tr>
                )}
                {!loading && datasets.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-4 text-muted">No datasets discovered yet. Run discovery to get started.</td></tr>
                )}
                {datasets.map((ds) => (
                  <tr key={ds.id}>
                    <td className="small fw-medium">{ds.table_name}</td>
                    <td className="small">{ds.column_count}</td>
                    <td className="small">{ds.row_count?.toLocaleString()}</td>
                    <td>
                      <StatusBadge
                        label={ds.status}
                        tone={ds.status === 'discovered' ? 'success' : 'neutral'}
                      />
                    </td>
                    <td className="small text-muted">
                      {ds.last_scanned ? new Date(ds.last_scanned).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {activeTab === 'dictionary' && (
        <SectionCard>
          {!dictionary ? (
            <div className="text-center py-4 text-muted">
              <p>No data dictionary available.</p>
              <small>Run discovery to generate the data dictionary.</small>
            </div>
          ) : (
            <pre className="bg-light p-3 rounded small" style={{ maxHeight: '600px', overflow: 'auto' }}>
              {JSON.stringify(dictionary, null, 2)}
            </pre>
          )}
        </SectionCard>
      )}
    </>
  );
}
