import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

interface SessionItem {
  id: string;
  session_number: number;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  session_type: string;
  meeting_link?: string;
  recording_url?: string;
  attendance_status?: string;
}

const statusBadge: Record<string, string> = {
  scheduled: 'bg-info',
  live: 'bg-danger',
  completed: 'bg-success',
  cancelled: 'bg-secondary',
};

const attendanceBadge: Record<string, string> = {
  present: 'bg-success',
  late: 'bg-warning',
  absent: 'bg-danger',
  excused: 'bg-info',
};

function PortalSessionsPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get('/api/portal/sessions')
      .then((res) => setSessions(res.data))
      .catch(() => {})
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

  return (
    <>
      <h1 className="h4 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
        <i className="bi bi-calendar-event me-2"></i>Sessions
      </h1>

      {sessions.length === 0 ? (
        <div className="alert alert-info">No sessions scheduled yet.</div>
      ) : (
        <div className="row g-3">
          {sessions.map((session) => (
            <div className="col-12" key={session.id}>
              <div className={`card border-0 shadow-sm ${session.status === 'live' ? 'border-start border-danger border-3' : ''}`}>
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className="badge bg-light text-dark small">#{session.session_number}</span>
                        <span className={`badge ${statusBadge[session.status] || 'bg-secondary'}`}>{session.status}</span>
                        {session.attendance_status && (
                          <span className={`badge ${attendanceBadge[session.attendance_status] || 'bg-secondary'}`}>
                            {session.attendance_status}
                          </span>
                        )}
                        {session.session_type === 'lab' && <span className="badge bg-warning text-dark">Lab</span>}
                      </div>
                      <h6 className="fw-semibold mb-1">
                        <Link to={`/portal/sessions/${session.id}`} className="text-decoration-none" style={{ color: 'var(--color-primary)' }}>
                          {session.title}
                        </Link>
                      </h6>
                      <p className="text-muted small mb-0">
                        {session.session_date} &middot; {session.start_time} - {session.end_time} ET
                      </p>
                    </div>
                    <div className="d-flex gap-2">
                      {session.status === 'live' && session.meeting_link && (
                        <a
                          href={session.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-danger btn-sm"
                        >
                          <i className="bi bi-camera-video me-1"></i>Join Now
                        </a>
                      )}
                      {session.status === 'completed' && session.recording_url && (
                        <a
                          href={session.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline-secondary btn-sm"
                        >
                          <i className="bi bi-play-circle me-1"></i>Recording
                        </a>
                      )}
                      <Link
                        to={`/portal/sessions/${session.id}`}
                        className="btn btn-outline-secondary btn-sm"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default PortalSessionsPage;
