import React, { useEffect, useState, useCallback } from 'react';

interface GatingControlTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

interface Gate {
  id: string;
  gate_type: string;
  session_id: string;
  session_number: number;
  session_title: string;
  module_id: string | null;
  lesson_id: string | null;
  description: string;
  is_active: boolean;
}

interface Variable {
  key: string;
  value: any;
  updated_at: string;
}

interface Enrollment {
  id: string;
  user_name: string;
  user_email: string;
}

const GatingControlTab: React.FC<GatingControlTabProps> = ({ token, cohortId, apiUrl }) => {
  const [activeSection, setActiveSection] = useState<'gates' | 'variables'>('gates');

  // Gates state
  const [gates, setGates] = useState<Gate[]>([]);
  const [gatesLoading, setGatesLoading] = useState(true);
  const [gatesError, setGatesError] = useState('');

  // Variables state
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [variables, setVariables] = useState<Variable[]>([]);
  const [variablesLoading, setVariablesLoading] = useState(false);
  const [variablesError, setVariablesError] = useState('');

  // Fetch gates
  useEffect(() => {
    const fetchGates = async () => {
      setGatesLoading(true);
      setGatesError('');
      try {
        const res = await fetch(
          `${apiUrl}/api/admin/orchestration/cohorts/${cohortId}/gates`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Failed to fetch gates: ${res.status}`);
        const data = await res.json();
        setGates(Array.isArray(data) ? data : data.gates || []);
      } catch (err: any) {
        setGatesError(err.message);
      } finally {
        setGatesLoading(false);
      }
    };
    if (cohortId) fetchGates();
  }, [token, cohortId, apiUrl]);

  // Fetch enrollments
  useEffect(() => {
    const fetchEnrollments = async () => {
      try {
        const res = await fetch(
          `${apiUrl}/api/admin/accelerator/cohorts/${cohortId}/enrollments`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Failed to fetch enrollments: ${res.status}`);
        const data = await res.json();
        setEnrollments(Array.isArray(data) ? data : data.enrollments || []);
      } catch (err: any) {
        setVariablesError(err.message);
      }
    };
    if (cohortId) fetchEnrollments();
  }, [token, cohortId, apiUrl]);

  // Fetch variables for selected enrollment
  const fetchVariables = useCallback(async () => {
    if (!selectedEnrollmentId) return;
    setVariablesLoading(true);
    setVariablesError('');
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/orchestration/enrollments/${selectedEnrollmentId}/variables`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch variables: ${res.status}`);
      const data = await res.json();
      const vars = data.variables || data;
      if (Array.isArray(vars)) {
        setVariables(vars);
      } else if (typeof vars === 'object') {
        setVariables(
          Object.entries(vars).map(([key, value]) => ({
            key,
            value,
            updated_at: '',
          }))
        );
      }
    } catch (err: any) {
      setVariablesError(err.message);
    } finally {
      setVariablesLoading(false);
    }
  }, [selectedEnrollmentId, token, apiUrl]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  const gateBadge = (gateType: string) => {
    const map: Record<string, string> = {
      prerequisite: 'bg-warning',
      completion: 'bg-success',
      artifact: 'bg-info',
      skill: 'bg-primary',
      manual: 'bg-secondary',
    };
    return map[gateType?.toLowerCase()] || 'bg-secondary';
  };

  return (
    <div>
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeSection === 'gates' ? 'active' : ''}`}
            onClick={() => setActiveSection('gates')}
            style={{ fontSize: 13 }}
          >
            Session Gates
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeSection === 'variables' ? 'active' : ''}`}
            onClick={() => setActiveSection('variables')}
            style={{ fontSize: 13 }}
          >
            Variable Store
          </button>
        </li>
      </ul>

      {activeSection === 'gates' && (
        <>
          {gatesError && (
            <div className="alert alert-danger" style={{ fontSize: 13 }}>{gatesError}</div>
          )}
          {gatesLoading ? (
            <div className="text-center py-4">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading gates...</span>
              </div>
            </div>
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white fw-semibold">
                Gating Rules ({gates.length})
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ fontSize: 12 }}>Gate Type</th>
                      <th style={{ fontSize: 12 }}>Session</th>
                      <th style={{ fontSize: 12 }}>Module</th>
                      <th style={{ fontSize: 12 }}>Lesson</th>
                      <th style={{ fontSize: 12 }}>Description</th>
                      <th style={{ fontSize: 12 }}>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gates.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <span className={`badge ${gateBadge(g.gate_type)}`} style={{ fontSize: 11 }}>
                            {g.gate_type}
                          </span>
                        </td>
                        <td>
                          {g.session_number ? `S${g.session_number}: ${g.session_title}` : '-'}
                        </td>
                        <td style={{ fontSize: 12 }}>{g.module_id || '-'}</td>
                        <td style={{ fontSize: 12 }}>{g.lesson_id || '-'}</td>
                        <td style={{ maxWidth: 250 }}>{g.description || '-'}</td>
                        <td>
                          {g.is_active ? (
                            <span className="badge bg-success" style={{ fontSize: 11 }}>Active</span>
                          ) : (
                            <span className="badge bg-secondary" style={{ fontSize: 11 }}>Inactive</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {gates.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          No gating rules configured for this cohort.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeSection === 'variables' && (
        <>
          {variablesError && (
            <div className="alert alert-danger" style={{ fontSize: 13 }}>{variablesError}</div>
          )}

          <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
            <label className="small fw-medium" style={{ fontSize: 12 }}>Enrollment:</label>
            <select
              className="form-select form-select-sm"
              style={{ width: 350, fontSize: 13 }}
              value={selectedEnrollmentId}
              onChange={(e) => setSelectedEnrollmentId(e.target.value)}
            >
              <option value="">Select an enrollment...</option>
              {enrollments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.user_name} ({e.user_email})
                </option>
              ))}
            </select>
          </div>

          {variablesLoading && (
            <div className="text-center py-4">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading variables...</span>
              </div>
            </div>
          )}

          {!variablesLoading && selectedEnrollmentId && (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white fw-semibold">
                Variable Store ({variables.length} variables)
              </div>
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
                    {variables.map((v) => (
                      <tr key={v.key}>
                        <td className="fw-medium font-monospace" style={{ fontSize: 12 }}>
                          {v.key}
                        </td>
                        <td style={{ maxWidth: 400 }}>
                          <pre
                            className="mb-0"
                            style={{
                              fontSize: 12,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                            }}
                          >
                            {typeof v.value === 'object'
                              ? JSON.stringify(v.value, null, 2)
                              : String(v.value)}
                          </pre>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {v.updated_at ? new Date(v.updated_at).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))}
                    {variables.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center text-muted py-4">
                          No variables found for this enrollment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!selectedEnrollmentId && !variablesLoading && (
            <div className="text-muted text-center py-4" style={{ fontSize: 13 }}>
              Select an enrollment to view variable store data.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GatingControlTab;
