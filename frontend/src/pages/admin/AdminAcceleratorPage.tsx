import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { useToast } from '../../components/ui/ToastProvider';
import Breadcrumb from '../../components/ui/Breadcrumb';
import ConfirmModal from '../../components/ui/ConfirmModal';

interface Cohort {
  id: string;
  name: string;
  start_date: string;
  status: string;
}

interface LiveSession {
  id: string;
  cohort_id: string;
  session_number: number;
  title: string;
  description: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_type: 'core' | 'lab';
  meeting_link: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_url: string;
  attendanceRecords?: AttendanceRecord[];
}

interface AttendanceRecord {
  id: string;
  enrollment_id: string;
  session_id: string;
  status: 'present' | 'absent' | 'excused' | 'late';
  join_time: string;
  leave_time: string;
  duration_minutes: number;
  notes: string;
  enrollment?: EnrollmentInfo;
}

interface EnrollmentInfo {
  id: string;
  full_name: string;
  email: string;
  company: string;
  title: string;
  readiness_score: number;
  prework_score: number;
  attendance_score: number;
  assignment_score: number;
  maturity_level: number;
  status: string;
}

interface Submission {
  id: string;
  enrollment_id: string;
  session_id: string;
  assignment_type: string;
  title: string;
  content_json: any;
  file_path: string;
  file_name: string;
  status: string;
  score: number;
  reviewer_notes: string;
  submitted_at: string;
  enrollment?: EnrollmentInfo;
  session?: LiveSession;
}

interface DashboardData {
  cohort: Cohort;
  stats: {
    total_sessions: number;
    completed_sessions: number;
    total_enrollments: number;
    avg_readiness: number;
    avg_attendance: number;
  };
  next_session: LiveSession | null;
  sessions: LiveSession[];
  enrollments: EnrollmentInfo[];
}

type TabKey = 'sessions' | 'attendance' | 'submissions' | 'readiness';

function AdminAcceleratorPage() {
  const { showToast } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('sessions');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  const [sessionForm, setSessionForm] = useState({
    session_number: 1, title: '', description: '', session_date: '',
    start_time: '10:00 AM', end_time: '11:30 AM', session_type: 'core' as 'core' | 'lab',
  });

  // Attendance state
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Readiness state
  const [enrollments, setEnrollments] = useState<EnrollmentInfo[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/admin/cohorts').then((res) => {
      setCohorts(res.data.cohorts || []);
      if (res.data.cohorts?.length > 0) {
        setSelectedCohortId(res.data.cohorts[0].id);
      }
    }).catch(() => showToast('Failed to load cohorts', 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const loadDashboard = useCallback(async () => {
    if (!selectedCohortId) return;
    try {
      const res = await api.get(`/api/admin/accelerator/cohorts/${selectedCohortId}/dashboard`);
      setDashboard(res.data);
      setSessions(res.data.sessions || []);
      setEnrollments(res.data.enrollments || []);
    } catch {
      showToast('Failed to load dashboard', 'error');
    }
  }, [selectedCohortId]); // eslint-disable-line

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // -- Session handlers --

  const handleCreateSession = async () => {
    try {
      await api.post(`/api/admin/accelerator/cohorts/${selectedCohortId}/sessions`, sessionForm);
      showToast('Session created', 'success');
      setShowSessionModal(false);
      resetSessionForm();
      loadDashboard();
    } catch { showToast('Failed to create session', 'error'); }
  };

  const handleUpdateSessionSubmit = async () => {
    if (!editingSession) return;
    try {
      await api.patch(`/api/admin/accelerator/sessions/${editingSession.id}`, sessionForm);
      showToast('Session updated', 'success');
      setShowSessionModal(false);
      setEditingSession(null);
      resetSessionForm();
      loadDashboard();
    } catch { showToast('Failed to update session', 'error'); }
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/accelerator/sessions/${deleteTarget}`);
      showToast('Session deleted', 'success');
      setDeleteTarget(null);
      loadDashboard();
    } catch { showToast('Failed to delete session', 'error'); }
  };

  const handleGenerateMeet = async (sessionId: string) => {
    try {
      const res = await api.post(`/api/admin/accelerator/sessions/${sessionId}/meet-link`);
      showToast(`Meet link generated: ${res.data.meeting_link}`, 'success');
      loadDashboard();
    } catch { showToast('Failed to generate Meet link', 'error'); }
  };

  const handleStatusChange = async (sessionId: string, status: string) => {
    try {
      await api.patch(`/api/admin/accelerator/sessions/${sessionId}`, { status });
      showToast(`Session marked as ${status}`, 'success');
      loadDashboard();
    } catch { showToast('Failed to update status', 'error'); }
  };

  const resetSessionForm = () => {
    setSessionForm({
      session_number: (sessions.length || 0) + 1, title: '', description: '', session_date: '',
      start_time: '10:00 AM', end_time: '11:30 AM', session_type: 'core',
    });
  };

  const openEditSession = (s: LiveSession) => {
    setEditingSession(s);
    setSessionForm({
      session_number: s.session_number, title: s.title, description: s.description || '',
      session_date: s.session_date, start_time: s.start_time, end_time: s.end_time,
      session_type: s.session_type,
    });
    setShowSessionModal(true);
  };

  // -- Attendance handlers --

  const loadAttendance = async (sessionId: string) => {
    setAttendanceLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/sessions/${sessionId}/attendance`);
      setAttendanceRecords(res.data.records || []);
    } catch { showToast('Failed to load attendance', 'error'); }
    setAttendanceLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'attendance' && selectedSessionId) {
      loadAttendance(selectedSessionId);
    }
  }, [activeTab, selectedSessionId]); // eslint-disable-line

  const handleAttendanceChange = async (enrollmentId: string, status: string) => {
    try {
      await api.post(`/api/admin/accelerator/sessions/${selectedSessionId}/attendance`, {
        enrollment_id: enrollmentId,
        status,
        marked_by: 'admin',
      });
      loadAttendance(selectedSessionId);
    } catch { showToast('Failed to update attendance', 'error'); }
  };

  const handleBulkAttendance = async (status: string) => {
    if (!enrollments.length) return;
    try {
      await api.post(`/api/admin/accelerator/sessions/${selectedSessionId}/attendance`, {
        records: enrollments.map((e) => ({ enrollment_id: e.id, status })),
      });
      showToast(`All marked as ${status}`, 'success');
      loadAttendance(selectedSessionId);
    } catch { showToast('Failed to bulk update', 'error'); }
  };

  // -- Submissions handlers --

  const loadSubmissions = async (sessionId: string) => {
    setSubmissionsLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/sessions/${sessionId}/submissions`);
      setSubmissions(res.data.submissions || []);
    } catch { showToast('Failed to load submissions', 'error'); }
    setSubmissionsLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'submissions' && selectedSessionId) {
      loadSubmissions(selectedSessionId);
    }
  }, [activeTab, selectedSessionId]); // eslint-disable-line

  const handleReviewSubmission = async (subId: string, score: number, notes: string) => {
    try {
      await api.patch(`/api/admin/accelerator/submissions/${subId}`, {
        status: 'reviewed', score, reviewer_notes: notes,
      });
      showToast('Submission reviewed', 'success');
      if (selectedSessionId) loadSubmissions(selectedSessionId);
    } catch { showToast('Failed to review submission', 'error'); }
  };

  // -- Readiness handlers --

  const handleRecomputeAll = async () => {
    setReadinessLoading(true);
    try {
      await api.post(`/api/admin/accelerator/cohorts/${selectedCohortId}/readiness`);
      showToast('Readiness scores recomputed', 'success');
      loadDashboard();
    } catch { showToast('Failed to recompute', 'error'); }
    setReadinessLoading(false);
  };

  // -- Helpers --

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'bg-info', live: 'bg-danger', completed: 'bg-success', cancelled: 'bg-secondary',
      present: 'bg-success', absent: 'bg-danger', excused: 'bg-warning text-dark', late: 'bg-info',
      pending: 'bg-warning text-dark', submitted: 'bg-info', reviewed: 'bg-success', flagged: 'bg-danger',
    };
    return <span className={`badge ${colors[status] || 'bg-secondary'}`}>{status}</span>;
  };

  const readinessColor = (score: number | null) => {
    if (!score) return 'text-muted';
    if (score >= 70) return 'text-success';
    if (score >= 40) return 'text-warning';
    return 'text-danger';
  };

  const formatDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Accelerator' }]} />

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Accelerator Program
        </h1>
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={selectedCohortId}
          onChange={(e) => setSelectedCohortId(e.target.value)}
        >
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Stats Cards */}
      {dashboard && (
        <div className="row g-3 mb-4">
          {[
            { label: 'Sessions', value: `${dashboard.stats.completed_sessions}/${dashboard.stats.total_sessions}`, sub: 'completed' },
            { label: 'Enrollments', value: dashboard.stats.total_enrollments, sub: 'active' },
            { label: 'Avg Readiness', value: `${dashboard.stats.avg_readiness}%`, sub: 'score' },
            { label: 'Avg Attendance', value: `${dashboard.stats.avg_attendance}%`, sub: 'rate' },
          ].map((card, i) => (
            <div key={i} className="col-6 col-lg-3">
              <div className="card border-0 shadow-sm">
                <div className="card-body text-center py-3">
                  <div className="small text-muted mb-1">{card.label}</div>
                  <div className="h4 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>{card.value}</div>
                  <div className="small text-muted">{card.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        {(['sessions', 'attendance', 'submissions', 'readiness'] as TabKey[]).map((tab) => (
          <li key={tab} className="nav-item">
            <button
              className={`nav-link${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          </li>
        ))}
      </ul>

      {/* Tab Content */}
      {activeTab === 'sessions' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Sessions ({sessions.length})</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { resetSessionForm(); setEditingSession(null); setShowSessionModal(true); }}
            >
              + Add Session
            </button>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Meet</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted py-4">No sessions yet</td></tr>
                  ) : sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.session_number}</td>
                      <td className="fw-medium">{s.title}</td>
                      <td>{formatDate(s.session_date)}</td>
                      <td className="small">{s.start_time} - {s.end_time}</td>
                      <td>{statusBadge(s.session_type)}</td>
                      <td>{statusBadge(s.status)}</td>
                      <td>
                        {s.meeting_link ? (
                          <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="btn btn-outline-success btn-sm">
                            Join
                          </a>
                        ) : (
                          <button className="btn btn-outline-primary btn-sm" onClick={() => handleGenerateMeet(s.id)}>
                            Generate
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => openEditSession(s)}>Edit</button>
                          {s.status === 'scheduled' && (
                            <button className="btn btn-outline-danger btn-sm" onClick={() => handleStatusChange(s.id, 'completed')}>Complete</button>
                          )}
                          <button className="btn btn-outline-danger btn-sm" onClick={() => setDeleteTarget(s.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span className="fw-semibold">Attendance</span>
            <div className="d-flex gap-2 align-items-center">
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
              >
                <option value="">Select session...</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>#{s.session_number} - {s.title}</option>
                ))}
              </select>
              {selectedSessionId && (
                <>
                  <button className="btn btn-success btn-sm" onClick={() => handleBulkAttendance('present')}>All Present</button>
                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleBulkAttendance('absent')}>All Absent</button>
                </>
              )}
            </div>
          </div>
          <div className="card-body p-0">
            {!selectedSessionId ? (
              <div className="text-center text-muted py-4">Select a session to manage attendance</div>
            ) : attendanceLoading ? (
              <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Participant</th>
                      <th>Company</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => {
                      const record = attendanceRecords.find((r) => r.enrollment_id === e.id);
                      return (
                        <tr key={e.id}>
                          <td className="fw-medium">{e.full_name}</td>
                          <td>{e.company}</td>
                          <td>
                            <select
                              className="form-select form-select-sm"
                              style={{ width: 'auto' }}
                              value={record?.status || 'absent'}
                              onChange={(ev) => handleAttendanceChange(e.id, ev.target.value)}
                            >
                              <option value="present">Present</option>
                              <option value="absent">Absent</option>
                              <option value="late">Late</option>
                              <option value="excused">Excused</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                    {enrollments.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-muted py-4">No enrollments in this cohort</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'submissions' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span className="fw-semibold">Submissions</span>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
            >
              <option value="">Select session...</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>#{s.session_number} - {s.title}</option>
              ))}
            </select>
          </div>
          <div className="card-body p-0">
            {!selectedSessionId ? (
              <div className="text-center text-muted py-4">Select a session to view submissions</div>
            ) : submissionsLoading ? (
              <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Participant</th>
                      <th>Assignment</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted py-4">No submissions yet</td></tr>
                    ) : submissions.map((sub) => (
                      <tr key={sub.id}>
                        <td className="fw-medium">{sub.enrollment?.full_name || 'Unknown'}</td>
                        <td>{sub.title}</td>
                        <td><span className="badge bg-secondary">{sub.assignment_type.replace(/_/g, ' ')}</span></td>
                        <td>{statusBadge(sub.status)}</td>
                        <td>{sub.score != null ? `${sub.score}/100` : '-'}</td>
                        <td className="small">{sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : '-'}</td>
                        <td>
                          {sub.status === 'submitted' && (
                            <button
                              className="btn btn-outline-success btn-sm"
                              onClick={() => handleReviewSubmission(sub.id, 80, 'Reviewed')}
                            >
                              Review
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'readiness' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Executive Readiness</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRecomputeAll}
              disabled={readinessLoading}
            >
              {readinessLoading ? 'Computing...' : 'Recompute All'}
            </button>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Participant</th>
                    <th>Company</th>
                    <th>Prework</th>
                    <th>Attendance</th>
                    <th>Assignments</th>
                    <th>Readiness</th>
                    <th>Maturity</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted py-4">No enrollments</td></tr>
                  ) : enrollments.map((e) => (
                    <tr key={e.id}>
                      <td className="fw-medium">{e.full_name}</td>
                      <td>{e.company}</td>
                      <td className={readinessColor(e.prework_score)}>{e.prework_score != null ? `${e.prework_score}%` : '-'}</td>
                      <td className={readinessColor(e.attendance_score)}>{e.attendance_score != null ? `${e.attendance_score}%` : '-'}</td>
                      <td className={readinessColor(e.assignment_score)}>{e.assignment_score != null ? `${e.assignment_score}%` : '-'}</td>
                      <td>
                        <span className={`fw-bold ${readinessColor(e.readiness_score)}`}>
                          {e.readiness_score != null ? `${e.readiness_score}%` : '-'}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-primary">Level {e.maturity_level || 0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Session Create/Edit Modal */}
      {showSessionModal && (
        <>
          <div className="modal-backdrop show" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <div className="modal show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{editingSession ? 'Edit Session' : 'Add Session'}</h5>
                  <button type="button" className="btn-close" onClick={() => { setShowSessionModal(false); setEditingSession(null); }} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Session Number</label>
                    <input type="number" className="form-control form-control-sm" value={sessionForm.session_number}
                      onChange={(e) => setSessionForm({ ...sessionForm, session_number: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Title</label>
                    <input type="text" className="form-control form-control-sm" value={sessionForm.title}
                      onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })} placeholder="e.g. AI Governance Foundations" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Description</label>
                    <textarea className="form-control form-control-sm" rows={2} value={sessionForm.description}
                      onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })} />
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Date</label>
                      <input type="date" className="form-control form-control-sm" value={sessionForm.session_date}
                        onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })} />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">Type</label>
                      <select className="form-select form-select-sm" value={sessionForm.session_type}
                        onChange={(e) => setSessionForm({ ...sessionForm, session_type: e.target.value as 'core' | 'lab' })}>
                        <option value="core">Core</option>
                        <option value="lab">Lab</option>
                      </select>
                    </div>
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Start Time</label>
                      <input type="text" className="form-control form-control-sm" value={sessionForm.start_time}
                        onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })} placeholder="10:00 AM" />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">End Time</label>
                      <input type="text" className="form-control form-control-sm" value={sessionForm.end_time}
                        onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })} placeholder="11:30 AM" />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowSessionModal(false); setEditingSession(null); }}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={editingSession ? handleUpdateSessionSubmit : handleCreateSession}>
                    {editingSession ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        show={!!deleteTarget}
        title="Delete Session"
        message="Are you sure you want to delete this session? All attendance records and submissions for this session will also be deleted."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export default AdminAcceleratorPage;
