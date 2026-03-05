import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface DashboardData {
  enrollment: any;
  cohort: any;
  progress: { total_sessions: number; completed_sessions: number; };
  next_session: any;
  recent_submissions: any[];
}

function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/dashboard')
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

  if (error || !data) {
    return <div className="alert alert-warning"><i className="bi bi-exclamation-triangle me-2"></i>Unable to load your dashboard. Your enrollment may not be active yet, or there was a connection issue. Please try again or contact support.</div>;
  }

  const { enrollment, cohort, progress, next_session, recent_submissions } = data;

  const scoreCards = [
    { label: 'Readiness Score', value: enrollment.readiness_score ?? 0, color: '#1a365d', icon: 'bi-speedometer2' },
    { label: 'Attendance', value: enrollment.attendance_score ?? 0, color: '#38a169', icon: 'bi-people' },
    { label: 'Prework', value: enrollment.prework_score ?? 0, color: '#2b6cb0', icon: 'bi-journal-check' },
    { label: 'Assignments', value: enrollment.assignment_score ?? 0, color: '#805ad5', icon: 'bi-file-earmark-check' },
  ];

  return (
    <>
      <div className="mb-4">
        <h1 className="h4 fw-bold" style={{ color: 'var(--color-primary)' }}>
          Welcome, {enrollment.full_name}
        </h1>
        <p className="text-muted small mb-0">{cohort?.name || 'Accelerator Program'}</p>
      </div>

      <div className="row g-3 mb-4">
        {scoreCards.map((card) => (
          <div className="col-6 col-md-3" key={card.label}>
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body text-center py-3">
                <i className={`bi ${card.icon} d-block mb-1`} style={{ fontSize: 24, color: card.color }}></i>
                <div className="fw-bold" style={{ fontSize: 28, color: card.color }}>
                  {Math.round(card.value)}%
                </div>
                <div className="text-muted small">{card.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">
              <i className="bi bi-calendar-event me-2"></i>Program Progress
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-between small mb-2">
                <span>{progress.completed_sessions} of {progress.total_sessions} sessions completed</span>
                <span className="fw-semibold">
                  {progress.total_sessions > 0 ? Math.round((progress.completed_sessions / progress.total_sessions) * 100) : 0}%
                </span>
              </div>
              <div className="progress" style={{ height: 8 }}>
                <div
                  className="progress-bar"
                  role="progressbar"
                  style={{
                    width: `${progress.total_sessions > 0 ? (progress.completed_sessions / progress.total_sessions) * 100 : 0}%`,
                    background: 'var(--color-primary)',
                  }}
                  aria-valuenow={progress.completed_sessions}
                  aria-valuemin={0}
                  aria-valuemax={progress.total_sessions}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">
              <i className="bi bi-play-circle me-2"></i>Next Session
            </div>
            <div className="card-body">
              {next_session ? (
                <>
                  <h6 className="fw-semibold mb-1">
                    #{next_session.session_number}: {next_session.title}
                  </h6>
                  <p className="text-muted small mb-2">
                    {next_session.session_date} at {next_session.start_time} ET
                  </p>
                  {next_session.meeting_link && (
                    <a
                      href={next_session.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                      style={{ background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                    >
                      <i className="bi bi-camera-video me-1"></i>Join Session
                    </a>
                  )}
                </>
              ) : (
                <p className="text-muted small mb-0">No upcoming sessions scheduled.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {recent_submissions && recent_submissions.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-clock-history me-2"></i>Recent Submissions
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small">Title</th>
                    <th className="small">Type</th>
                    <th className="small">Status</th>
                    <th className="small">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {recent_submissions.map((sub: any) => (
                    <tr key={sub.id}>
                      <td className="small">{sub.title}</td>
                      <td className="small">
                        <span className="badge bg-info">{sub.assignment_type.replace('_', ' ')}</span>
                      </td>
                      <td className="small">
                        <span className={`badge bg-${sub.status === 'reviewed' ? 'success' : sub.status === 'submitted' ? 'primary' : 'secondary'}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="small">{sub.score != null ? `${sub.score}%` : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PortalDashboardPage;
