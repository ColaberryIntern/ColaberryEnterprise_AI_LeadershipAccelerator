import { useState, useEffect, useCallback } from 'react';
import { getDepartmentDetail } from '../../../services/intelligenceApi';
import InitiativeStoryModal from './InitiativeStoryModal';

interface Props {
  departmentId: string;
  isOpen: boolean;
  onClose: () => void;
  onSwitchToCory: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

const ALL_SECTION_KEYS = ['overview', 'achievements', 'risks', 'building', 'maintenance', 'objectives', 'kpis'];

export default function DepartmentDrawer({ departmentId, isOpen, onClose, onSwitchToCory }: Props) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [storyInitiativeId, setStoryInitiativeId] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const { data } = await getDepartmentDetail(departmentId);
      setDetail(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [departmentId]);

  useEffect(() => {
    if (isOpen && departmentId) {
      fetchDetail();
    }
  }, [isOpen, departmentId, fetchDetail]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const allExpanded = expandedSections.size === ALL_SECTION_KEYS.length;

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setExpandedSections(allExpanded ? new Set() : new Set(ALL_SECTION_KEYS));
  };

  const overview = detail?.overview;

  const sections = [
    { key: 'overview', label: 'Overview', count: null },
    { key: 'achievements', label: 'Achievements', count: detail?.achievements?.length },
    { key: 'risks', label: 'Risks', count: detail?.risks?.length },
    { key: 'building', label: 'Building', count: detail?.building?.length },
    { key: 'maintenance', label: 'Maintenance', count: detail?.maintenance?.length },
    { key: 'objectives', label: 'Strategic Objectives', count: detail?.strategic_objectives?.length },
    { key: 'kpis', label: 'KPIs', count: detail?.kpis?.length },
  ];

  return (
    <div
      className="intel-panel-slide"
      role="complementary"
      aria-label="Department Intelligence Drawer"
      style={{
        width: isOpen ? 400 : 0,
        minWidth: isOpen ? 400 : 0,
        overflow: 'hidden',
        borderLeft: isOpen ? '1px solid var(--color-border)' : 'none',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
      }}
    >
      {isOpen && (
        <div style={{ width: 400, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div
            className="d-flex align-items-center justify-content-between px-3 py-2"
            style={{ background: overview?.color || 'var(--color-primary)', color: '#fff', flexShrink: 0 }}
          >
            <div className="d-flex align-items-center gap-2">
              <span className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                {overview?.name || 'Department'}
              </span>
            </div>
            <div className="d-flex gap-1">
              <button
                className="btn btn-sm px-2 py-0"
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.7rem', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={toggleAll}
                title={allExpanded ? 'Collapse All' : 'Expand All'}
              >
                {allExpanded ? 'Collapse' : 'Expand'}
              </button>
              <button
                className="btn btn-sm px-2 py-0"
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.7rem', border: '1px solid rgba(255,255,255,0.3)' }}
                onClick={onSwitchToCory}
                title="Switch to Cory"
              >
                Cory
              </button>
              <button
                className="btn-close btn-close-white"
                style={{ fontSize: '0.55rem' }}
                onClick={onClose}
                aria-label="Close drawer"
              />
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5">
                <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <small className="text-muted">Loading department data...</small>
              </div>
            ) : !detail ? (
              <div className="text-center text-muted py-5">
                <small>Could not load department data.</small>
              </div>
            ) : (
              <div>
                {sections.map((section) => (
                  <div key={section.key} className="border-bottom">
                    <button
                      className="btn w-100 text-start px-3 py-2 d-flex justify-content-between align-items-center"
                      style={{ fontSize: '0.78rem', background: expandedSections.has(section.key) ? 'var(--color-bg-alt)' : 'transparent' }}
                      onClick={() => toggleSection(section.key)}
                    >
                      <span className="fw-semibold">{section.label}</span>
                      <span className="d-flex align-items-center gap-1">
                        {section.count != null && section.count > 0 && (
                          <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{section.count}</span>
                        )}
                        <span style={{ fontSize: '0.65rem' }}>{expandedSections.has(section.key) ? '▾' : '▸'}</span>
                      </span>
                    </button>

                    {expandedSections.has(section.key) && (
                      <div className="px-3 pb-3">
                        {section.key === 'overview' && overview && (
                          <div>
                            <div className="text-muted small mb-2">{overview.mission}</div>
                            <div className="row g-2 mb-2">
                              <div className="col-4">
                                <div className="rounded-2 p-2 text-center" style={{ background: overview.bg_light || '#f7fafc' }}>
                                  <div className="fw-bold" style={{ color: overview.color }}>{Math.round(overview.health_score)}</div>
                                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Health</div>
                                </div>
                              </div>
                              <div className="col-4">
                                <div className="rounded-2 p-2 text-center" style={{ background: overview.bg_light || '#f7fafc' }}>
                                  <div className="fw-bold" style={{ color: overview.color }}>{Math.round(overview.innovation_score)}</div>
                                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Innovation</div>
                                </div>
                              </div>
                              <div className="col-4">
                                <div className="rounded-2 p-2 text-center" style={{ background: overview.bg_light || '#f7fafc' }}>
                                  <div className="fw-bold" style={{ color: overview.color }}>{overview.team_size}</div>
                                  <div className="text-muted" style={{ fontSize: '0.6rem' }}>Team</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {section.key === 'achievements' && (
                          <div>
                            {(detail.achievements || []).map((a: any) => (
                              <div key={a.id} className="mb-2 small">
                                <div className="fw-medium">{a.title}</div>
                                {a.description && <div className="text-muted" style={{ fontSize: '0.7rem' }}>{a.description}</div>}
                              </div>
                            ))}
                            {(!detail.achievements || detail.achievements.length === 0) && (
                              <div className="text-muted small">No achievements yet.</div>
                            )}
                          </div>
                        )}

                        {section.key === 'risks' && (
                          <div>
                            {(detail.risks || []).map((r: any, i: number) => (
                              <div
                                key={r.id || i}
                                className="mb-2 small"
                                style={{ cursor: r.event_type === 'initiative_risk' ? 'pointer' : 'default', padding: '4px 6px', borderRadius: 4 }}
                                onClick={() => r.event_type === 'initiative_risk' && setStoryInitiativeId(r.id)}
                                onMouseEnter={(e) => { if (r.event_type === 'initiative_risk') (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-alt)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div className="d-flex align-items-center gap-1">
                                  {r.severity && (
                                    <span className={`badge bg-${PRIORITY_COLORS[r.severity] || 'secondary'}`} style={{ fontSize: '0.55rem' }}>
                                      {r.severity}
                                    </span>
                                  )}
                                  <span className="fw-medium" style={r.event_type === 'initiative_risk' ? { color: 'var(--color-primary-light)' } : {}}>{r.title}</span>
                                </div>
                                {r.description && <div className="text-muted" style={{ fontSize: '0.7rem' }}>{r.description}</div>}
                              </div>
                            ))}
                            {(!detail.risks || detail.risks.length === 0) && (
                              <div className="text-muted small">No active risks.</div>
                            )}
                          </div>
                        )}

                        {section.key === 'building' && (
                          <div>
                            {(detail.building || []).map((init: any) => (
                              <div
                                key={init.id}
                                className="mb-2 small"
                                style={{ cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}
                                onClick={() => setStoryInitiativeId(init.id)}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-alt)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <span className="fw-medium" style={{ color: 'var(--color-primary-light)' }}>{init.title}</span>
                                  <span className={`badge bg-${PRIORITY_COLORS[init.priority] || 'secondary'}`} style={{ fontSize: '0.55rem' }}>
                                    {init.priority}
                                  </span>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                  <div className="progress flex-grow-1" style={{ height: 5 }}>
                                    <div
                                      className={`progress-bar bg-${init.progress >= 80 ? 'success' : 'primary'}`}
                                      style={{ width: `${init.progress}%` }}
                                    />
                                  </div>
                                  <span className="text-muted" style={{ fontSize: '0.65rem' }}>{init.progress}%</span>
                                </div>
                                {init.owner && <div className="text-muted" style={{ fontSize: '0.65rem' }}>Owner: {init.owner}</div>}
                              </div>
                            ))}
                            {(!detail.building || detail.building.length === 0) && (
                              <div className="text-muted small">No active initiatives.</div>
                            )}
                          </div>
                        )}

                        {section.key === 'maintenance' && (
                          <div>
                            {(detail.maintenance || []).map((init: any) => (
                              <div
                                key={init.id}
                                className="mb-2 small"
                                style={{ cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}
                                onClick={() => setStoryInitiativeId(init.id)}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-alt)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div className="fw-medium" style={{ color: 'var(--color-primary-light)' }}>{init.title}</div>
                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Status: On Hold · {init.owner || 'Unassigned'}</div>
                              </div>
                            ))}
                            {(!detail.maintenance || detail.maintenance.length === 0) && (
                              <div className="text-muted small">No maintenance items.</div>
                            )}
                          </div>
                        )}

                        {section.key === 'objectives' && (
                          <div>
                            {(detail.strategic_objectives || []).map((obj: any, i: number) => (
                              <div key={i} className="mb-2 small">
                                <div className="fw-medium mb-1">{obj.title}</div>
                                <div className="d-flex align-items-center gap-2">
                                  <div className="progress flex-grow-1" style={{ height: 5 }}>
                                    <div
                                      className={`progress-bar bg-${obj.progress >= 80 ? 'success' : obj.progress >= 50 ? 'primary' : 'warning'}`}
                                      style={{ width: `${obj.progress}%` }}
                                    />
                                  </div>
                                  <span className="text-muted" style={{ fontSize: '0.65rem' }}>{obj.progress}%</span>
                                </div>
                              </div>
                            ))}
                            {(!detail.strategic_objectives || detail.strategic_objectives.length === 0) && (
                              <div className="text-muted small">No strategic objectives defined.</div>
                            )}
                          </div>
                        )}

                        {section.key === 'kpis' && (
                          <div>
                            {(detail.kpis || []).map((kpi: any, i: number) => (
                              <div key={i} className="d-flex justify-content-between align-items-center mb-2 small">
                                <span className="text-muted">{kpi.name}</span>
                                <span className="fw-medium d-flex align-items-center gap-1">
                                  {kpi.value}{kpi.unit}
                                  <span style={{ fontSize: '0.6rem' }}>
                                    {kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→'}
                                  </span>
                                </span>
                              </div>
                            ))}
                            {(!detail.kpis || detail.kpis.length === 0) && (
                              <div className="text-muted small">No KPIs defined.</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <InitiativeStoryModal
        initiativeId={storyInitiativeId}
        onClose={() => setStoryInitiativeId(null)}
      />
    </div>
  );
}
