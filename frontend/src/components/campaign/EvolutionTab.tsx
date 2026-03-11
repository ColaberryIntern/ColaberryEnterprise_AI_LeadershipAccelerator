import React, { useEffect, useState } from 'react';

interface Variant {
  id: string;
  step_index: number;
  channel: string;
  variant_label: string;
  subject: string | null;
  body: string | null;
  status: string;
  sends: number;
  opens: number;
  replies: number;
  bounces: number;
  conversions: number;
  performance_score: number | null;
  generation_metadata: Record<string, any>;
  created_at: string;
}

interface RampState {
  current_phase: number;
  phase_sizes: number[];
  leads_enrolled_per_phase: Record<string, number>;
  phase_started_at: string | null;
  phase_health_score: number | null;
  status: string;
  evaluation_history: Array<{
    phase: number;
    health_score: number;
    decision: string;
    at: string;
  }>;
}

interface EvolutionConfig {
  enabled: boolean;
  evolution_frequency_sends: number;
  evolution_frequency_hours: number;
  last_evolution_at: string | null;
  sends_since_last_evolution: number;
  similarity_threshold: number;
  max_active_variants: number;
}

interface Props {
  campaignId: string;
  headers: Record<string, string>;
  rampState: RampState | null;
  evolutionConfig: EvolutionConfig | null;
  onRefresh: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  promoted: 'success',
  testing: 'info',
  active: 'primary',
  retired: 'secondary',
};

const RAMP_STATUS_BADGE: Record<string, string> = {
  ramping: 'success',
  evaluating: 'warning',
  paused_for_review: 'danger',
  complete: 'info',
};

export default function EvolutionTab({ campaignId, headers, rampState, evolutionConfig, onRefresh }: Props) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [rampInfo, setRampInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    loadData();
  }, [campaignId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [varRes, rampRes] = await Promise.all([
        fetch(`/api/admin/campaigns/${campaignId}/variants`, { headers }),
        fetch(`/api/admin/campaigns/${campaignId}/ramp-status`, { headers }),
      ]);
      if (varRes.ok) setVariants(await varRes.json());
      if (rampRes.ok) setRampInfo(await rampRes.json());
    } catch (err) {
      console.error('Failed to load evolution data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (url: string, method = 'POST') => {
    setActing(true);
    try {
      await fetch(url, { method, headers });
      await loadData();
      onRefresh();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const rs = rampState;
  const ec = evolutionConfig;
  const activeVariants = variants.filter(v => ['promoted', 'testing', 'active'].includes(v.status));
  const retiredVariants = variants.filter(v => v.status === 'retired');

  return (
    <div className="row g-4">
      {/* Ramp Status Panel */}
      <div className="col-12">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Ramp Status</span>
            {rs && rs.status !== 'complete' && (
              <button
                className="btn btn-sm btn-outline-primary"
                disabled={acting}
                onClick={() => handleAction(`/api/admin/campaigns/${campaignId}/ramp-advance`)}
              >
                Advance Phase
              </button>
            )}
          </div>
          <div className="card-body">
            {!rs ? (
              <p className="text-muted mb-0">No ramp state — campaign may not have been activated yet.</p>
            ) : (
              <>
                {/* Phase Progress */}
                <div className="d-flex gap-2 mb-3 align-items-center">
                  {rs.phase_sizes.map((_: number, i: number) => {
                    const phase = i + 1;
                    const isCurrent = phase === rs.current_phase;
                    const isComplete = phase < rs.current_phase || rs.status === 'complete';
                    return (
                      <div key={phase} className="d-flex align-items-center gap-1">
                        <div
                          className={`rounded-circle d-flex align-items-center justify-content-center ${
                            isComplete ? 'bg-success text-white' : isCurrent ? 'bg-primary text-white' : 'bg-light text-muted border'
                          }`}
                          style={{ width: 32, height: 32, fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          {phase}
                        </div>
                        {i < rs.phase_sizes.length - 1 && (
                          <div className={`${isComplete ? 'bg-success' : 'bg-light'}`} style={{ width: 24, height: 2 }} />
                        )}
                      </div>
                    );
                  })}
                  <span className={`badge bg-${RAMP_STATUS_BADGE[rs.status] || 'secondary'} ms-2`}>
                    {rs.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Phase Stats */}
                <div className="row g-3 mb-3">
                  <div className="col-auto">
                    <span className="text-muted small">Health Score: </span>
                    <strong className={rs.phase_health_score != null ? (rs.phase_health_score >= 70 ? 'text-success' : rs.phase_health_score >= 50 ? 'text-warning' : 'text-danger') : ''}>
                      {rs.phase_health_score != null ? rs.phase_health_score : '—'}
                    </strong>
                  </div>
                  <div className="col-auto">
                    <span className="text-muted small">Total Enrolled: </span>
                    <strong>{rampInfo?.total_enrolled || 0}</strong>
                  </div>
                  <div className="col-auto">
                    <span className="text-muted small">Available: </span>
                    <strong>{rampInfo?.total_available || 0}</strong>
                  </div>
                </div>

                {/* Leads per phase */}
                <div className="d-flex gap-3 small text-muted">
                  {rs.phase_sizes.map((_: number, i: number) => {
                    const phase = i + 1;
                    const size = rs.phase_sizes[i] === -1 ? 'All' : rs.phase_sizes[i];
                    const enrolled = rs.leads_enrolled_per_phase?.[String(phase)] || 0;
                    return (
                      <span key={phase}>Phase {phase}: {enrolled}/{size}</span>
                    );
                  })}
                </div>

                {/* Evaluation History */}
                {rs.evaluation_history.length > 0 && (
                  <div className="mt-3">
                    <small className="fw-medium text-muted">Phase History</small>
                    <div className="table-responsive mt-1">
                      <table className="table table-sm mb-0" style={{ fontSize: '0.8rem' }}>
                        <thead className="table-light">
                          <tr>
                            <th>Phase</th>
                            <th>Health</th>
                            <th>Decision</th>
                            <th>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rs.evaluation_history.map((h: any, i: number) => (
                            <tr key={i}>
                              <td>{h.phase}</td>
                              <td>{h.health_score}</td>
                              <td><span className="badge bg-light text-dark border">{h.decision}</span></td>
                              <td>{new Date(h.at).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Evolution Controls */}
      <div className="col-md-4">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">Evolution Controls</div>
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="small fw-medium">Message Evolution</span>
              <button
                className={`btn btn-sm ${ec?.enabled ? 'btn-success' : 'btn-outline-secondary'}`}
                disabled={acting}
                onClick={() => handleAction(`/api/admin/campaigns/${campaignId}/evolution/${ec?.enabled ? 'freeze' : 'unfreeze'}`)}
              >
                {ec?.enabled ? 'Active' : 'Frozen'}
              </button>
            </div>
            <div className="small text-muted">
              <div className="mb-1">Frequency: every {ec?.evolution_frequency_sends || 100} sends or {ec?.evolution_frequency_hours || 24}h</div>
              <div className="mb-1">Similarity threshold: {Math.round((ec?.similarity_threshold || 0.7) * 100)}%</div>
              <div className="mb-1">Max active variants: {ec?.max_active_variants || 3}</div>
              <div className="mb-1">Sends since last: {ec?.sends_since_last_evolution || 0}</div>
              {ec?.last_evolution_at && (
                <div>Last evolution: {new Date(ec.last_evolution_at).toLocaleString()}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Variants */}
      <div className="col-md-8">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            Message Variants ({activeVariants.length} active)
          </div>
          <div className="card-body p-0">
            {activeVariants.length === 0 ? (
              <p className="text-muted small p-3 mb-0">No active variants yet. The evolution engine generates variants after the first batch of sends.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                  <thead className="table-light">
                    <tr>
                      <th>Step</th>
                      <th>Ch</th>
                      <th>Variant</th>
                      <th>Status</th>
                      <th>Sends</th>
                      <th>Opens</th>
                      <th>Replies</th>
                      <th>Score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeVariants.map((v) => (
                      <tr key={v.id}>
                        <td>{v.step_index}</td>
                        <td>{v.channel}</td>
                        <td><strong>{v.variant_label}</strong></td>
                        <td><span className={`badge bg-${STATUS_BADGE[v.status] || 'secondary'}`}>{v.status}</span></td>
                        <td>{v.sends}</td>
                        <td>{v.opens}</td>
                        <td>{v.replies}</td>
                        <td>{v.performance_score != null ? v.performance_score.toFixed(2) : '—'}</td>
                        <td>
                          <div className="d-flex gap-1">
                            {v.status === 'testing' && (
                              <>
                                <button
                                  className="btn btn-sm btn-outline-success py-0 px-1"
                                  style={{ fontSize: '0.7rem' }}
                                  disabled={acting}
                                  onClick={() => handleAction(`/api/admin/campaigns/${campaignId}/variants/${v.id}/approve`)}
                                >
                                  Approve
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger py-0 px-1"
                                  style={{ fontSize: '0.7rem' }}
                                  disabled={acting}
                                  onClick={() => handleAction(`/api/admin/campaigns/${campaignId}/variants/${v.id}/reject`)}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Retired Variants */}
      {retiredVariants.length > 0 && (
        <div className="col-12">
          <details className="small">
            <summary className="text-muted fw-medium mb-2">{retiredVariants.length} retired variant(s)</summary>
            <div className="table-responsive">
              <table className="table table-sm mb-0" style={{ fontSize: '0.75rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Step</th>
                    <th>Ch</th>
                    <th>Variant</th>
                    <th>Sends</th>
                    <th>Opens</th>
                    <th>Replies</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {retiredVariants.map((v) => (
                    <tr key={v.id} className="text-muted">
                      <td>{v.step_index}</td>
                      <td>{v.channel}</td>
                      <td>{v.variant_label}</td>
                      <td>{v.sends}</td>
                      <td>{v.opens}</td>
                      <td>{v.replies}</td>
                      <td>{v.performance_score != null ? v.performance_score.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
