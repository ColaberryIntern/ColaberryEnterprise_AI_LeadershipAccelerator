import { useState, useEffect, useCallback } from 'react';
import { getInitiativeDetail } from '../../../services/intelligenceApi';

interface Props {
  initiativeId: string | null;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'secondary',
  active: 'primary',
  completed: 'success',
  on_hold: 'warning',
  cancelled: 'danger',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

export default function InitiativeStoryModal({ initiativeId, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!initiativeId) return;
    setLoading(true);
    try {
      const { data: result } = await getInitiativeDetail(initiativeId);
      setData(result);
    } catch { /* ignore */ }
    setLoading(false);
  }, [initiativeId]);

  useEffect(() => {
    if (initiativeId) fetchData();
  }, [initiativeId, fetchData]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!initiativeId) return null;

  const story = data?.metadata?.story;
  const computed = data?.computed;
  const dept = data?.department;
  const milestones = story?.milestones || [];
  const completedMilestones = milestones.filter((m: any) => m.completed).length;

  return (
    <div className="modal show d-block" style={{ zIndex: 2000 }} role="dialog" aria-modal="true">
      <div className="modal-backdrop show" style={{ opacity: 0.5 }} onClick={onClose} />
      <div className="modal-dialog modal-lg modal-dialog-scrollable" style={{ zIndex: 2001 }}>
        <div className="modal-content border-0 shadow">
          {loading ? (
            <div className="modal-body text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <span className="text-muted">Loading initiative story...</span>
            </div>
          ) : !data ? (
            <div className="modal-body text-center py-5">
              <span className="text-muted">Could not load initiative details.</span>
              <div className="mt-3">
                <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Close</button>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div
                className="modal-header border-0 py-3"
                style={{ background: dept?.color || 'var(--color-primary)', color: '#fff' }}
              >
                <div>
                  <h5 className="modal-title mb-1" style={{ fontSize: '1rem' }}>{data.title}</h5>
                  <div className="d-flex align-items-center gap-2" style={{ fontSize: '0.75rem' }}>
                    {dept && <span style={{ opacity: 0.8 }}>{dept.name}</span>}
                    <span className={`badge bg-${STATUS_COLORS[data.status] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                      {data.status}
                    </span>
                    <span className={`badge bg-${PRIORITY_COLORS[data.priority] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                      {data.priority}
                    </span>
                  </div>
                </div>
                <button className="btn-close btn-close-white" onClick={onClose} aria-label="Close" />
              </div>

              <div className="modal-body p-0">
                {/* Duration Stats */}
                <div className="px-4 py-3 border-bottom" style={{ background: 'var(--color-bg-alt)' }}>
                  <div className="row g-3 text-center">
                    <div className="col-3">
                      <div className="fw-bold" style={{ fontSize: '1.3rem', color: dept?.color }}>
                        {computed?.days_elapsed || 0}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.65rem' }}>Days Working</div>
                    </div>
                    <div className="col-3">
                      <div className="fw-bold" style={{ fontSize: '1.3rem', color: dept?.color }}>
                        {computed?.total_planned_days || 0}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.65rem' }}>Total Planned</div>
                    </div>
                    <div className="col-3">
                      <div className="fw-bold" style={{ fontSize: '1.3rem', color: dept?.color }}>
                        {computed?.days_remaining != null ? computed.days_remaining : '—'}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.65rem' }}>Days Left</div>
                    </div>
                    <div className="col-3">
                      <div className="fw-bold" style={{ fontSize: '1.3rem', color: data.progress >= 80 ? 'var(--color-accent)' : dept?.color }}>
                        {data.progress}%
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.65rem' }}>Progress</div>
                    </div>
                  </div>
                  <div className="progress mt-2" style={{ height: 6 }}>
                    <div
                      className={`progress-bar bg-${data.progress >= 80 ? 'success' : 'primary'}`}
                      style={{ width: `${data.progress}%` }}
                    />
                  </div>
                  {computed?.on_schedule != null && (
                    <div className="text-center mt-1" style={{ fontSize: '0.65rem' }}>
                      <span className={`badge bg-${computed.on_schedule ? 'success' : 'warning'}`} style={{ fontSize: '0.6rem' }}>
                        {computed.on_schedule ? 'On Schedule' : 'Behind Schedule'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Description */}
                {data.description && (
                  <div className="px-4 py-3 border-bottom">
                    <div className="fw-semibold small mb-1" style={{ color: dept?.color }}>Description</div>
                    <div className="text-muted small">{data.description}</div>
                  </div>
                )}

                {/* Why This Was Chosen */}
                {story?.rationale && (
                  <div className="px-4 py-3 border-bottom">
                    <div className="fw-semibold small mb-1" style={{ color: dept?.color }}>Why This Capability Was Chosen</div>
                    <div className="text-muted small">{story.rationale}</div>
                  </div>
                )}

                {/* Approval Process */}
                {story?.approval && (
                  <div className="px-4 py-3 border-bottom">
                    <div className="fw-semibold small mb-1" style={{ color: dept?.color }}>Approval Process</div>
                    <div className="small mb-2">
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted">Approved By</span>
                        <span className="fw-medium">{story.approval.approved_by}</span>
                      </div>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted">Approval Date</span>
                        <span className="fw-medium">{story.approval.approved_date}</span>
                      </div>
                    </div>
                    <div className="rounded-2 p-2" style={{ background: dept?.bg_light || 'var(--color-bg-alt)', fontSize: '0.75rem' }}>
                      <span className="fw-medium">Process: </span>
                      <span className="text-muted">{story.approval.process}</span>
                    </div>
                  </div>
                )}

                {/* Team Members */}
                {story?.team && story.team.length > 0 && (
                  <div className="px-4 py-3 border-bottom">
                    <div className="fw-semibold small mb-2" style={{ color: dept?.color }}>
                      Team ({story.team.length} member{story.team.length !== 1 ? 's' : ''})
                    </div>
                    <div className="row g-2">
                      {story.team.map((member: any, i: number) => (
                        <div key={i} className="col-6">
                          <div className="d-flex align-items-center gap-2 p-2 rounded-2" style={{ background: 'var(--color-bg-alt)' }}>
                            <div
                              className="rounded-circle d-flex align-items-center justify-content-center fw-bold"
                              style={{
                                width: 32, height: 32, fontSize: '0.7rem',
                                background: dept?.color || 'var(--color-primary)', color: '#fff',
                              }}
                            >
                              {member.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <div className="fw-medium" style={{ fontSize: '0.75rem' }}>{member.name}</div>
                              <div className="text-muted" style={{ fontSize: '0.65rem' }}>{member.role}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Milestones Timeline */}
                {milestones.length > 0 && (
                  <div className="px-4 py-3 border-bottom">
                    <div className="fw-semibold small mb-2" style={{ color: dept?.color }}>
                      Build Timeline ({completedMilestones}/{milestones.length} milestones)
                    </div>
                    <div style={{ position: 'relative', paddingLeft: 20 }}>
                      {/* Vertical line */}
                      <div style={{
                        position: 'absolute', left: 6, top: 4, bottom: 4, width: 2,
                        background: `linear-gradient(to bottom, ${dept?.color || 'var(--color-primary)'} ${(completedMilestones / milestones.length) * 100}%, var(--color-border) ${(completedMilestones / milestones.length) * 100}%)`,
                      }} />
                      {milestones.map((m: any, i: number) => (
                        <div key={i} className="d-flex align-items-start gap-2 mb-3" style={{ position: 'relative' }}>
                          <div
                            style={{
                              position: 'absolute', left: -17, top: 2,
                              width: 14, height: 14, borderRadius: '50%',
                              background: m.completed ? (dept?.color || 'var(--color-primary)') : '#fff',
                              border: `2px solid ${m.completed ? (dept?.color || 'var(--color-primary)') : 'var(--color-border)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.5rem', color: '#fff',
                            }}
                          >
                            {m.completed && '\u2713'}
                          </div>
                          <div>
                            <div className={`small ${m.completed ? 'fw-medium' : 'text-muted'}`}>{m.title}</div>
                            <div style={{ fontSize: '0.65rem' }} className="text-muted">{m.date}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Details */}
                <div className="px-4 py-3 border-bottom">
                  <div className="fw-semibold small mb-2" style={{ color: dept?.color }}>Key Details</div>
                  <div className="row g-2 small">
                    <div className="col-6">
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">Owner</span>
                        <span className="fw-medium">{data.owner || '—'}</span>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">Risk Level</span>
                        <span className={`badge bg-${PRIORITY_COLORS[data.risk_level] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                          {data.risk_level}
                        </span>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">Start Date</span>
                        <span className="fw-medium">{data.start_date || '—'}</span>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">Target Date</span>
                        <span className="fw-medium">{data.target_date || '—'}</span>
                      </div>
                    </div>
                    {data.revenue_impact > 0 && (
                      <div className="col-12">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">Revenue Impact (Projected)</span>
                          <span className="fw-bold" style={{ color: 'var(--color-accent)' }}>
                            ${(data.revenue_impact / 1000).toFixed(0)}K
                          </span>
                        </div>
                      </div>
                    )}
                    {data.completed_date && (
                      <div className="col-6">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">Completed</span>
                          <span className="fw-medium text-success">{data.completed_date}</span>
                        </div>
                      </div>
                    )}
                    {computed?.actual_duration_days != null && (
                      <div className="col-6">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">Actual Duration</span>
                          <span className="fw-medium">{computed.actual_duration_days} days</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Related Events */}
                {data.events && data.events.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="fw-semibold small mb-2" style={{ color: dept?.color }}>Recent Activity</div>
                    {data.events.map((evt: any) => (
                      <div key={evt.id} className="d-flex align-items-start gap-2 mb-2 small">
                        <span className="badge bg-secondary" style={{ fontSize: '0.55rem', marginTop: 2 }}>
                          {evt.event_type}
                        </span>
                        <div>
                          <div className="fw-medium">{evt.title}</div>
                          {evt.description && (
                            <div className="text-muted" style={{ fontSize: '0.7rem' }}>{evt.description}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-footer border-0 py-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
