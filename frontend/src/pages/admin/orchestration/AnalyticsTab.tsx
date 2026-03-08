import React, { useEffect, useState } from 'react';

interface Props { token: string; apiUrl: string; }

const AnalyticsTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [completion, setCompletion] = useState<any[]>([]);
  const [buildPhase, setBuildPhase] = useState<any[]>([]);
  const [presentation, setPresentation] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/cohorts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.cohorts || [];
        setCohorts(list);
        if (list.length > 0) setSelectedCohortId(list[0].id);
      })
      .catch(() => {});
  }, [token, apiUrl]);

  useEffect(() => {
    if (!selectedCohortId) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${apiUrl}/api/admin/orchestration/analytics/completion/${selectedCohortId}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${apiUrl}/api/admin/orchestration/analytics/build-phase/${selectedCohortId}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${apiUrl}/api/admin/orchestration/analytics/presentation/${selectedCohortId}`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([comp, build, pres]) => {
        setCompletion(Array.isArray(comp) ? comp : []);
        setBuildPhase(Array.isArray(build) ? build : []);
        setPresentation(Array.isArray(pres) ? pres : []);
      })
      .finally(() => setLoading(false));
  }, [selectedCohortId, token, apiUrl]);

  const avgCompletion = completion.length > 0 ? (completion.reduce((acc, c) => acc + (c.rate || 0), 0) / completion.length * 100).toFixed(0) : '0';
  const buildUnlocked = buildPhase.filter(b => b.unlocked).length;
  const presReady = presentation.filter(p => p.ready).length;

  return (
    <div>
      <div className="d-flex gap-2 mb-3 align-items-center">
        <label className="form-label small fw-medium mb-0">Cohort:</label>
        <select className="form-select form-select-sm" style={{ width: 260 }} value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)}>
          {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!selectedCohortId ? (
        <div className="text-muted text-center py-5" style={{ fontSize: 13 }}>Select a cohort to view analytics.</div>
      ) : loading ? (
        <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="card border-0 shadow-sm text-center p-3">
                <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-primary)' }}>{avgCompletion}%</div>
                <div className="text-muted small">Avg Session Completion</div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-0 shadow-sm text-center p-3">
                <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-accent)' }}>{buildUnlocked}/{buildPhase.length}</div>
                <div className="text-muted small">Build Phase Unlocked</div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-0 shadow-sm text-center p-3">
                <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-secondary)' }}>{presReady}/{presentation.length}</div>
                <div className="text-muted small">Presentation Ready</div>
              </div>
            </div>
          </div>

          {completion.length > 0 && (
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-white fw-semibold" style={{ fontSize: 14 }}>Session Completion Rates</div>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ fontSize: 12 }}>Session</th>
                      <th style={{ fontSize: 12 }}>Enrolled</th>
                      <th style={{ fontSize: 12 }}>Completed</th>
                      <th style={{ fontSize: 12 }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completion.map((c: any) => (
                      <tr key={c.session_id}>
                        <td>S{c.session_number}: {c.title}</td>
                        <td>{c.total_enrollments}</td>
                        <td>{c.completed}</td>
                        <td>{(c.rate * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {buildPhase.length > 0 && (
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-white fw-semibold" style={{ fontSize: 14 }}>Build Phase Tracker</div>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ fontSize: 12 }}>Participant</th>
                      <th style={{ fontSize: 12 }}>Required</th>
                      <th style={{ fontSize: 12 }}>Completed</th>
                      <th style={{ fontSize: 12 }}>Unlocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildPhase.map((b: any) => (
                      <tr key={b.enrollment_id}>
                        <td>{b.name}</td>
                        <td>{b.total_required}</td>
                        <td>{b.completed}</td>
                        <td>{b.unlocked ? <span className="badge bg-success" style={{ fontSize: 10 }}>Yes</span> : <span className="badge bg-warning" style={{ fontSize: 10 }}>No</span>}</td>
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
  );
};

export default AnalyticsTab;
