import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface SystemModel {
  scanned_at: string;
  file_count: number;
  components: Array<{ id: string; name: string; type: string; layer: string; files: string[]; file_count: number }>;
  flows: Array<{ from: string; to: string; type: string; confidence: number }>;
  infrastructure: Array<{ id: string; type: string; name: string; config_file: string; port?: number }>;
  layers: Record<string, { count: number; components: string[] }>;
  frameworks: string[];
  primary_language: string;
  architecture_style: string;
}

const LAYER_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  frontend: { label: 'Frontend', icon: 'bi-layout-wtf', color: '#8b5cf6', bg: '#f5f3ff' },
  api: { label: 'API Routes', icon: 'bi-signpost', color: '#3b82f6', bg: '#eff6ff' },
  service: { label: 'Services', icon: 'bi-gear', color: '#10b981', bg: '#ecfdf5' },
  data: { label: 'Database', icon: 'bi-database', color: '#f59e0b', bg: '#fffbeb' },
  agent: { label: 'Agents', icon: 'bi-cpu', color: '#6366f1', bg: '#eef2ff' },
  infra: { label: 'Infrastructure', icon: 'bi-cloud', color: '#64748b', bg: '#f8fafc' },
};

const LAYER_ORDER = ['frontend', 'api', 'service', 'data', 'agent'];

export default function SystemArchitectureCard() {
  const [model, setModel] = useState<SystemModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/project/system-model')
      .then(res => {
        if (res.data?.error === 'no_repo') setError('no_repo');
        else setModel(res.data);
      })
      .catch(() => setError('failed'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card border-0 shadow-sm mb-3"><div className="card-body text-center py-3"><span className="spinner-border spinner-border-sm"></span></div></div>;

  if (error === 'no_repo') return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body text-center py-4">
        <i className="bi bi-diagram-3 d-block mb-2" style={{ fontSize: 28, color: 'var(--color-text-light)' }}></i>
        <div className="small text-muted">Connect your GitHub repository to see system architecture</div>
      </div>
    </div>
  );

  if (!model || error) return null;

  const activeLayers = LAYER_ORDER.filter(l => (model.layers[l]?.count || 0) > 0);
  const selectedComponents = selectedLayer
    ? model.components.filter(c => c.layer === selectedLayer)
    : [];

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
        <div>
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            <i className="bi bi-diagram-3 me-2"></i>System Architecture
          </span>
          <span className="text-muted ms-2" style={{ fontSize: 10 }}>
            {model.file_count} files · {model.components.length} components · {model.primary_language}
          </span>
        </div>
        <div className="d-flex gap-2 align-items-center">
          {model.frameworks.map(f => (
            <span key={f} className="badge" style={{ fontSize: 8, background: '#f1f5f9', color: '#475569' }}>{f}</span>
          ))}
          <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 9, padding: '2px 6px' }}
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                const res = await portalApi.post('/api/portal/project/system-model/refresh');
                if (res.data && !res.data.error) setModel(res.data);
              } catch {} finally { setRefreshing(false); }
            }}>
            {refreshing ? <span className="spinner-border spinner-border-sm" style={{ width: 10, height: 10 }}></span> : <i className="bi bi-arrow-clockwise"></i>}
          </button>
        </div>
      </div>
      <div className="card-body p-3">
        {/* Architecture Flow Diagram */}
        <div className="d-flex align-items-center justify-content-center gap-2 mb-3" style={{ minHeight: 80 }}>
          {activeLayers.map((layer, i) => {
            const config = LAYER_CONFIG[layer];
            const layerData = model.layers[layer];
            const isSelected = selectedLayer === layer;
            return (
              <React.Fragment key={layer}>
                {i > 0 && (
                  <i className="bi bi-arrow-right" style={{ color: 'var(--color-text-light)', fontSize: 12 }}></i>
                )}
                <div
                  className="text-center p-2"
                  style={{
                    background: isSelected ? config.color + '15' : config.bg,
                    border: `2px solid ${isSelected ? config.color : config.color + '30'}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    minWidth: 90,
                    transition: 'all 0.15s',
                  }}
                  onClick={() => setSelectedLayer(isSelected ? null : layer)}
                >
                  <i className={`bi ${config.icon} d-block`} style={{ fontSize: 18, color: config.color }}></i>
                  <div className="fw-medium" style={{ fontSize: 10, color: config.color }}>{config.label}</div>
                  <div className="text-muted" style={{ fontSize: 9 }}>{layerData.count} files</div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Architecture style badge */}
        <div className="text-center mb-2">
          <span className="badge" style={{ fontSize: 9, background: '#f1f5f9', color: '#475569' }}>
            {model.architecture_style} architecture
          </span>
          {model.infrastructure.length > 0 && (
            <span className="badge ms-1" style={{ fontSize: 9, background: '#f1f5f9', color: '#475569' }}>
              <i className="bi bi-box me-1"></i>{model.infrastructure.length} containers
            </span>
          )}
        </div>

        {/* Layer Detail Panel */}
        {selectedLayer && selectedComponents.length > 0 && (
          <div className="mt-2 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span className="fw-medium small" style={{ color: LAYER_CONFIG[selectedLayer]?.color }}>
                <i className={`bi ${LAYER_CONFIG[selectedLayer]?.icon} me-1`}></i>
                {LAYER_CONFIG[selectedLayer]?.label} ({selectedComponents.length} components, {model.layers[selectedLayer]?.count} files)
              </span>
              <button className="btn btn-sm" style={{ fontSize: 9, padding: '0 4px' }} onClick={() => setSelectedLayer(null)}>
                <i className="bi bi-x"></i>
              </button>
            </div>
            {selectedComponents.sort((a, b) => b.file_count - a.file_count).map(comp => (
              <div key={comp.id} className="py-1" style={{ borderBottom: '1px solid var(--color-border)', fontSize: 10 }}>
                <div className="d-flex justify-content-between">
                  <span className="fw-medium">{comp.name}</span>
                  <span className="text-muted">{comp.file_count} files</span>
                </div>
                {comp.files.slice(0, 3).map(f => (
                  <div key={f} className="text-muted" style={{ fontSize: 9, paddingLeft: 8 }}>{f.split('/').pop()}</div>
                ))}
                {comp.files.length > 3 && <div className="text-muted" style={{ fontSize: 9, paddingLeft: 8 }}>+{comp.files.length - 3} more</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
