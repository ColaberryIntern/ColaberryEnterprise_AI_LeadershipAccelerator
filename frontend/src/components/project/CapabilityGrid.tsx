import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';
import CapabilityDetail from './CapabilityDetail';
import AIFeatureBuilder from './AIFeatureBuilder';

interface RequirementNode {
  id: string; key: string; text: string; status: string;
  is_active: boolean; github_file_paths: string[]; confidence_score: number;
}

interface FeatureNode {
  id: string; name: string; description: string; success_criteria: string;
  status: string; priority: string; completion_pct: number;
  total_active: number; completed_active: number; requirements: RequirementNode[];
}

interface CapabilityNode {
  id: string; name: string; description: string; status: string;
  priority: string; source: string; completion_pct: number;
  total_active: number; completed_active: number; features: FeatureNode[];
}

export default function CapabilityGrid() {
  const [capabilities, setCapabilities] = useState<CapabilityNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const loadCapabilities = () => {
    portalApi.get('/api/portal/project/capabilities')
      .then(res => setCapabilities(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCapabilities(); }, []);

  const handleToggle = async (type: string, id: string, active: boolean) => {
    try {
      const res = await portalApi.post('/api/portal/project/capabilities/scope', { type, id, active });
      setCapabilities(res.data);
    } catch {}
  };

  if (loading) return <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>;

  if (capabilities.length === 0) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-4">
          <i className="bi bi-grid-3x3-gap d-block mb-2" style={{ fontSize: 28, color: 'var(--color-text-light)' }}></i>
          <p className="text-muted small mb-2">No capabilities detected yet.</p>
          <p className="text-muted small mb-3">Capabilities are generated automatically when you activate your project with a requirements document.</p>
          <button className="btn btn-sm btn-primary" onClick={() => setShowBuilder(true)}>
            <i className="bi bi-plus-lg me-1"></i>Add Feature with AI
          </button>
          {showBuilder && <AIFeatureBuilder onCreated={loadCapabilities} onClose={() => setShowBuilder(false)} />}
        </div>
      </div>
    );
  }

  // Overall stats
  const totalActive = capabilities.reduce((s, c) => s + c.total_active, 0);
  const completedActive = capabilities.reduce((s, c) => s + c.completed_active, 0);
  const overallPct = totalActive > 0 ? Math.round((completedActive / totalActive) * 100) : 0;

  return (
    <div>
      {/* Overall progress */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div>
              <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
                <i className="bi bi-speedometer2 me-2"></i>Project Completion
              </h6>
              <span className="text-muted small">{completedActive}/{totalActive} active requirements completed</span>
            </div>
            <span className="fw-bold" style={{
              fontSize: 24,
              color: overallPct >= 75 ? 'var(--color-accent)' : overallPct >= 40 ? '#f59e0b' : 'var(--color-secondary)',
            }}>{overallPct}%</span>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div className="progress-bar" style={{
              width: `${overallPct}%`,
              background: overallPct >= 75 ? 'var(--color-accent)' : overallPct >= 40 ? '#f59e0b' : 'var(--color-secondary)',
            }} />
          </div>
        </div>
      </div>

      {/* Capability cards */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
          <i className="bi bi-grid-3x3-gap me-2"></i>Capabilities ({capabilities.length})
        </h6>
        <button className="btn btn-sm btn-outline-primary" onClick={() => setShowBuilder(true)}>
          <i className="bi bi-plus-lg me-1"></i>Add Feature
        </button>
      </div>

      <div className="row g-3 mb-4">
        {capabilities.map(cap => {
          const color = cap.status === 'disabled' ? '#9ca3af'
            : cap.completion_pct >= 75 ? 'var(--color-accent)'
            : cap.completion_pct >= 40 ? '#f59e0b' : 'var(--color-primary-light)';

          return (
            <div key={cap.id} className="col-md-6 col-lg-4">
              <div
                className="card border-0 shadow-sm h-100"
                style={{
                  borderLeft: `4px solid ${color}`,
                  opacity: cap.status === 'disabled' ? 0.6 : 1,
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(expanded === cap.id ? null : cap.id)}
              >
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <div className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>{cap.name}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>{cap.description}</div>
                    </div>
                    <div className="form-check form-switch" onClick={e => e.stopPropagation()}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={cap.status === 'active'}
                        onChange={e => handleToggle('capability', cap.id, e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                  <div className="progress mb-2" style={{ height: 5 }}>
                    <div className="progress-bar" style={{ width: `${cap.completion_pct}%`, background: color }} />
                  </div>
                  <div className="d-flex justify-content-between small text-muted">
                    <span>{cap.features.length} features</span>
                    <span className="fw-medium">{cap.completion_pct}%</span>
                  </div>
                  {cap.source === 'ai_generated' && (
                    <span className="badge bg-info bg-opacity-10 text-info mt-1" style={{ fontSize: 9 }}>
                      <i className="bi bi-stars me-1"></i>AI Generated
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <CapabilityDetail
          capability={capabilities.find(c => c.id === expanded)!}
          onToggle={handleToggle}
          onClose={() => setExpanded(null)}
        />
      )}

      {/* AI Feature Builder Modal */}
      {showBuilder && (
        <AIFeatureBuilder
          capabilities={capabilities}
          onCreated={loadCapabilities}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </div>
  );
}
