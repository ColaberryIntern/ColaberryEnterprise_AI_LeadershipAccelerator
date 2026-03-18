import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

const CHECKLIST_TYPES = ['tool_setup', 'account_creation', 'reading', 'prerequisite', 'custom'];

function formatTimeLabel(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour}:00 ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}
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
        // Auto-select nearest upcoming cohort
        const today = new Date().toISOString().split('T')[0];
        const upcoming = list
          .filter((c: any) => c.start_date >= today)
          .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));
        setSelectedCohortId(upcoming.length > 0 ? upcoming[0].id : list[0].id);
      }
    } catch {}
  }, [token, apiUrl, selectedCohortId]);

  useEffect(() => { fetchCohorts(); }, [fetchCohorts]);

  const selectedCohort = cohorts.find((c: any) => c.id === selectedCohortId);

  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState('');

  const handleCohortEdit = () => {
    if (!selectedCohort) return;
    const schedule = selectedCohort.settings_json?.schedule || {};
    setCohortForm({
      name: selectedCohort.name || '',
      start_date: selectedCohort.start_date || '',
      core_day: selectedCohort.core_day || 'Thursday',
      core_time: selectedCohort.core_time || '',
      optional_lab_day: selectedCohort.optional_lab_day || '',
      timezone: selectedCohort.timezone || 'America/Chicago',
      max_seats: selectedCohort.max_seats || 20,
      status: selectedCohort.status || 'open',
      // Schedule config
      recurring_days: schedule.recurring_days || [selectedCohort.core_day || 'Thursday', selectedCohort.optional_lab_day].filter(Boolean),
      start_time: schedule.start_time || '13:00',
      end_time: schedule.end_time || '15:00',
      total_sessions: schedule.total_sessions || 5,
      core_days: schedule.core_days || [selectedCohort.core_day || 'Thursday'],
    });
    setCohortEditing(true);
  };

  const handleToggleDay = (day: string) => {
    if (!cohortForm) return;
    const days = cohortForm.recurring_days || [];
    const updated = days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day];
    setCohortForm({ ...cohortForm, recurring_days: updated });
  };

  const handleToggleCoreDay = (day: string) => {
    if (!cohortForm) return;
    const days = cohortForm.core_days || [];
    const updated = days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day];
    setCohortForm({ ...cohortForm, core_days: updated });
  };

  const handleCohortSave = async () => {
    if (!selectedCohortId || !cohortForm) return;
    setCohortSaving(true);
    setError('');
    try {
      const { recurring_days, start_time, end_time, total_sessions, core_days, ...cohortFields } = cohortForm;
      // Derive core_day and optional_lab_day from recurring schedule config
      const primaryCoreDay = core_days?.[0] || recurring_days?.[0] || cohortFields.core_day;
      const labDays = (recurring_days || []).filter((d: string) => !(core_days || []).includes(d));
      const labDay = labDays[0] || '';
      const timeLabel = start_time && end_time
        ? `${formatTimeLabel(start_time)}–${formatTimeLabel(end_time)}`
        : cohortFields.core_time;

      const res = await fetch(`${apiUrl}/api/admin/cohorts/${selectedCohortId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cohortFields,
          core_day: primaryCoreDay,
          core_time: timeLabel,
          optional_lab_day: labDay || undefined,
          max_seats: parseInt(cohortFields.max_seats) || 20,
          settings_json: {
            ...(selectedCohort?.settings_json || {}),
            schedule: { recurring_days, start_time, end_time, total_sessions: parseInt(total_sessions) || 5, core_days },
          },
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

  // Session schedule editing
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // Checklist state
  const [checklist, setChecklist] = useState<any[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [checklistForm, setChecklistForm] = useState({ checklist_item: '', description: '', item_type: 'custom' });

  const fetchSessions = useCallback(async () => {
    if (!selectedCohortId) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/program/sessions?cohort_id=${selectedCohortId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, [token, apiUrl, selectedCohortId]);

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

  const handleEditSchedule = (s: any) => {
    setEditingSchedule({
      id: s.id,
      title: s.title || '',
      session_date: s.session_date || '',
      start_time: s.start_time ? s.start_time.slice(0, 5) : '',
      end_time: s.end_time ? s.end_time.slice(0, 5) : '',
      session_type: s.session_type || 'core',
      status: s.status || 'scheduled',
      description: s.description || '',
    });
  };

  const handleSaveSchedule = async () => {
    if (!editingSchedule) return;
    setScheduleSaving(true);
    setError('');
    try {
      const payload: any = {};
      if (editingSchedule.title) payload.title = editingSchedule.title;
      if (editingSchedule.session_date) payload.session_date = editingSchedule.session_date;
      if (editingSchedule.start_time) payload.start_time = editingSchedule.start_time;
      if (editingSchedule.end_time) payload.end_time = editingSchedule.end_time;
      if (editingSchedule.session_type) payload.session_type = editingSchedule.session_type;
      if (editingSchedule.status) payload.status = editingSchedule.status;
      payload.description = editingSchedule.description || '';

      const res = await fetch(`${apiUrl}/api/admin/orchestration/sessions/${editingSchedule.id}/fields`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details ? err.details.map((d: any) => `${d.field}: ${d.message}`).join(', ') : 'Failed to save');
      }
      setEditingSchedule(null);
      fetchSessions();
    } catch (err: any) { setError(err.message); }
    finally { setScheduleSaving(false); }
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

              {/* Recurring Schedule Builder */}
              <div className="col-12 mt-3">
                <div className="card bg-light border-0 p-3">
                  <h6 className="fw-semibold mb-3" style={{ fontSize: 13 }}>Recurring Schedule</h6>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-medium">Session Days</label>
                      <div className="d-flex flex-wrap gap-2">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => (
                          <button
                            key={day}
                            type="button"
                            className={`btn btn-sm ${(cohortForm.recurring_days || []).includes(day) ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => handleToggleDay(day)}
                            style={{ fontSize: 12 }}
                          >
                            {day.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium">Core Days (others are Lab)</label>
                      <div className="d-flex flex-wrap gap-2">
                        {(cohortForm.recurring_days || []).map((day: string) => (
                          <button
                            key={day}
                            type="button"
                            className={`btn btn-sm ${(cohortForm.core_days || []).includes(day) ? 'bg-primary text-white' : 'btn-outline-success'}`}
                            onClick={() => handleToggleCoreDay(day)}
                            style={{ fontSize: 11 }}
                          >
                            {day} {(cohortForm.core_days || []).includes(day) ? '(Core)' : '(Lab)'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-medium">Start Time</label>
                      <input type="time" className="form-control form-control-sm"
                        value={cohortForm.start_time || '13:00'}
                        onChange={e => setCohortForm({ ...cohortForm, start_time: e.target.value })} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-medium">End Time</label>
                      <input type="time" className="form-control form-control-sm"
                        value={cohortForm.end_time || '15:00'}
                        onChange={e => setCohortForm({ ...cohortForm, end_time: e.target.value })} />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small fw-medium">Total Sessions</label>
                      <input type="number" className="form-control form-control-sm" min={1} max={50}
                        value={cohortForm.total_sessions || 5}
                        onChange={e => setCohortForm({ ...cohortForm, total_sessions: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {genMessage && (
                <div className="col-12">
                  <div className="alert alert-success small mb-0" style={{ fontSize: 12 }}>{genMessage}</div>
                </div>
              )}

              <div className="col-12 d-flex gap-2 mt-2">
                <button className="btn btn-sm btn-primary" onClick={handleCohortSave} disabled={cohortSaving}>
                  {cohortSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  className="btn btn-sm btn-success"
                  disabled={generating || !(cohortForm.recurring_days?.length > 0)}
                  onClick={async () => {
                    // Save first, then generate
                    await handleCohortSave();
                    setGenerating(true);
                    setGenMessage('');
                    try {
                      const res = await fetch(`${apiUrl}/api/admin/orchestration/cohorts/${selectedCohortId}/generate-sessions`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to generate');
                      setGenMessage(data.message);
                      fetchSessions();
                    } catch (err: any) { setError(err.message); }
                    finally { setGenerating(false); }
                  }}
                >
                  {generating ? 'Generating...' : 'Save & Generate Sessions'}
                </button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => { setCohortEditing(false); setGenMessage(''); }}>Cancel</button>
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

      {/* Session Schedule Edit Modal */}
      {editingSchedule && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">Edit Session Details</h6>
                <button className="btn-close" onClick={() => setEditingSchedule(null)} aria-label="Close" />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small fw-medium">Title *</label>
                    <input className="form-control form-control-sm" value={editingSchedule.title}
                      onChange={e => setEditingSchedule({ ...editingSchedule, title: e.target.value })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-medium">Session Date *</label>
                    <input type="date" className="form-control form-control-sm" value={editingSchedule.session_date}
                      onChange={e => setEditingSchedule({ ...editingSchedule, session_date: e.target.value })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-medium">Start Time</label>
                    <input type="time" className="form-control form-control-sm" value={editingSchedule.start_time}
                      onChange={e => setEditingSchedule({ ...editingSchedule, start_time: e.target.value })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-medium">End Time</label>
                    <input type="time" className="form-control form-control-sm" value={editingSchedule.end_time}
                      onChange={e => setEditingSchedule({ ...editingSchedule, end_time: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Type</label>
                    <select className="form-select form-select-sm" value={editingSchedule.session_type}
                      onChange={e => setEditingSchedule({ ...editingSchedule, session_type: e.target.value })}>
                      <option value="core">Core</option>
                      <option value="lab">Lab</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Status</label>
                    <select className="form-select form-select-sm" value={editingSchedule.status}
                      onChange={e => setEditingSchedule({ ...editingSchedule, status: e.target.value })}>
                      <option value="scheduled">Scheduled</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-medium">Description</label>
                    <textarea className="form-control form-control-sm" rows={3} value={editingSchedule.description}
                      onChange={e => setEditingSchedule({ ...editingSchedule, description: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingSchedule(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSaveSchedule}
                  disabled={scheduleSaving || !editingSchedule.title || !editingSchedule.session_date}>
                  {scheduleSaving ? 'Saving...' : 'Save'}
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
                <th style={{ fontSize: 12 }}>Time</th>
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
                    <td style={{ fontSize: 11 }}>{s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : '-'}</td>
                    <td><span className={`badge ${s.session_type === 'lab' ? 'bg-success' : 'bg-primary'}`} style={{ fontSize: 10 }}>{s.session_type}</span></td>
                    <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{s.status}</span></td>
                    <td>{s.minimum_section_completion_pct ? `${s.minimum_section_completion_pct}%` : '-'}</td>
                    <td style={{ fontSize: 11 }}>{(s.required_variable_keys || []).length || '-'}</td>
                    <td>-</td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => handleEditSchedule(s)}>Edit</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => handleEditSession(s)}>Thresholds</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                          {expanded === s.id ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr>
                      <td colSpan={10} className="bg-light">
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
                <tr><td colSpan={10} className="text-center text-muted py-4">No sessions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SessionControlTab;
