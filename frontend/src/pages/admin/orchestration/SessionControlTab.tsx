import React, { useEffect, useState, useCallback } from 'react';

interface SessionControlTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

interface Session {
  id: string;
  session_number: number;
  title: string;
  date: string;
  type: string;
  status: string;
  build_phase_unlock: boolean;
  required_prior_sessions: number[];
  presentation_phase_flag: boolean;
  module_id: string | null;
}

const SessionControlTab: React.FC<SessionControlTabProps> = ({ token, cohortId, apiUrl }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Session>>({});
  const [saving, setSaving] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/accelerator/cohorts/${cohortId}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : data.sessions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [token, cohortId, apiUrl]);

  useEffect(() => {
    if (cohortId) fetchSessions();
  }, [cohortId, fetchSessions]);

  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setEditData({
      build_phase_unlock: s.build_phase_unlock,
      required_prior_sessions: s.required_prior_sessions || [],
      presentation_phase_flag: s.presentation_phase_flag,
      module_id: s.module_id,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/accelerator/sessions/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setEditingId(null);
      setEditData({});
      await fetchSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  const handlePriorSessionsChange = (value: string) => {
    const nums = value
      .split(',')
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => !isNaN(n));
    setEditData({ ...editData, required_prior_sessions: nums });
  };

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

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading sessions...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Session Configuration</span>
          <span className="badge bg-info" style={{ fontSize: 11 }}>{sessions.length} sessions</span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
            <thead className="table-light">
              <tr>
                <th style={{ fontSize: 12 }}>#</th>
                <th style={{ fontSize: 12 }}>Title</th>
                <th style={{ fontSize: 12 }}>Date</th>
                <th style={{ fontSize: 12 }}>Type</th>
                <th style={{ fontSize: 12 }}>Status</th>
                <th style={{ fontSize: 12 }}>Build Unlock</th>
                <th style={{ fontSize: 12 }}>Prior Sessions</th>
                <th style={{ fontSize: 12 }}>Presentation</th>
                <th style={{ fontSize: 12 }}>Module ID</th>
                <th style={{ fontSize: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.session_number}</td>
                  <td>{s.title}</td>
                  <td>{s.date ? new Date(s.date).toLocaleDateString() : '-'}</td>
                  <td>{s.type}</td>
                  <td>
                    <span className={`badge ${statusBadge(s.status)}`} style={{ fontSize: 11 }}>
                      {s.status}
                    </span>
                  </td>
                  {editingId === s.id ? (
                    <>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={editData.build_phase_unlock || false}
                          onChange={(e) =>
                            setEditData({ ...editData, build_phase_unlock: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          style={{ fontSize: 12, width: 100 }}
                          value={(editData.required_prior_sessions || []).join(', ')}
                          onChange={(e) => handlePriorSessionsChange(e.target.value)}
                          placeholder="e.g. 1, 2"
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={editData.presentation_phase_flag || false}
                          onChange={(e) =>
                            setEditData({ ...editData, presentation_phase_flag: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          style={{ fontSize: 12, width: 120 }}
                          value={editData.module_id || ''}
                          onChange={(e) => setEditData({ ...editData, module_id: e.target.value })}
                          placeholder="Module ID"
                        />
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary me-1"
                          onClick={() => saveEdit(s.id)}
                          disabled={saving}
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{s.build_phase_unlock ? 'Yes' : 'No'}</td>
                      <td>{(s.required_prior_sessions || []).join(', ') || '-'}</td>
                      <td>{s.presentation_phase_flag ? 'Yes' : 'No'}</td>
                      <td style={{ fontSize: 12 }}>{s.module_id || '-'}</td>
                      <td>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => startEdit(s)}>
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted py-4">
                    No sessions found for this cohort.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SessionControlTab;
