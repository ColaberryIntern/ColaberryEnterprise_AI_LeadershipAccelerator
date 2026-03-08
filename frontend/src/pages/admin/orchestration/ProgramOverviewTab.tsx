import React, { useEffect, useState } from 'react';

interface ProgramOverviewTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

interface SessionFlow {
  session_number: number;
  title: string;
  status: string;
  artifact_count: number;
  gate_count: number;
  build_phase_unlock: boolean;
  presentation_phase_flag: boolean;
}

interface FlowData {
  sessions: SessionFlow[];
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    active: 'bg-success',
    upcoming: 'bg-info',
    completed: 'bg-secondary',
    locked: 'bg-warning',
    draft: 'bg-warning',
  };
  return map[status?.toLowerCase()] || 'bg-secondary';
};

const ProgramOverviewTab: React.FC<ProgramOverviewTabProps> = ({ token, cohortId, apiUrl }) => {
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFlow = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${apiUrl}/api/admin/orchestration/cohorts/${cohortId}/flow`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch flow: ${res.status}`);
        const data = await res.json();
        setFlow(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load program flow');
      } finally {
        setLoading(false);
      }
    };
    if (cohortId) fetchFlow();
  }, [token, cohortId, apiUrl]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading program overview...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>;
  }

  const sessions = flow?.sessions || [];

  return (
    <div>
      <h6 className="fw-semibold mb-3" style={{ fontSize: 14 }}>5-Session Program Flow</h6>

      <div className="d-flex gap-3 flex-wrap align-items-start">
        {sessions.map((s, idx) => (
          <React.Fragment key={s.session_number}>
            <div className="card border-0 shadow-sm" style={{ minWidth: 200, maxWidth: 240, fontSize: 13 }}>
              <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
                <span>Session {s.session_number}</span>
                <span className={`badge ${statusBadge(s.status)}`} style={{ fontSize: 11 }}>
                  {s.status}
                </span>
              </div>
              <div className="card-body">
                <p className="mb-2 fw-medium" style={{ fontSize: 13 }}>{s.title}</p>
                <div className="d-flex gap-2 mb-2">
                  <span className="badge bg-info" style={{ fontSize: 11 }}>
                    {s.artifact_count} artifact{s.artifact_count !== 1 ? 's' : ''}
                  </span>
                  <span className="badge bg-secondary" style={{ fontSize: 11 }}>
                    {s.gate_count} gate{s.gate_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ fontSize: 12 }}>
                  {s.build_phase_unlock && (
                    <div className="text-success mb-1">
                      <i className="bi bi-unlock-fill me-1"></i>Build Phase Unlocked
                    </div>
                  )}
                  {s.presentation_phase_flag && (
                    <div className="text-primary">
                      <i className="bi bi-flag-fill me-1"></i>Presentation Phase
                    </div>
                  )}
                  {!s.build_phase_unlock && !s.presentation_phase_flag && (
                    <div className="text-muted">Standard session</div>
                  )}
                </div>
              </div>
            </div>
            {idx < sessions.length - 1 && (
              <div className="d-flex align-items-center" style={{ fontSize: 24, color: 'var(--color-text-light, #718096)' }}>
                &rarr;
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {sessions.length === 0 && (
        <div className="text-muted text-center py-4" style={{ fontSize: 13 }}>
          No session flow data available for this cohort.
        </div>
      )}
    </div>
  );
};

export default ProgramOverviewTab;
