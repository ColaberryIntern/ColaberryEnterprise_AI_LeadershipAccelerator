import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface ProgressData {
  scores: {
    readiness_score: number;
    prework_score: number;
    attendance_score: number;
    assignment_score: number;
  };
  attendance_history: Array<{
    session_number: number;
    title: string;
    session_date: string;
    status: string;
  }>;
}

function PortalProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/progress')
      .then((res) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="alert alert-danger">Failed to load progress data.</div>;
  }

  const { scores, attendance_history } = data;

  const scoreItems = [
    { label: 'Overall Readiness', value: scores.readiness_score, color: '#1a365d', weight: 'Weighted composite' },
    { label: 'Prework Completion', value: scores.prework_score, color: '#2b6cb0', weight: '30% weight' },
    { label: 'Attendance', value: scores.attendance_score, color: '#38a169', weight: '40% weight' },
    { label: 'Assignment Performance', value: scores.assignment_score, color: '#805ad5', weight: '30% weight' },
  ];

  const attendanceBadge: Record<string, string> = {
    present: 'bg-success',
    late: 'bg-warning',
    absent: 'bg-danger',
    excused: 'bg-info',
  };

  return (
    <>
      <h1 className="h4 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
        <i className="bi bi-graph-up me-2"></i>My Progress
      </h1>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Readiness Breakdown</div>
        <div className="card-body">
          {scoreItems.map((item) => (
            <div className="mb-3" key={item.label}>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="small fw-medium">{item.label}</span>
                <span className="small">
                  <span className="fw-bold" style={{ color: item.color }}>{Math.round(item.value)}%</span>
                  <span className="text-muted ms-1">({item.weight})</span>
                </span>
              </div>
              <div className="progress" style={{ height: 10 }}>
                <div
                  className="progress-bar"
                  role="progressbar"
                  style={{ width: `${item.value}%`, background: item.color }}
                  aria-valuenow={item.value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Attendance History</div>
        <div className="card-body p-0">
          {attendance_history.length === 0 ? (
            <div className="p-3 text-muted small">No attendance records yet.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small">#</th>
                    <th className="small">Session</th>
                    <th className="small">Date</th>
                    <th className="small">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance_history.map((row) => (
                    <tr key={row.session_number}>
                      <td className="small">{row.session_number}</td>
                      <td className="small">{row.title}</td>
                      <td className="small text-muted">{row.session_date}</td>
                      <td className="small">
                        <span className={`badge ${attendanceBadge[row.status] || 'bg-secondary'}`}>
                          {row.status}
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
    </>
  );
}

export default PortalProgressPage;
