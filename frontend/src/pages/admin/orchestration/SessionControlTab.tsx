import React, { useEffect, useState } from 'react';

interface Props { token: string; apiUrl: string; }

const SessionControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/orchestration/program/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, apiUrl]);

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
    </div>
  );

  return (
    <div>
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Live Session Configuration</span>
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
                <th style={{ fontSize: 12 }}>Agenda</th>
                <th style={{ fontSize: 12 }}>Materials</th>
                <th style={{ fontSize: 12 }}></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <React.Fragment key={s.id}>
                  <tr>
                    <td>{s.session_number}</td>
                    <td className="fw-medium">{s.title}</td>
                    <td>{s.session_date ? new Date(s.session_date).toLocaleDateString() : '-'}</td>
                    <td><span className={`badge ${s.session_type === 'lab' ? 'bg-success' : 'bg-primary'}`} style={{ fontSize: 10 }}>{s.session_type}</span></td>
                    <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{s.status}</span></td>
                    <td>{(s.curriculum_json || []).length} items</td>
                    <td>{(s.materials_json || []).length} items</td>
                    <td>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                        {expanded === s.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr>
                      <td colSpan={8} className="bg-light">
                        <div className="p-2">
                          <p className="text-muted small mb-2">{s.description}</p>
                          <div className="row">
                            <div className="col-md-7">
                              <strong style={{ fontSize: 12 }}>Agenda</strong>
                              <table className="table table-sm mt-1 mb-0" style={{ fontSize: 12 }}>
                                <tbody>
                                  {(s.curriculum_json || []).map((item: any, i: number) => (
                                    <tr key={i}>
                                      <td style={{ width: 50 }}>{item.duration_minutes}m</td>
                                      <td className="fw-medium">{item.title}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="col-md-5">
                              <strong style={{ fontSize: 12 }}>Materials</strong>
                              <ul className="list-unstyled mt-1 mb-0" style={{ fontSize: 12 }}>
                                {(s.materials_json || []).map((m: any, i: number) => (
                                  <li key={i}><span className="badge bg-secondary me-1" style={{ fontSize: 10 }}>{m.type}</span>{m.title}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted py-4">No sessions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SessionControlTab;
