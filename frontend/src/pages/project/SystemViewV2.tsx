/**
 * System View V2 — Foundation Layer
 *
 * 3-section layout: System Map | Work Area | Control Panel
 * Reuses existing APIs — no new backend endpoints
 * componentId sync via URL param + local state
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import ProjectSetupWizard from '../../components/project/ProjectSetupWizard';
import ProjectSelectionScreen from '../../components/project/ProjectSelectionScreen';

// ---------------------------------------------------------------------------
// Types (reused from SystemBlueprint pattern)
// ---------------------------------------------------------------------------

interface SystemComponent {
  id: string;
  name: string;
  description: string;
  status: 'complete' | 'in_progress' | 'not_started';
  completion: number;
  maturity: string;
  maturityLevel: number;
  nextStep: string | null;
  promptTarget: string | null;
  isPageBP: boolean;
  layers: { backend: string; frontend: string; agent: string };
}

interface ProjectData {
  id: string;
  organization_name?: string;
  industry?: string;
  project_stage: string;
  setup_status?: { requirements_loaded: boolean; claude_md_loaded: boolean; github_connected: boolean; activated: boolean } | null;
}

// ---------------------------------------------------------------------------
// Transform (same logic as SystemBlueprint — no duplication of business rules)
// ---------------------------------------------------------------------------

const MATURITY_LABELS: Record<number, string> = {
  0: 'L0 Not Started', 1: 'L1 Prototype', 2: 'L2 Functional',
  3: 'L3 Production', 4: 'L4 Autonomous', 5: 'L5 Self-Optimizing',
};

const MATURITY_COLORS: Record<number, string> = {
  0: '#9ca3af', 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981', 5: '#8b5cf6',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  complete: { bg: '#10b98120', text: '#059669', label: 'Complete' },
  in_progress: { bg: '#f59e0b20', text: '#92400e', label: 'In Progress' },
  not_started: { bg: '#e2e8f020', text: '#9ca3af', label: 'Not Started' },
};

function transformBPs(bps: any[]): SystemComponent[] {
  return bps
    .filter((bp: any) => (bp.applicability_status || 'active') === 'active')
    .map((bp: any) => {
      const coverage = bp.metrics?.requirements_coverage || 0;
      const readiness = bp.metrics?.system_readiness || 0;
      const maturityLevel = bp.maturity?.level || 0;
      const isComplete = bp.is_complete === true;
      const isPageBP = bp.source === 'frontend_page' || bp.is_page_bp === true;
      const u = bp.usability || {};

      let status: 'complete' | 'in_progress' | 'not_started';
      if (isComplete) status = 'complete';
      else if (coverage > 10 || readiness > 10 || maturityLevel >= 1) status = 'in_progress';
      else status = 'not_started';

      const completion = Math.round(Math.max(coverage, readiness));
      const firstStep = (bp.execution_plan || []).find((s: any) => !s.blocked);

      return {
        id: bp.id,
        name: bp.name,
        description: bp.description || '',
        status,
        completion,
        maturity: MATURITY_LABELS[maturityLevel] || `L${maturityLevel}`,
        maturityLevel,
        nextStep: firstStep?.label || null,
        promptTarget: firstStep?.prompt_target || null,
        isPageBP,
        layers: {
          backend: u.backend || 'missing',
          frontend: u.frontend || 'missing',
          agent: u.agent || 'missing',
        },
      };
    })
    .sort((a, b) => {
      if (a.status === 'complete' && b.status !== 'complete') return 1;
      if (a.status !== 'complete' && b.status === 'complete') return -1;
      return 0;
    });
}

// ---------------------------------------------------------------------------
// System View V2 Page
// ---------------------------------------------------------------------------

export default function SystemViewV2() {
  const [searchParams] = useSearchParams();
  const urlComponentId = searchParams.get('componentId');

  const [project, setProject] = useState<ProjectData | null>(null);
  const [components, setComponents] = useState<SystemComponent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(urlComponentId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync URL param → state
  useEffect(() => {
    if (urlComponentId) setSelectedId(urlComponentId);
  }, [urlComponentId]);

  const loadData = useCallback(() => {
    return Promise.all([
      portalApi.get('/api/portal/project'),
      portalApi.get('/api/portal/project/business-processes'),
    ]).then(([projRes, bpRes]) => {
      setProject(projRes.data);
      setComponents(transformBPs(bpRes.data || []));
    });
  }, []);

  useEffect(() => {
    loadData()
      .catch((err: any) => {
        if (err.response?.status === 404) setError('no-project');
        else setError(err.response?.data?.error || 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [loadData]);

  // Render guards
  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
        <p className="text-muted mt-2" style={{ fontSize: 13 }}>Loading System View V2...</p>
      </div>
    );
  }

  if (error === 'no-project') return <ProjectSelectionScreen />;
  if (project?.setup_status && !project.setup_status.activated) {
    return <ProjectSetupWizard initialStatus={project.setup_status} onActivated={() => window.location.reload()} />;
  }
  if (error || !project) {
    return <div className="alert alert-danger">{error || 'Failed to load project'}</div>;
  }

  const selectedComponent = selectedId ? components.find(c => c.id === selectedId) : null;
  const completedCount = components.filter(c => c.status === 'complete').length;
  const systemLayers = {
    backend: components.some(c => c.layers.backend === 'ready' || c.layers.backend === 'partial'),
    frontend: components.some(c => c.layers.frontend === 'ready' || c.layers.frontend === 'partial'),
    agents: components.some(c => c.layers.agent === 'ready' || c.layers.agent === 'partial'),
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            {project.organization_name || 'AI Project'}
            <span className="badge ms-2" style={{ background: '#8b5cf620', color: '#8b5cf6', fontSize: 10, verticalAlign: 'middle' }}>V2</span>
          </h4>
          <div className="d-flex align-items-center gap-2">
            {project.industry && (
              <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10 }}>{project.industry}</span>
            )}
            <span className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 10 }}>
              {project.project_stage?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span className="text-muted" style={{ fontSize: 10 }}>{completedCount}/{components.length} components complete</span>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Link to="/portal/project/system" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }}>
            <i className="bi bi-arrow-left me-1"></i>Back to V1
          </Link>
          <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }}>
            <i className="bi bi-map me-1"></i>Blueprint
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1: SYSTEM MAP
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-3" data-testid="system-map-section" style={{ minHeight: 280 }}>
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h6 className="fw-bold mb-1" style={{ fontSize: 14, color: 'var(--color-primary)' }}>
                <i className="bi bi-diagram-3 me-2"></i>System Map
              </h6>
              <p className="text-muted mb-0" style={{ fontSize: 11 }}>Visual representation of your system components</p>
            </div>
            <div className="d-flex gap-2">
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: systemLayers.backend ? '#10b981' : '#e2e8f0' }}></div>
                <span className="text-muted">Backend</span>
              </div>
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: systemLayers.frontend ? '#10b981' : '#e2e8f0' }}></div>
                <span className="text-muted">Frontend</span>
              </div>
              <div className="d-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: systemLayers.agents ? '#10b981' : '#e2e8f0' }}></div>
                <span className="text-muted">Agents</span>
              </div>
            </div>
          </div>

          {/* Component grid — clickable nodes */}
          <div className="d-flex flex-wrap gap-2">
            {components.map(comp => {
              const ss = STATUS_STYLES[comp.status];
              const mc = MATURITY_COLORS[comp.maturityLevel] || '#9ca3af';
              const isSelected = comp.id === selectedId;
              return (
                <div
                  key={comp.id}
                  onClick={() => setSelectedId(isSelected ? null : comp.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: isSelected ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    minWidth: 120,
                  }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: mc, flexShrink: 0 }}></div>
                    <span className="fw-medium" style={{ fontSize: 11 }}>{comp.name}</span>
                  </div>
                  <div className="d-flex align-items-center gap-2 mt-1">
                    <div className="progress flex-grow-1" style={{ height: 3, borderRadius: 2 }}>
                      <div className="progress-bar" style={{ width: `${comp.completion}%`, background: mc, borderRadius: 2 }}></div>
                    </div>
                    <span style={{ fontSize: 9, color: ss.text }}>{comp.completion}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2: WORK AREA
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-3" data-testid="work-area-section" style={{ minHeight: 200 }}>
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3" style={{ fontSize: 14, color: 'var(--color-primary)' }}>
            <i className="bi bi-hammer me-2"></i>Work Area
          </h6>

          {selectedComponent ? (
            <div>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-bold" style={{ fontSize: 15, color: 'var(--color-text)' }}>
                  {selectedComponent.isPageBP && <i className="bi bi-layout-wtf me-1" style={{ color: '#8b5cf6' }}></i>}
                  {selectedComponent.name}
                </span>
                <span className="badge" style={{ background: STATUS_STYLES[selectedComponent.status].bg, color: STATUS_STYLES[selectedComponent.status].text, fontSize: 9 }}>
                  {STATUS_STYLES[selectedComponent.status].label}
                </span>
                <span className="badge" style={{ background: `${MATURITY_COLORS[selectedComponent.maturityLevel]}20`, color: MATURITY_COLORS[selectedComponent.maturityLevel], fontSize: 9 }}>
                  {selectedComponent.maturity}
                </span>
              </div>

              {selectedComponent.description && (
                <p className="text-muted mb-2" style={{ fontSize: 12 }}>{selectedComponent.description}</p>
              )}

              <div className="mb-3">
                <div className="d-flex justify-content-between mb-1" style={{ fontSize: 10 }}>
                  <span className="text-muted">Completion</span>
                  <span className="fw-semibold">{selectedComponent.completion}%</span>
                </div>
                <div className="progress" style={{ height: 6, borderRadius: 3 }}>
                  <div className="progress-bar" style={{ width: `${selectedComponent.completion}%`, background: MATURITY_COLORS[selectedComponent.maturityLevel], borderRadius: 3 }}></div>
                </div>
              </div>

              <div className="d-flex gap-3 mb-3" style={{ fontSize: 11 }}>
                <span>Backend: <strong style={{ color: selectedComponent.layers.backend === 'ready' ? '#059669' : '#9ca3af' }}>{selectedComponent.layers.backend}</strong></span>
                <span>Frontend: <strong style={{ color: selectedComponent.layers.frontend === 'ready' ? '#059669' : '#9ca3af' }}>{selectedComponent.layers.frontend}</strong></span>
                <span>Agents: <strong style={{ color: selectedComponent.layers.agent === 'ready' ? '#059669' : '#9ca3af' }}>{selectedComponent.layers.agent}</strong></span>
              </div>

              {selectedComponent.nextStep && (
                <div className="p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 11 }}>
                  <i className="bi bi-arrow-right-circle me-1" style={{ color: 'var(--color-primary)' }}></i>
                  Next step: <strong>{selectedComponent.nextStep}</strong>
                </div>
              )}

              <div className="mt-3 text-muted" style={{ fontSize: 10, fontStyle: 'italic' }}>
                Full build + execution controls coming in V2 Phase 2
              </div>
            </div>
          ) : (
            <div className="text-center py-4" data-testid="work-area-empty">
              <i className="bi bi-cursor-fill d-block mb-2" style={{ fontSize: 24, color: '#9ca3af' }}></i>
              <p className="text-muted mb-0" style={{ fontSize: 12 }}>Select a component from the System Map to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3: CONTROL PANEL
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-4" data-testid="control-panel-section" style={{ minHeight: 220, borderLeft: '4px solid #8b5cf6' }}>
        <div className="card-body p-4">
          <div className="d-flex align-items-center gap-2 mb-3">
            <i className="bi bi-robot" style={{ color: '#8b5cf6', fontSize: 16 }}></i>
            <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: '#8b5cf6' }}>
              Cory Command Center
            </h6>
            <span className="badge" style={{ background: '#8b5cf620', color: '#8b5cf6', fontSize: 8 }}>V2</span>
          </div>
          <p className="text-muted mb-3" style={{ fontSize: 11 }}>
            Suggestions and execution controls will appear here. This panel will integrate Cory's plan engine, autonomous execution, and real-time system feedback.
          </p>

          {selectedComponent ? (
            <div className="p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
              <div className="d-flex align-items-center gap-2" style={{ fontSize: 11, color: '#8b5cf6' }}>
                <i className="bi bi-lightning-fill"></i>
                <span>
                  Ready to assist with <strong>{selectedComponent.name}</strong>
                  {selectedComponent.nextStep && <> — next: {selectedComponent.nextStep}</>}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 text-center" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
              <span className="text-muted" style={{ fontSize: 11 }}>Select a component to see recommendations</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
