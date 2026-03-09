import React, { useState, useEffect, useCallback } from 'react';
import {
  getHealth,
  getDatasets,
  getDictionary,
  triggerDiscovery,
  HealthStatus,
  DatasetEntry,
} from '../../../services/intelligenceApi';

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

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>Data Discovery</h4>
          <small className="text-muted">Auto-discover and profile database tables</small>
        </div>
        <div className="d-flex gap-2">
          {health && (
            <span className={`badge ${health.engine_status === 'online' ? 'bg-success' : 'bg-danger'} align-self-center`}>
              Engine: {health.engine_status}
            </span>
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
      </div>

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary)' }}>{datasets.length}</div>
              <small className="text-muted">Tables Discovered</small>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold" style={{ color: 'var(--color-accent)' }}>
                {datasets.reduce((sum, d) => sum + (d.row_count || 0), 0).toLocaleString()}
              </div>
              <small className="text-muted">Total Rows</small>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary-light)' }}>
                {datasets.filter((d) => d.status === 'discovered').length}
              </div>
              <small className="text-muted">Active Datasets</small>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-3 fw-bold" style={{ color: 'var(--color-text-light)' }}>
                {health?.last_discovery ? new Date(health.last_discovery).toLocaleDateString() : 'Never'}
              </div>
              <small className="text-muted">Last Scan</small>
            </div>
          </div>
        </div>
      </div>

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
        <div className="card border-0 shadow-sm">
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
                      <span className={`badge ${ds.status === 'discovered' ? 'bg-success' : 'bg-secondary'}`}>
                        {ds.status}
                      </span>
                    </td>
                    <td className="small text-muted">
                      {ds.last_scanned ? new Date(ds.last_scanned).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'dictionary' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
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
          </div>
        </div>
      )}
    </div>
  );
}
