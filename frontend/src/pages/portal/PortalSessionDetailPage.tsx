import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

function PortalSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get(`/api/portal/sessions/${id}`)
      .then((res) => setSession(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <div className="alert alert-danger">Session not found.</div>;
  }

  const { session: s, attendance, submissions } = session;
  const materials = s.materials_json || [];
  const curriculum = s.curriculum_json || [];

  return (
    <>
      <Link to="/portal/sessions" className="btn btn-outline-secondary btn-sm mb-3">
        <i className="bi bi-arrow-left me-1"></i>Back to Sessions
      </Link>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="badge bg-light text-dark">#{s.session_number}</span>
            <span className={`badge bg-${s.status === 'completed' ? 'success' : s.status === 'live' ? 'danger' : 'info'}`}>
              {s.status}
            </span>
            {s.session_type === 'lab' && <span className="badge bg-warning text-dark">Lab</span>}
          </div>
          <h1 className="h4 fw-bold" style={{ color: 'var(--color-primary)' }}>{s.title}</h1>
          <p className="text-muted small">{s.session_date} &middot; {s.start_time} - {s.end_time} ET</p>
          {s.description && <p className="mb-3">{s.description}</p>}

          <div className="d-flex gap-2 flex-wrap">
            {s.status === 'live' && s.meeting_link && (
              <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="btn btn-danger btn-sm">
                <i className="bi bi-camera-video me-1"></i>Join Session
              </a>
            )}
            {s.recording_url && (
              <a href={s.recording_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
                <i className="bi bi-play-circle me-1"></i>Watch Recording
              </a>
            )}
          </div>
        </div>
      </div>

      {attendance && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Your Attendance</div>
          <div className="card-body">
            <span className={`badge bg-${attendance.status === 'present' ? 'success' : attendance.status === 'late' ? 'warning' : attendance.status === 'excused' ? 'info' : 'danger'}`}>
              {attendance.status}
            </span>
            {attendance.duration_minutes != null && (
              <span className="text-muted small ms-2">{attendance.duration_minutes} minutes</span>
            )}
          </div>
        </div>
      )}

      {curriculum.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-book me-2"></i>Curriculum
          </div>
          <div className="card-body">
            <ul className="mb-0">
              {curriculum.map((item: any, i: number) => (
                <li key={i} className="small mb-1">{typeof item === 'string' ? item : item.title || item.topic || JSON.stringify(item)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {materials.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-file-earmark me-2"></i>Materials
          </div>
          <div className="card-body">
            <ul className="mb-0">
              {materials.map((m: any, i: number) => (
                <li key={i} className="small mb-1">
                  {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title || m.url}</a> : (m.title || JSON.stringify(m))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {submissions && submissions.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-file-earmark-text me-2"></i>Your Submissions
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
                  {submissions.map((sub: any) => (
                    <tr key={sub.id}>
                      <td className="small">{sub.title}</td>
                      <td className="small"><span className="badge bg-info">{sub.assignment_type.replace('_', ' ')}</span></td>
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

export default PortalSessionDetailPage;
