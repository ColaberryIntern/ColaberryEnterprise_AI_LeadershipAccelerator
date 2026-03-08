import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

const ArtifactControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/orchestration/program/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setSessions(list);
        if (list.length > 0) setSelectedSessionId(list[0].id);
      })
      .catch(() => {});
  }, [token, apiUrl]);

  const fetchArtifacts = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/sessions/${selectedSessionId}/artifacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setArtifacts(Array.isArray(data) ? data : []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, apiUrl, selectedSessionId]);

  useEffect(() => { fetchArtifacts(); }, [fetchArtifacts]);

  return (
    <div>
      <div className="d-flex gap-2 mb-3 align-items-center">
        <label className="form-label small fw-medium mb-0">Session:</label>
        <select className="form-select form-select-sm" style={{ width: 300 }} value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}>
          {sessions.map(s => <option key={s.id} value={s.id}>Session {s.session_number}: {s.title}</option>)}
        </select>
      </div>

      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between">
            <span>Artifact Definitions</span>
            <span className="badge bg-info" style={{ fontSize: 11 }}>{artifacts.length} artifacts</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 12 }}>Name</th>
                  <th style={{ fontSize: 12 }}>Type</th>
                  <th style={{ fontSize: 12 }}>Required For</th>
                  <th style={{ fontSize: 12 }}>Variable Keys</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map(a => (
                  <tr key={a.id}>
                    <td className="fw-medium">{a.name}</td>
                    <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{a.artifact_type}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {a.required_for_session && <span className="badge bg-primary me-1" style={{ fontSize: 10 }}>Session</span>}
                      {a.required_for_build_unlock && <span className="badge bg-success me-1" style={{ fontSize: 10 }}>Build</span>}
                      {a.required_for_presentation_unlock && <span className="badge bg-warning text-dark me-1" style={{ fontSize: 10 }}>Presentation</span>}
                      {!a.required_for_session && !a.required_for_build_unlock && !a.required_for_presentation_unlock && <span className="text-muted">Optional</span>}
                    </td>
                    <td style={{ fontSize: 11 }}>{(a.produces_variable_keys || []).join(', ') || '-'}</td>
                  </tr>
                ))}
                {artifacts.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-muted py-4">No artifact definitions for this session.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtifactControlTab;
