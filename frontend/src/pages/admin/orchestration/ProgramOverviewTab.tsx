import React, { useEffect, useState } from 'react';

interface Props { token: string; apiUrl: string; }

const typeBadge = (t: string) => {
  const m: Record<string, string> = { section: 'bg-primary', concept: 'bg-primary', lab: 'bg-success', assessment: 'bg-warning text-dark', reflection: 'bg-info' };
  return m[t] || 'bg-secondary';
};

const skillAreaLabel: Record<string, string> = {
  strategy_trust: 'Strategy & Trust',
  governance: 'Governance',
  requirements: 'Requirements',
  build_discipline: 'Build Discipline',
  executive_authority: 'Executive Authority',
};

const ProgramOverviewTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [modules, setModules] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    const safeFetch = (url: string) => fetch(url, { headers }).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    });
    Promise.all([
      safeFetch(`${apiUrl}/api/admin/orchestration/program/modules`),
      safeFetch(`${apiUrl}/api/admin/orchestration/program/sessions`),
    ])
      .then(([mods, sess]) => {
        setModules(Array.isArray(mods) ? mods : []);
        setSessions(Array.isArray(sess) ? sess : []);
      })
      .catch((err) => setError(err.message || 'Failed to load program overview'))
      .finally(() => setLoading(false));
  }, [token, apiUrl]);

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>
  );

  return (
    <div>
      {/* Curriculum Modules */}
      <h6 className="fw-semibold mb-3" style={{ fontSize: 14 }}>Curriculum Modules ({modules.length})</h6>
      <div className="row g-3 mb-4">
        {modules.map((mod: any) => (
          <div key={mod.id} className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white d-flex justify-content-between align-items-center">
                <div>
                  <span className="fw-semibold" style={{ fontSize: 14 }}>Module {mod.module_number}: {mod.title}</span>
                  <span className={`badge bg-secondary ms-2`} style={{ fontSize: 11 }}>{skillAreaLabel[mod.skill_area] || mod.skill_area}</span>
                </div>
                <span className="badge bg-info" style={{ fontSize: 11 }}>{mod.lessons?.length || 0} lessons</span>
              </div>
              <div className="card-body py-2">
                <p className="text-muted small mb-2">{mod.description}</p>
                <div className="table-responsive">
                  <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Lesson</th>
                        <th style={{ width: 100 }}>Type</th>
                        <th style={{ width: 80 }}>Minutes</th>
                        <th style={{ width: 80 }}>Input</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mod.lessons || []).map((l: any) => (
                        <tr key={l.id}>
                          <td>{l.lesson_number}</td>
                          <td>{l.title}</td>
                          <td><span className={`badge ${typeBadge(l.lesson_type)}`} style={{ fontSize: 10 }}>{l.lesson_type}</span></td>
                          <td>{l.estimated_minutes}</td>
                          <td>{l.requires_structured_input ? <span className="badge bg-success" style={{ fontSize: 10 }}>form</span> : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Session Flow */}
      <h6 className="fw-semibold mb-3" style={{ fontSize: 14 }}>Live Session Flow ({sessions.length} sessions)</h6>
      <div className="d-flex gap-3 flex-wrap align-items-start">
        {sessions.map((s: any, idx: number) => (
          <React.Fragment key={s.id}>
            <div className="card border-0 shadow-sm" style={{ minWidth: 200, maxWidth: 220, fontSize: 13 }}>
              <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
                <span>Session {s.session_number}</span>
                <span className={`badge ${s.session_type === 'lab' ? 'bg-success' : 'bg-primary'}`} style={{ fontSize: 10 }}>
                  {s.session_type}
                </span>
              </div>
              <div className="card-body">
                <p className="mb-2 fw-medium" style={{ fontSize: 13 }}>{s.title}</p>
                <div style={{ fontSize: 12 }} className="text-muted">
                  {s.session_date ? new Date(s.session_date).toLocaleDateString() : ''}
                  {s.start_time ? ` ${s.start_time}` : ''}
                </div>
                <div className="mt-2" style={{ fontSize: 11 }}>
                  {(s.curriculum_json || []).length} agenda items
                </div>
                <div style={{ fontSize: 11 }}>
                  {(s.materials_json || []).length} materials
                </div>
              </div>
            </div>
            {idx < sessions.length - 1 && (
              <div className="d-flex align-items-center" style={{ fontSize: 24, color: 'var(--color-text-light, #718096)' }}>&rarr;</div>
            )}
          </React.Fragment>
        ))}
      </div>

      {modules.length === 0 && sessions.length === 0 && (
        <div className="text-muted text-center py-4" style={{ fontSize: 13 }}>No curriculum data found. Restart the backend to seed data.</div>
      )}
    </div>
  );
};

export default ProgramOverviewTab;
