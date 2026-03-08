import React, { useState, useEffect } from 'react';

interface AnalyticsTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

interface CompletionRate {
  session_id: string;
  session_number: number;
  title: string;
  total_enrollments: number;
  completed: number;
  rate: number;
}

interface BuildTracker {
  enrollment_id: string;
  name: string;
  total_required: number;
  completed: number;
  unlocked: boolean;
}

interface PresentationReady {
  enrollment_id: string;
  name: string;
  total_required: number;
  completed: number;
  ready: boolean;
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ token, cohortId, apiUrl }) => {
  const [completionRates, setCompletionRates] = useState<CompletionRate[]>([]);
  const [buildTracker, setBuildTracker] = useState<BuildTracker[]>([]);
  const [presentationReady, setPresentationReady] = useState<PresentationReady[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cohortId) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${apiUrl}/api/admin/orchestration/analytics/completion/${cohortId}`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${apiUrl}/api/admin/orchestration/analytics/build-phase/${cohortId}`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${apiUrl}/api/admin/orchestration/analytics/presentation/${cohortId}`, { headers }).then(r => r.ok ? r.json() : []),
    ])
      .then(([comp, build, pres]) => {
        setCompletionRates(comp);
        setBuildTracker(build);
        setPresentationReady(pres);
      })
      .finally(() => setLoading(false));
  }, [cohortId, token, apiUrl]);

  const totalEnrollments = completionRates[0]?.total_enrollments || 0;
  const avgCompletion = completionRates.length > 0
    ? Math.round(completionRates.reduce((s, r) => s + r.rate, 0) / completionRates.length)
    : 0;
  const buildUnlocked = buildTracker.filter(b => b.unlocked).length;
  const presReady = presentationReady.filter(p => p.ready).length;

  const metrics = [
    { title: 'Avg Session Completion', value: `${avgCompletion}%`, subtitle: `${totalEnrollments} enrollments`, icon: 'bi-check-circle', color: 'var(--color-accent, #38a169)' },
    { title: 'Active Participants', value: `${totalEnrollments}`, subtitle: 'Active enrollments', icon: 'bi-people', color: 'var(--color-primary-light, #2b6cb0)' },
    { title: 'Build Phase Unlocked', value: `${buildUnlocked}/${buildTracker.length}`, subtitle: 'Participants', icon: 'bi-hammer', color: 'var(--color-secondary, #e53e3e)' },
    { title: 'Presentation Ready', value: `${presReady}/${presentationReady.length}`, subtitle: 'Participants', icon: 'bi-easel', color: 'var(--color-primary, #1a365d)' },
  ];

  if (loading) {
    return (
      <div className="text-center py-5">
        <span className="spinner-border spinner-border-sm me-2" role="status"></span>
        Loading analytics...
      </div>
    );
  }

  return (
    <div>
      <h6 className="fw-semibold mb-3" style={{ fontSize: 14 }}>Orchestration Analytics</h6>

      <div className="row g-3 mb-4">
        {metrics.map((m) => (
          <div className="col-md-6 col-lg-3" key={m.title}>
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body text-center py-4">
                <div className="mb-2">
                  <i className={`bi ${m.icon}`} style={{ fontSize: 28, color: m.color }}></i>
                </div>
                <div className="fw-semibold" style={{ fontSize: 24, color: m.color }}>{m.value}</div>
                <div className="fw-medium" style={{ fontSize: 13, color: 'var(--color-text, #2d3748)' }}>{m.title}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{m.subtitle}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Session Completion Rates */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold" style={{ fontSize: 13 }}>Session Completion Rates</div>
        <div className="card-body p-0">
          {completionRates.length === 0 ? (
            <div className="text-center text-muted py-4" style={{ fontSize: 13 }}>No session data available</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ fontSize: 12 }}>#</th>
                    <th style={{ fontSize: 12 }}>Session</th>
                    <th style={{ fontSize: 12 }}>Completed</th>
                    <th style={{ fontSize: 12 }}>Rate</th>
                    <th style={{ fontSize: 12 }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {completionRates.map(r => (
                    <tr key={r.session_id}>
                      <td style={{ fontSize: 12 }}>{r.session_number}</td>
                      <td style={{ fontSize: 12 }}>{r.title}</td>
                      <td style={{ fontSize: 12 }}>{r.completed}/{r.total_enrollments}</td>
                      <td style={{ fontSize: 12 }}>{r.rate}%</td>
                      <td style={{ width: 120 }}>
                        <div className="progress" style={{ height: 8 }}>
                          <div className="progress-bar bg-success" style={{ width: `${r.rate}%` }}></div>
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

      {/* Build Phase Tracker */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold" style={{ fontSize: 13 }}>Build Phase Tracker</div>
        <div className="card-body p-0">
          {buildTracker.length === 0 ? (
            <div className="text-center text-muted py-4" style={{ fontSize: 13 }}>No build phase data</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ fontSize: 12 }}>Participant</th>
                    <th style={{ fontSize: 12 }}>Artifacts</th>
                    <th style={{ fontSize: 12 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {buildTracker.map(b => (
                    <tr key={b.enrollment_id}>
                      <td style={{ fontSize: 12 }}>{b.name}</td>
                      <td style={{ fontSize: 12 }}>{b.completed}/{b.total_required}</td>
                      <td>
                        <span className={`badge bg-${b.unlocked ? 'success' : 'warning'}`} style={{ fontSize: 10 }}>
                          {b.unlocked ? 'Unlocked' : 'Locked'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Presentation Readiness */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold" style={{ fontSize: 13 }}>Presentation Readiness</div>
        <div className="card-body p-0">
          {presentationReady.length === 0 ? (
            <div className="text-center text-muted py-4" style={{ fontSize: 13 }}>No presentation data</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ fontSize: 12 }}>Participant</th>
                    <th style={{ fontSize: 12 }}>Artifacts</th>
                    <th style={{ fontSize: 12 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {presentationReady.map(p => (
                    <tr key={p.enrollment_id}>
                      <td style={{ fontSize: 12 }}>{p.name}</td>
                      <td style={{ fontSize: 12 }}>{p.completed}/{p.total_required}</td>
                      <td>
                        <span className={`badge bg-${p.ready ? 'success' : 'secondary'}`} style={{ fontSize: 10 }}>
                          {p.ready ? 'Ready' : 'Not Ready'}
                        </span>
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
  );
};

export default AnalyticsTab;
