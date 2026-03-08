import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

const SectionControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sections, setSections] = useState<any[]>([]);
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

  const fetchSections = useCallback(async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/sessions/${selectedSessionId}/sections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setSections(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, apiUrl, selectedSessionId]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

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
            <span>Section Configs</span>
            <span className="badge bg-info" style={{ fontSize: 11 }}>{sections.length} sections</span>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 12 }}>Order</th>
                  <th style={{ fontSize: 12 }}>Concept Text</th>
                  <th style={{ fontSize: 12 }}>Build Phase</th>
                  <th style={{ fontSize: 12 }}>NotebookLM</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(s => (
                  <tr key={s.id}>
                    <td>{s.section_order}</td>
                    <td style={{ maxWidth: 400 }}>{(s.concept_text || '').substring(0, 120)}{(s.concept_text || '').length > 120 ? '...' : ''}</td>
                    <td>{s.build_phase_flag ? <span className="badge bg-success" style={{ fontSize: 10 }}>Yes</span> : 'No'}</td>
                    <td>{s.notebooklm_required ? <span className="badge bg-info" style={{ fontSize: 10 }}>Required</span> : 'No'}</td>
                  </tr>
                ))}
                {sections.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-muted py-4">No sections configured for this session. Add sections to define the session structure.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionControlTab;
