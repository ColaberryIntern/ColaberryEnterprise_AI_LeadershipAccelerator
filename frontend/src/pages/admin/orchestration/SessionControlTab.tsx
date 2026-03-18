import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

const CHECKLIST_TYPES = ['tool_setup', 'account_creation', 'reading', 'prerequisite', 'custom'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'UTC'];

const SessionControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Cohort config state
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [cohortEditing, setCohortEditing] = useState(false);
  const [cohortForm, setCohortForm] = useState<any>(null);
  const [cohortSaving, setCohortSaving] = useState(false);

  const fetchCohorts = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/cohorts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.cohorts || [];
      setCohorts(list);
      if (list.length > 0 && !selectedCohortId) {
        setSelectedCohortId(list[0].id);
      }
    } catch {}
  }, [token, apiUrl, selectedCohortId]);

  useEffect(() => { fetchCohorts(); }, [fetchCohorts]);

  const selectedCohort = cohorts.find((c: any) => c.id === selectedCohortId);

  const handleCohortEdit = () => {
    if (!selectedCohort) return;
    setCohortForm({
      name: selectedCohort.name || '',
      start_date: selectedCohort.start_date || '',
      core_day: selectedCohort.core_day || 'Thursday',
      core_time: selectedCohort.core_time || '',
      optional_lab_day: selectedCohort.optional_lab_day || '',
      timezone: selectedCohort.timezone || 'America/Chicago',
      max_seats: selectedCohort.max_seats || 20,
      status: selectedCohort.status || 'open',
    });
    setCohortEditing(true);
  };

  const handleCohortSave = async () => {
    if (!selectedCohortId || !cohortForm) return;
    setCohortSaving(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/cohorts/${selectedCohortId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cohortForm,
          optional_lab_day: cohortForm.optional_lab_day || null,
          max_seats: parseInt(cohortForm.max_seats) || 20,
        }),
      });
      if (!res.ok) throw new Error('Failed to save cohort');
      setCohortEditing(false);
      fetchCohorts();
    } catch (err: any) { setError(err.message); }
    finally { setCohortSaving(false); }
  };

  // Session fields editing
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Checklist state
  const [checklist, setChecklist] = useState<any[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [checklistForm, setChecklistForm] = useState({ checklist_item: '', description: '', item_type: 'custom' });

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/program/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, [token, apiUrl]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const fetchChecklist = useCallback(async (sessionId: string) => {
    setChecklistLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/sessions/${sessionId}/checklist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setChecklist(Array.isArray(data) ? data : []);
    } catch {} finally { setChecklistLoading(false); }
  }, [token, apiUrl]);

  useEffect(() => {
    if (expanded) fetchChecklist(expanded);
    else setChecklist([]);
  }, [expanded, fetchChecklist]);

  const handleEditSession = (s: any) => {
    setEditingSession({
      id: s.id,
      title: s.title,
      minimum_section_completion_pct: s.minimum_section_completion_pct || 0,
      required_variable_keys: (s.required_variable_keys || []).join(', '),
    });
  };

  const handleSaveSession = async () => {
    if (!editingSession) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/sessions/${editingSession.id}/fields`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minimum_section_completion_pct: parseInt(editingSession.minimum_section_completion_pct) || 0,
          required_variable_keys: editingSession.required_variable_keys
            ? editingSession.required_variable_keys.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setEditingSession(null);
      fetchSessions();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleCreateChecklist = () => {
    setEditingChecklistId(null);
    setChecklistForm({ checklist_item: '', description: '', item_type: 'custom' });
    setShowChecklistForm(true);
  };

  const handleEditChecklist = (item: any) => {
    setEditingChecklistId(item.id);
    setChecklistForm({
      checklist_item: item.checklist_item || '',
      description: item.description || '',
      item_type: item.item_type || 'custom',
    });
    setShowChecklistForm(true);
  };

  const handleSaveChecklist = async () => {
    if (!expanded) return;
    setSaving(true);
    setError('');
    try {
      const url = editingChecklistId
        ? `${apiUrl}/api/admin/orchestration/checklist/${editingChecklistId}`
        : `${apiUrl}/api/admin/orchestration/sessions/${expanded}/checklist`;
      const method = editingChecklistId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(checklistForm),
      });
      if (!res.ok) throw new Error('Failed to save');
      setShowChecklistForm(false);
      fetchChecklist(expanded);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDeleteChecklist = async (id: string) => {
    if (!expanded || !confirm('Delete this checklist item?')) return;
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/checklist/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchChecklist(expanded);
    } catch (err: any) { setError(err.message); }
  };

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
    </div>
  );

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      {/* Cohort Configuration Panel */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Cohort Configuration</span>
          {cohorts.length > 1 && (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto', fontSize: 12 }}
              value={selectedCohortId}
              onChange={e => { setSelectedCohortId(e.target.value); setCohortEditing(false); }}
            >
              {cohorts.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="card-body" style={{ fontSize: 13 }}>
          {!selectedCohort ? (
            <p className="text-muted mb-0">No cohorts found.</p>
          ) : cohortEditing && cohortForm ? (
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-medium">Cohort Name</label>
                <input className="form-control form-control-sm" value={cohortForm.name}
                  onChange={e => setCohortForm({ ...cohortForm, name: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Start Date</label>
                <input type="date" className="form-control form-control-sm" value={cohortForm.start_date}
                  onChange={e => setCohortForm({ ...cohortForm, start_date: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Status</label>
                <select className="form-select form-select-sm" value={cohortForm.status}
                  onChange={e => setCohortForm({ ...cohortForm, status: e.target.value })}>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Core Session Day</label>
                <select className="form-select form-select-sm" value={cohortForm.core_day}
                  onChange={e => setCohortForm({ ...cohortForm, core_day: e.target.value })}>
                  {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Core Session Time</label>
                <input className="form-control form-control-sm" value={cohortForm.core_time}
                  placeholder="e.g. 1:00–3:00 PM"
                  onChange={e => setCohortForm({ ...cohortForm, core_time: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Optional Lab Day</label>
                <select className="form-select form-select-sm" value={cohortForm.optional_lab_day}
                  onChange={e => setCohortForm({ ...cohortForm, optional_lab_day: e.target.value })}>
                  <option value="">None</option>
                  {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Timezone</label>
                <select className="form-select form-select-sm" value={cohortForm.timezone}
                  onChange={e => setCohortForm({ ...cohortForm, timezone: e.target.value })}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('America/', '').replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Max Seats</label>
                <input type="number" className="form-control form-control-sm" min={1} value={cohortForm.max_seats}
                  onChange={e => setCohortForm({ ...cohortForm, max_seats: e.target.value })} />
              </div>
              <div className="col-12 d-flex gap-2 mt-2">
                <button className="btn btn-sm btn-primary" onClick={handleCohortSave} disabled={cohortSaving}>
                  {cohortSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setCohortEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="row">
              <div className="col-md-8">
                <div className="row g-2">
                  <div className="col-6 col-md-4">
                    <span className="text-muted small">Name</span>
                    <div className="fw-medium">{selectedCohort.name}</div>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted small">Start Date</span>
                    <div className="fw-medium">{selectedCohort.start_date ? new Date(selectedCohort.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-'}</div>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted small">Status</span>
                    <div><span className={`badge ${selectedCohort.status === 'open' ? 'bg-success' : selectedCohort.status === 'closed' ? 'bg-warning' : 'bg-secondary'}`} style={{ fontSize: 10 }}>{selectedCohort.status || 'open'}</span></div>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted small">Core Sessions</span>
                    <div className="fw-medium">{selectedCohort.core_day} at {selectedCohort.core_time}</div>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted small">Optional Lab</span>
                    <div className="fw-medium">{selectedCohort.optional_lab_day || 'None'}</div>
                  </div>
                  <div className="col-6 col-md-4">
                    <span className="text-muted small">Capacity</span>
                    <div className="fw-medium">{selectedCohort.seats_taken || 0} / {selectedCohort.max_seats || 20}</div>
                  </div>
                </div>
              </div>
              <div className="col-md-4 d-flex align-items-start justify-content-end">
                <button className="btn btn-sm btn-outline-primary" onClick={handleCohortEdit}>Edit Configuration</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Session Fields Edit Modal */}
      {editingSession && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">Session Thresholds: {editingSession.title}</h6>
                <button className="btn-close" onClick={() => setEditingSession(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small fw-medium">Minimum Section Completion %</label>
                  <input type="number" className="form-control form-control-sm" min={0} max={100}
                    value={editingSession.minimum_section_completion_pct}
                    onChange={e => setEditingSession({ ...editingSession, minimum_section_completion_pct: e.target.value })} />
                  <small className="text-muted">Percentage of linked sections that must be completed before session</small>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium">Required Variable Keys</label>
                  <input className="form-control form-control-sm"
                    value={editingSession.required_variable_keys}
                    onChange={e => setEditingSession({ ...editingSession, required_variable_keys: e.target.value })}
                    placeholder="company_name, industry, role" />
                  <small className="text-muted">Comma-separated variable keys that must be set before session</small>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingSession(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSaveSession} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Form Modal */}
      {showChecklistForm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">{editingChecklistId ? 'Edit' : 'Add'} Checklist Item</h6>
                <button className="btn-close" onClick={() => setShowChecklistForm(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small fw-medium">Item *</label>
                  <input className="form-control form-control-sm" value={checklistForm.checklist_item}
                    onChange={e => setChecklistForm({ ...checklistForm, checklist_item: e.target.value })}
                    placeholder="e.g. Create Claude.ai account" />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium">Description</label>
                  <textarea className="form-control form-control-sm" rows={2} value={checklistForm.description}
                    onChange={e => setChecklistForm({ ...checklistForm, description: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium">Type</label>
                  <select className="form-select form-select-sm" value={checklistForm.item_type}
                    onChange={e => setChecklistForm({ ...checklistForm, item_type: e.target.value })}>
                    {CHECKLIST_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowChecklistForm(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSaveChecklist}
                  disabled={saving || !checklistForm.checklist_item}>
                  {saving ? 'Saving...' : editingChecklistId ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <th style={{ fontSize: 12 }}>Min %</th>
                <th style={{ fontSize: 12 }}>Req. Vars</th>
                <th style={{ fontSize: 12 }}>Checklist</th>
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
                    <td>{s.minimum_section_completion_pct ? `${s.minimum_section_completion_pct}%` : '-'}</td>
                    <td style={{ fontSize: 11 }}>{(s.required_variable_keys || []).length || '-'}</td>
                    <td>-</td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => handleEditSession(s)}>Thresholds</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                          {expanded === s.id ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr>
                      <td colSpan={9} className="bg-light">
                        <div className="p-2">
                          <p className="text-muted small mb-2">{s.description}</p>
                          <div className="row">
                            <div className="col-md-6">
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
                            <div className="col-md-6">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <strong style={{ fontSize: 12 }}>Pre-Session Checklist</strong>
                                <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 11 }} onClick={handleCreateChecklist}>+ Add</button>
                              </div>
                              {checklistLoading ? (
                                <div className="text-center py-2"><div className="spinner-border spinner-border-sm text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
                              ) : checklist.length === 0 ? (
                                <p className="text-muted small">No checklist items.</p>
                              ) : (
                                <table className="table table-sm mt-1 mb-0" style={{ fontSize: 12 }}>
                                  <tbody>
                                    {checklist.map((item: any) => (
                                      <tr key={item.id}>
                                        <td style={{ width: 30 }}><span className="badge bg-secondary" style={{ fontSize: 9 }}>{item.item_type}</span></td>
                                        <td>{item.checklist_item}</td>
                                        <td style={{ width: 80 }}>
                                          <div className="d-flex gap-1">
                                            <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10, padding: '1px 4px' }} onClick={() => handleEditChecklist(item)}>Edit</button>
                                            <button className="btn btn-sm btn-outline-danger" style={{ fontSize: 10, padding: '1px 4px' }} onClick={() => handleDeleteChecklist(item.id)}>Del</button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={9} className="text-center text-muted py-4">No sessions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SessionControlTab;
