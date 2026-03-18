import React, { useEffect, useState, useCallback, useRef } from 'react';

interface Props { token: string; apiUrl: string; }

const DATA_TYPES = ['text', 'number', 'boolean', 'json', 'date'];
const SCOPE_OPTIONS = ['section', 'session', 'program', 'artifact'];
const SOURCE_TYPES = ['user_input', 'llm_output', 'system', 'admin'];

const emptyVarDef = {
  variable_key: '', display_name: '', description: '', data_type: 'text',
  default_value: '', required_for_section_build: false, optional: true,
  scope: 'program', source_type: 'user_input', validation_regex: '', sort_order: 0,
};

const GatingControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [subTab, setSubTab] = useState<'gates' | 'variables' | 'definitions'>('gates');
  const [gates, setGates] = useState<any[]>([]);
  const [gatesLoading, setGatesLoading] = useState(true);

  // Variables sub-tab state
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [variables, setVariables] = useState<any[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [expandedVarKey, setExpandedVarKey] = useState<string | null>(null);

  // Variable Definitions sub-tab state
  const [varDefs, setVarDefs] = useState<any[]>([]);
  const [defsLoading, setDefsLoading] = useState(false);
  const [showDefForm, setShowDefForm] = useState(false);
  const [editingDefId, setEditingDefId] = useState<string | null>(null);
  const [defForm, setDefForm] = useState<any>({ ...emptyVarDef });
  const [defSaving, setDefSaving] = useState(false);
  const [defError, setDefError] = useState('');

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/orchestration/program/gates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setGates(Array.isArray(data) ? data : []))
      .catch((err) => setDefError(err.message || 'Failed to load gates'))
      .finally(() => setGatesLoading(false));
  }, [token, apiUrl]);

  // Load cohorts for variables sub-tab
  const cohortsLoadedRef = useRef(false);
  useEffect(() => {
    if (subTab !== 'variables' || cohortsLoadedRef.current) return;
    cohortsLoadedRef.current = true;
    fetch(`${apiUrl}/api/admin/cohorts`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.cohorts || [];
        setCohorts(list);
        if (list.length > 0) setSelectedCohortId(list[0].id);
      })
      .catch((err) => { cohortsLoadedRef.current = false; setDefError(err.message || 'Failed to load cohorts'); });
  }, [subTab, token, apiUrl]);

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
      .catch((err) => setDefError(err.message || 'Failed to load enrollments'));
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

  // Load variable definitions
  const fetchVarDefs = useCallback(async () => {
    setDefsLoading(true);
    setDefError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/variable-definitions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setVarDefs(Array.isArray(data) ? data : []);
    } catch (err: any) { setDefError(err.message); }
    finally { setDefsLoading(false); }
  }, [token, apiUrl]);

  useEffect(() => {
    if (subTab === 'definitions') fetchVarDefs();
  }, [subTab, fetchVarDefs]);

  const handleCreateDef = () => {
    setEditingDefId(null);
    setDefForm({ ...emptyVarDef });
    setShowDefForm(true);
  };

  const handleEditDef = (d: any) => {
    setEditingDefId(d.id);
    setDefForm({
      variable_key: d.variable_key || '',
      display_name: d.display_name || '',
      description: d.description || '',
      data_type: d.data_type || 'text',
      default_value: d.default_value || '',
      required_for_section_build: d.required_for_section_build || false,
      optional: d.optional !== false,
      scope: d.scope || 'program',
      source_type: d.source_type || 'user_input',
      validation_regex: d.validation_regex || '',
      sort_order: d.sort_order || 0,
    });
    setShowDefForm(true);
  };

  const handleSaveDef = async () => {
    setDefSaving(true);
    setDefError('');
    try {
      const url = editingDefId
        ? `${apiUrl}/api/admin/orchestration/variable-definitions/${editingDefId}`
        : `${apiUrl}/api/admin/orchestration/variable-definitions`;
      const method = editingDefId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...defForm,
          sort_order: parseInt(defForm.sort_order) || 0,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed: ${res.status}`);
      }
      setShowDefForm(false);
      fetchVarDefs();
    } catch (err: any) { setDefError(err.message); }
    finally { setDefSaving(false); }
  };

  const handleDeleteDef = async (id: string) => {
    if (!confirm('Delete this variable definition?')) return;
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/variable-definitions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchVarDefs();
    } catch (err: any) { setDefError(err.message); }
  };

  return (
    <div>
      <ul className="nav nav-pills mb-3">
        <li className="nav-item">
          <button className={`nav-link ${subTab === 'gates' ? 'active' : ''}`} onClick={() => setSubTab('gates')} style={{ fontSize: 13 }}>Session Gates</button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${subTab === 'definitions' ? 'active' : ''}`} onClick={() => setSubTab('definitions')} style={{ fontSize: 13 }}>Variable Definitions</button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${subTab === 'variables' ? 'active' : ''}`} onClick={() => setSubTab('variables')} style={{ fontSize: 13 }}>Variable Store</button>
        </li>
      </ul>

      {/* Gates sub-tab */}
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
                    <tr><td colSpan={4} className="text-center text-muted py-4">No gates defined.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Variable Definitions sub-tab */}
      {subTab === 'definitions' && (
        <div>
          {defError && <div className="alert alert-danger" style={{ fontSize: 13 }}>{defError}</div>}

          <div className="d-flex justify-content-end mb-3">
            <button className="btn btn-sm btn-primary" onClick={handleCreateDef}>+ Add Variable Definition</button>
          </div>

          {/* Def Form Modal */}
          {showDefForm && (
            <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
              <div className="modal-dialog modal-lg">
                <div className="modal-content">
                  <div className="modal-header">
                    <h6 className="modal-title">{editingDefId ? 'Edit' : 'Create'} Variable Definition</h6>
                    <button className="btn-close" onClick={() => setShowDefForm(false)} />
                  </div>
                  <div className="modal-body">
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <label className="form-label small fw-medium">Variable Key *</label>
                        <input className="form-control form-control-sm" value={defForm.variable_key}
                          onChange={e => setDefForm({ ...defForm, variable_key: e.target.value })}
                          placeholder="e.g. company_name" disabled={!!editingDefId} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small fw-medium">Display Name *</label>
                        <input className="form-control form-control-sm" value={defForm.display_name}
                          onChange={e => setDefForm({ ...defForm, display_name: e.target.value })}
                          placeholder="e.g. Company Name" />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-medium">Description</label>
                      <textarea className="form-control form-control-sm" rows={2} value={defForm.description}
                        onChange={e => setDefForm({ ...defForm, description: e.target.value })}
                        placeholder="Where does this value come from? E.g., 'Student enters on intake form' or 'Generated by AI during session'" />
                    </div>
                    <div className="row mb-3">
                      <div className="col-md-3">
                        <label className="form-label small fw-medium">Data Type</label>
                        <select className="form-select form-select-sm" value={defForm.data_type}
                          onChange={e => setDefForm({ ...defForm, data_type: e.target.value })}>
                          {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label small fw-medium">Scope</label>
                        <select className="form-select form-select-sm" value={defForm.scope}
                          onChange={e => setDefForm({ ...defForm, scope: e.target.value })}>
                          {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label small fw-medium">Source Type</label>
                        <select className="form-select form-select-sm" value={defForm.source_type}
                          onChange={e => setDefForm({ ...defForm, source_type: e.target.value })}>
                          {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label small fw-medium">Sort Order</label>
                        <input type="number" className="form-control form-control-sm" value={defForm.sort_order}
                          onChange={e => setDefForm({ ...defForm, sort_order: e.target.value })} />
                      </div>
                    </div>
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <label className="form-label small fw-medium">Default Value</label>
                        <input className="form-control form-control-sm" value={defForm.default_value}
                          onChange={e => setDefForm({ ...defForm, default_value: e.target.value })} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small fw-medium">Validation Regex</label>
                        <input className="form-control form-control-sm" value={defForm.validation_regex}
                          onChange={e => setDefForm({ ...defForm, validation_regex: e.target.value })}
                          placeholder="e.g. ^[a-zA-Z ]+$" />
                      </div>
                    </div>
                    <div className="row mb-3">
                      <div className="col-md-4">
                        <div className="form-check">
                          <input type="checkbox" className="form-check-input" id="reqBuild"
                            checked={defForm.required_for_section_build}
                            onChange={e => setDefForm({ ...defForm, required_for_section_build: e.target.checked })} />
                          <label className="form-check-label small" htmlFor="reqBuild">Required for Section Build</label>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="form-check">
                          <input type="checkbox" className="form-check-input" id="optionalVar"
                            checked={defForm.optional}
                            onChange={e => setDefForm({ ...defForm, optional: e.target.checked })} />
                          <label className="form-check-label small" htmlFor="optionalVar">Optional</label>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowDefForm(false)}>Cancel</button>
                    <button className="btn btn-sm btn-primary" onClick={handleSaveDef}
                      disabled={defSaving || !defForm.variable_key || !defForm.display_name}>
                      {defSaving ? 'Saving...' : editingDefId ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {defsLoading ? (
            <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
          ) : (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white fw-semibold d-flex justify-content-between">
                <span>Variable Definitions</span>
                <span className="badge bg-info" style={{ fontSize: 11 }}>{varDefs.length} definitions</span>
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ fontSize: 12 }}>Key</th>
                      <th style={{ fontSize: 12 }}>Display Name</th>
                      <th style={{ fontSize: 12 }}>Description</th>
                      <th style={{ fontSize: 12 }}>Type</th>
                      <th style={{ fontSize: 12 }}>Scope</th>
                      <th style={{ fontSize: 12 }}>Source</th>
                      <th style={{ fontSize: 12 }}>Flags</th>
                      <th style={{ fontSize: 12 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {varDefs.map((d: any) => {
                      const sourceBadge: Record<string, string> = {
                        user_input: 'bg-primary', llm_output: 'bg-info', system: 'bg-secondary', admin: 'bg-warning text-dark',
                      };
                      return (
                        <tr key={d.id}>
                          <td className="fw-medium font-monospace" style={{ fontSize: 12 }}>{d.variable_key}</td>
                          <td>{d.display_name}</td>
                          <td style={{ fontSize: 11, maxWidth: 220 }}>
                            {d.description || <span className="text-muted fst-italic">No description</span>}
                          </td>
                          <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{d.data_type}</span></td>
                          <td><span className="badge bg-info" style={{ fontSize: 10 }}>{d.scope}</span></td>
                          <td><span className={`badge ${sourceBadge[d.source_type] || 'bg-secondary'}`} style={{ fontSize: 10 }}>{d.source_type}</span></td>
                          <td>
                            {d.required_for_section_build && <span className="badge bg-danger me-1" style={{ fontSize: 10 }}>Required</span>}
                            {!d.optional && <span className="badge bg-warning text-dark" style={{ fontSize: 10 }}>Mandatory</span>}
                          </td>
                          <td>
                            <div className="d-flex gap-1">
                              <button className="btn btn-sm btn-outline-primary" onClick={() => handleEditDef(d)}>Edit</button>
                              <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteDef(d.id)}>Del</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {varDefs.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-muted py-4">No variable definitions yet. Add definitions to control what variables are tracked.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Variables sub-tab */}
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
                        <td style={{ maxWidth: 400, fontSize: 12 }}>
                          {(() => {
                            const raw = typeof v.value === 'object' ? JSON.stringify(v.value, null, 2) : String(v.value);
                            const isLong = raw.length > 120;
                            const isExpanded = expandedVarKey === (v.key || v.id);
                            return (
                              <>
                                <span style={isExpanded ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } : undefined}>
                                  {isExpanded ? raw : raw.substring(0, 120)}{!isExpanded && isLong ? '...' : ''}
                                </span>
                                {isLong && (
                                  <button className="btn btn-link btn-sm p-0 ms-1" style={{ fontSize: 10 }}
                                    onClick={() => setExpandedVarKey(isExpanded ? null : (v.key || v.id))}>
                                    {isExpanded ? 'collapse' : 'expand'}
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </td>
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
