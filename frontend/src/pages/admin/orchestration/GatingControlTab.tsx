import React, { useEffect, useState } from 'react';

interface Props { token: string; apiUrl: string; }

const GatingControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [subTab, setSubTab] = useState<'gates' | 'variables'>('gates');
  const [gates, setGates] = useState<any[]>([]);
  const [gatesLoading, setGatesLoading] = useState(true);

  // Variables sub-tab state
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [variables, setVariables] = useState<any[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/orchestration/program/gates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setGates(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setGatesLoading(false));
  }, [token, apiUrl]);

  // Load cohorts for variables sub-tab
  useEffect(() => {
    if (subTab !== 'variables' || cohorts.length > 0) return;
    fetch(`${apiUrl}/api/admin/cohorts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.cohorts || [];
        setCohorts(list);
        if (list.length > 0) setSelectedCohortId(list[0].id);
      })
      .catch(() => {});
  }, [subTab, token, apiUrl, cohorts.length]);

  // Load enrollments when cohort changes
  useEffect(() => {
    if (!selectedCohortId) return;
    fetch(`${apiUrl}/api/admin/accelerator/cohorts/${selectedCohortId}/enrollments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.enrollments || [];
        setEnrollments(list);
        setSelectedEnrollmentId(list.length > 0 ? list[0].id : '');
      })
      .catch(() => {});
  }, [selectedCohortId, token, apiUrl]);

  // Load variables when enrollment changes
  useEffect(() => {
    if (!selectedEnrollmentId) { setVariables([]); return; }
    setVarsLoading(true);
    fetch(`${apiUrl}/api/admin/orchestration/enrollments/${selectedEnrollmentId}/variables`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setVariables(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setVarsLoading(false));
  }, [selectedEnrollmentId, token, apiUrl]);

  return (
    <div>
      <ul className="nav nav-pills mb-3">
        <li className="nav-item">
          <button className={`nav-link ${subTab === 'gates' ? 'active' : ''}`} onClick={() => setSubTab('gates')} style={{ fontSize: 13 }}>Session Gates</button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${subTab === 'variables' ? 'active' : ''}`} onClick={() => setSubTab('variables')} style={{ fontSize: 13 }}>Variable Store</button>
        </li>
      </ul>

      {subTab === 'gates' && (
        gatesLoading ? (
          <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
        ) : (
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between">
              <span>Program Gates</span>
              <span className="badge bg-info" style={{ fontSize: 11 }}>{gates.length} gates</span>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th style={{ fontSize: 12 }}>Type</th>
                    <th style={{ fontSize: 12 }}>Session</th>
                    <th style={{ fontSize: 12 }}>Module</th>
                    <th style={{ fontSize: 12 }}>Lesson</th>
                  </tr>
                </thead>
                <tbody>
                  {gates.map((g: any) => (
                    <tr key={g.id}>
                      <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{g.gate_type}</span></td>
                      <td>{g.session?.title ? `S${g.session.session_number}: ${g.session.title}` : '-'}</td>
                      <td>{g.module?.title ? `M${g.module.module_number}: ${g.module.title}` : '-'}</td>
                      <td>{g.lesson?.title ? `L${g.lesson.lesson_number}: ${g.lesson.title}` : '-'}</td>
                    </tr>
                  ))}
                  {gates.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-muted py-4">No gates defined. Gates are created when session gating rules are configured.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {subTab === 'variables' && (
        <div>
          <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
            <select className="form-select form-select-sm" style={{ width: 220 }} value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)}>
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="form-select form-select-sm" style={{ width: 280 }} value={selectedEnrollmentId} onChange={e => setSelectedEnrollmentId(e.target.value)}>
              <option value="">Select participant...</option>
              {enrollments.map((e: any) => <option key={e.id} value={e.id}>{e.user_name || e.user_email || e.id}</option>)}
            </select>
          </div>

          {varsLoading ? (
            <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ fontSize: 12 }}>Key</th>
                      <th style={{ fontSize: 12 }}>Value</th>
                      <th style={{ fontSize: 12 }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.map((v: any) => (
                      <tr key={v.key || v.id}>
                        <td className="fw-medium">{v.key}</td>
                        <td style={{ maxWidth: 400, fontSize: 12 }}>{typeof v.value === 'object' ? JSON.stringify(v.value).substring(0, 120) : String(v.value).substring(0, 120)}</td>
                        <td style={{ fontSize: 12 }}>{v.updated_at ? new Date(v.updated_at).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                    {variables.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-muted py-4">{selectedEnrollmentId ? 'No variables stored for this participant.' : 'Select a participant to view variables.'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GatingControlTab;
