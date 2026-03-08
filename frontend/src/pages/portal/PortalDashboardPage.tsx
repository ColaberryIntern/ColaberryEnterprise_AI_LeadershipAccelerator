import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

interface DashboardData {
  enrollment: any;
  cohort: any;
  progress: { total_sessions: number; completed_sessions: number; };
  next_session: any;
  recent_submissions: any[];
}

interface CurriculumSummary {
  overall_progress: number;
  total_lessons: number;
  completed_lessons: number;
  modules: Array<{
    module_number: number;
    title: string;
    total_lessons: number;
    completed_lessons: number;
    skill_area: string;
  }>;
}

function useCountdown(targetDate: string | null): { days: number; hours: number; minutes: number; seconds: number } | null {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!targetDate) return;

    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

const SKILL_COLORS: Record<string, string> = {
  strategy_trust: '#6366f1',
  governance: '#ef4444',
  requirements: '#3b82f6',
  build_discipline: '#8b5cf6',
  executive_authority: '#10b981',
};

function PortalDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumSummary | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      portalApi.get('/api/portal/dashboard'),
      portalApi.get('/api/portal/curriculum').catch(() => ({ data: null })),
    ])
      .then(([dashRes, currRes]) => {
        setData(dashRes.data);
        setCurriculum(currRes.data);
        // If there's a next session, check readiness
        if (dashRes.data.next_session?.id) {
          portalApi.get(`/api/portal/curriculum/session-readiness/${dashRes.data.next_session.id}`)
            .then((r) => setReadiness(r.data))
            .catch(() => {});
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Build countdown target from next session
  const countdownTarget = data?.next_session
    ? `${data.next_session.session_date}T${data.next_session.start_time || '09:00'}:00`
    : null;
  const countdown = useCountdown(countdownTarget);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: '#6366f1' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="alert alert-warning"><i className="bi bi-exclamation-triangle me-2"></i>Unable to load your dashboard. Please try again or contact support.</div>;
  }

  const { enrollment, cohort, progress, next_session, recent_submissions } = data;

  return (
    <>
      <div className="mb-4">
        <h1 className="h4 fw-bold" style={{ color: '#1e293b' }}>
          Welcome, {enrollment.full_name}
        </h1>
        <p className="text-muted small mb-0">{cohort?.name || 'Accelerator Program'}</p>
      </div>

      {/* Score Cards */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Readiness', value: enrollment.readiness_score ?? 0, color: '#6366f1', icon: 'bi-speedometer2' },
          { label: 'Attendance', value: enrollment.attendance_score ?? 0, color: '#10b981', icon: 'bi-people' },
          { label: 'Prework', value: enrollment.prework_score ?? 0, color: '#3b82f6', icon: 'bi-journal-check' },
          { label: 'Assignments', value: enrollment.assignment_score ?? 0, color: '#8b5cf6', icon: 'bi-file-earmark-check' },
        ].map((card) => (
          <div className="col-6 col-md-3" key={card.label}>
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body text-center py-3">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle mb-2"
                  style={{ width: 40, height: 40, background: `${card.color}15` }}
                >
                  <i className={`bi ${card.icon}`} style={{ fontSize: 18, color: card.color }}></i>
                </div>
                <div className="fw-bold" style={{ fontSize: 26, color: card.color }}>
                  {Math.round(card.value)}%
                </div>
                <div className="text-muted small">{card.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        {/* Curriculum Progress */}
        {curriculum && (
          <div className="col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-white border-bottom d-flex align-items-center justify-content-between" style={{ padding: '12px 16px' }}>
                <span className="fw-semibold small" style={{ color: '#1e293b' }}>
                  <i className="bi bi-mortarboard me-2"></i>Curriculum Progress
                </span>
                <button
                  className="btn btn-sm px-2 py-0"
                  style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}
                  onClick={() => navigate('/portal/curriculum')}
                >
                  View All <i className="bi bi-arrow-right"></i>
                </button>
              </div>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small text-muted">{curriculum.completed_lessons}/{curriculum.total_lessons} lessons</span>
                  <span className="fw-bold" style={{ color: '#6366f1' }}>{Math.round(curriculum.overall_progress)}%</span>
                </div>
                <div className="progress mb-3" style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
                  <div className="progress-bar" style={{ width: `${curriculum.overall_progress}%`, background: '#6366f1', borderRadius: 4 }}></div>
                </div>
                {curriculum.modules.map((mod) => {
                  const pct = mod.total_lessons > 0 ? Math.round((mod.completed_lessons / mod.total_lessons) * 100) : 0;
                  const color = SKILL_COLORS[mod.skill_area] || '#6366f1';
                  return (
                    <div key={mod.module_number} className="d-flex align-items-center gap-2 mb-2">
                      <div
                        className="d-flex align-items-center justify-content-center rounded flex-shrink-0"
                        style={{ width: 22, height: 22, background: `${color}15`, fontSize: 10, fontWeight: 700, color }}
                      >
                        {mod.module_number}
                      </div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between" style={{ fontSize: 11 }}>
                          <span className="text-truncate" style={{ maxWidth: 160 }}>{mod.title}</span>
                          <span style={{ color: pct === 100 ? '#10b981' : '#94a3b8' }}>{pct}%</span>
                        </div>
                        <div className="progress" style={{ height: 3, background: '#f1f5f9' }}>
                          <div className="progress-bar" style={{ width: `${pct}%`, background: color }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Next Session + Countdown */}
        <div className={curriculum ? 'col-md-6' : 'col-12'}>
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
              <span className="fw-semibold small" style={{ color: '#1e293b' }}>
                <i className="bi bi-play-circle me-2"></i>Next Session
              </span>
            </div>
            <div className="card-body">
              {next_session ? (
                <>
                  <h6 className="fw-semibold mb-1" style={{ color: '#1e293b' }}>
                    #{next_session.session_number}: {next_session.title}
                  </h6>
                  <p className="text-muted small mb-3">
                    {next_session.session_date} at {next_session.start_time} ET
                  </p>

                  {/* Countdown Timer */}
                  {countdown && (
                    <div className="d-flex gap-2 mb-3">
                      {[
                        { value: countdown.days, label: 'Days' },
                        { value: countdown.hours, label: 'Hrs' },
                        { value: countdown.minutes, label: 'Min' },
                        { value: countdown.seconds, label: 'Sec' },
                      ].map((unit) => (
                        <div
                          key={unit.label}
                          className="text-center"
                          style={{
                            background: '#f8fafc',
                            borderRadius: 8,
                            padding: '8px 12px',
                            minWidth: 52,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div className="fw-bold" style={{ fontSize: 20, color: '#6366f1' }}>
                            {String(unit.value).padStart(2, '0')}
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{unit.label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Readiness Checklist */}
                  {readiness && readiness.checklist && readiness.checklist.length > 0 && (
                    <div className="mb-3">
                      <div className="small fw-semibold mb-2" style={{ color: '#1e293b' }}>
                        <i className="bi bi-list-check me-1"></i>Session Requirements
                      </div>
                      {readiness.checklist.map((item: any, i: number) => (
                        <div key={i} className="d-flex align-items-center gap-2 mb-1">
                          <i
                            className={`bi ${item.met ? 'bi-check-circle-fill' : 'bi-circle'}`}
                            style={{ color: item.met ? '#10b981' : '#94a3b8', fontSize: 14 }}
                          ></i>
                          <span className="small" style={{ color: item.met ? '#334155' : '#94a3b8' }}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                      <div className="mt-2">
                        {readiness.ready ? (
                          <span className="badge" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 11 }}>
                            <i className="bi bi-check-lg me-1"></i>Ready to attend
                          </span>
                        ) : (
                          <span className="badge" style={{ background: '#fef2f2', color: '#ef4444', fontSize: 11 }}>
                            <i className="bi bi-exclamation-triangle me-1"></i>Requirements not met
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {next_session.meeting_link && (
                    <a
                      href={readiness && !readiness.ready ? '#' : next_session.meeting_link}
                      target={readiness && !readiness.ready ? undefined : '_blank'}
                      rel="noopener noreferrer"
                      className={`btn btn-sm px-3 ${readiness && !readiness.ready ? 'disabled' : ''}`}
                      style={{
                        background: readiness && !readiness.ready ? '#e2e8f0' : '#6366f1',
                        color: readiness && !readiness.ready ? '#94a3b8' : '#fff',
                        borderRadius: 6,
                        fontWeight: 600,
                        fontSize: 13,
                        border: 'none',
                        pointerEvents: readiness && !readiness.ready ? 'none' : 'auto',
                      }}
                      onClick={(e) => {
                        if (readiness && !readiness.ready) e.preventDefault();
                      }}
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

      {/* Program Progress */}
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
              <span className="fw-semibold small" style={{ color: '#1e293b' }}>
                <i className="bi bi-calendar-event me-2"></i>Session Progress
              </span>
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-between small mb-2">
                <span>{progress.completed_sessions} of {progress.total_sessions} sessions completed</span>
                <span className="fw-semibold" style={{ color: '#6366f1' }}>
                  {progress.total_sessions > 0 ? Math.round((progress.completed_sessions / progress.total_sessions) * 100) : 0}%
                </span>
              </div>
              <div className="progress" style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
                <div
                  className="progress-bar"
                  role="progressbar"
                  style={{
                    width: `${progress.total_sessions > 0 ? (progress.completed_sessions / progress.total_sessions) * 100 : 0}%`,
                    background: '#6366f1',
                    borderRadius: 4,
                  }}
                  aria-valuenow={progress.completed_sessions}
                  aria-valuemin={0}
                  aria-valuemax={progress.total_sessions}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Submissions */}
      {recent_submissions && recent_submissions.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
            <span className="fw-semibold small" style={{ color: '#1e293b' }}>
              <i className="bi bi-clock-history me-2"></i>Recent Submissions
            </span>
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
