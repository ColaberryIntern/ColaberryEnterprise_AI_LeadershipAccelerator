import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

const ARTIFACT_TYPES = [
  'document', 'screenshot', 'file', 'github_file', 'markdown', 'github_repo_check',
  'notebooklm_output', 'slide_deck', 'video', 'podcast', 'infographic',
  'python_script', 'claude_code_output',
];

const REQUIRED_BEFORE_OPTIONS = ['', 'section', 'session', 'build', 'presentation'];

const emptyForm = {
  name: '', artifact_type: 'document', description: '',
  required_for_session: false, required_for_build_unlock: false, required_for_presentation_unlock: false,
  produces_variable_keys: '',
  instruction_prompt_id: '', validation_rule: '', skill_mapping: '',
  required_before: '', lesson_id: '',
};

const ArtifactControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prompts, setPrompts] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/api/admin/orchestration/program/sessions`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${apiUrl}/api/admin/orchestration/prompts`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${apiUrl}/api/admin/orchestration/program/modules`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([sessData, promptData, modData]) => {
      const sList = Array.isArray(sessData) ? sessData : [];
      setSessions(sList);
      if (sList.length > 0) setSelectedSessionId(sList[0].id);
      setPrompts(Array.isArray(promptData) ? promptData : []);
      const allLessons: any[] = [];
      (Array.isArray(modData) ? modData : []).forEach((m: any) => {
        (m.lessons || []).forEach((l: any) => allLessons.push({ ...l, moduleTitle: m.title, moduleNumber: m.module_number }));
      });
      setLessons(allLessons);
    }).catch((err) => setError(err.message || 'Failed to load initial data'));
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

  const handleCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const handleEdit = (a: any) => {
    setEditingId(a.id);
    setForm({
      name: a.name || '',
      artifact_type: a.artifact_type || 'document',
      description: a.description || '',
      required_for_session: a.required_for_session || false,
      required_for_build_unlock: a.required_for_build_unlock || false,
      required_for_presentation_unlock: a.required_for_presentation_unlock || false,
      produces_variable_keys: (a.produces_variable_keys || []).join(', '),
      instruction_prompt_id: a.instruction_prompt_id || '',
      validation_rule: a.validation_rule ? JSON.stringify(a.validation_rule) : '',
      skill_mapping: a.skill_mapping ? JSON.stringify(a.skill_mapping) : '',
      required_before: a.required_before || '',
      lesson_id: a.lesson_id || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body: any = {
        name: form.name,
        artifact_type: form.artifact_type,
        description: form.description || null,
        required_for_session: form.required_for_session,
        required_for_build_unlock: form.required_for_build_unlock,
        required_for_presentation_unlock: form.required_for_presentation_unlock,
        produces_variable_keys: form.produces_variable_keys ? form.produces_variable_keys.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        instruction_prompt_id: form.instruction_prompt_id || null,
        required_before: form.required_before || null,
        lesson_id: form.lesson_id || null,
      };
      if (form.validation_rule) {
        try { body.validation_rule = JSON.parse(form.validation_rule); } catch { setError('Invalid JSON in validation rule — field ignored.'); }
      }
      if (form.skill_mapping) {
        try { body.skill_mapping = JSON.parse(form.skill_mapping); } catch { setError('Invalid JSON in skill mapping — field ignored.'); }
      }

      const url = editingId
        ? `${apiUrl}/api/admin/orchestration/artifacts/${editingId}`
        : `${apiUrl}/api/admin/orchestration/sessions/${selectedSessionId}/artifacts`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed: ${res.status}`);
      }
      setShowForm(false);
      fetchArtifacts();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this artifact definition?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/artifacts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      fetchArtifacts();
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div>
      <div className="d-flex gap-2 mb-3 align-items-center">
        <label className="form-label small fw-medium mb-0">Session:</label>
        <select className="form-select form-select-sm" style={{ width: 300 }} value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}>
          {sessions.map(s => <option key={s.id} value={s.id}>Session {s.session_number}: {s.title}</option>)}
        </select>
        <button className="btn btn-sm btn-primary ms-auto" onClick={handleCreate}>+ Add Artifact</button>
      </div>

      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">{editingId ? 'Edit' : 'Create'} Artifact Definition</h6>
                <button className="btn-close" onClick={() => setShowForm(false)} />
              </div>
              <div className="modal-body">
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Name *</label>
                    <input className="form-control form-control-sm" value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Type</label>
                    <select className="form-select form-select-sm" value={form.artifact_type}
                      onChange={e => setForm({ ...form, artifact_type: e.target.value })}>
                      {ARTIFACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium">Description</label>
                  <textarea className="form-control form-control-sm" rows={2} value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="reqSession"
                        checked={form.required_for_session}
                        onChange={e => setForm({ ...form, required_for_session: e.target.checked })} />
                      <label className="form-check-label small" htmlFor="reqSession">Required for Session</label>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="reqBuild"
                        checked={form.required_for_build_unlock}
                        onChange={e => setForm({ ...form, required_for_build_unlock: e.target.checked })} />
                      <label className="form-check-label small" htmlFor="reqBuild">Required for Build</label>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="reqPresentation"
                        checked={form.required_for_presentation_unlock}
                        onChange={e => setForm({ ...form, required_for_presentation_unlock: e.target.checked })} />
                      <label className="form-check-label small" htmlFor="reqPresentation">Required for Presentation</label>
                    </div>
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Produces Variable Keys</label>
                    <input className="form-control form-control-sm" value={form.produces_variable_keys}
                      onChange={e => setForm({ ...form, produces_variable_keys: e.target.value })}
                      placeholder="key1, key2, key3" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Required Before</label>
                    <select className="form-select form-select-sm" value={form.required_before}
                      onChange={e => setForm({ ...form, required_before: e.target.value })}>
                      {REQUIRED_BEFORE_OPTIONS.map(o => <option key={o} value={o}>{o || 'None'}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Instruction Prompt</label>
                    <select className="form-select form-select-sm" value={form.instruction_prompt_id}
                      onChange={e => setForm({ ...form, instruction_prompt_id: e.target.value })}>
                      <option value="">None</option>
                      {prompts.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Linked Section</label>
                    <select className="form-select form-select-sm" value={form.lesson_id}
                      onChange={e => setForm({ ...form, lesson_id: e.target.value })}>
                      <option value="">None</option>
                      {lessons.map((l: any) => (
                        <option key={l.id} value={l.id}>M{l.moduleNumber}.{l.lesson_number}: {l.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Validation Rule (JSON)</label>
                    <input className="form-control form-control-sm" value={form.validation_rule}
                      onChange={e => setForm({ ...form, validation_rule: e.target.value })}
                      placeholder='{"type":"regex","config":"..."}' />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Skill Mapping (JSON)</label>
                    <input className="form-control form-control-sm" value={form.skill_mapping}
                      onChange={e => setForm({ ...form, skill_mapping: e.target.value })}
                      placeholder='[{"skill_id":"...","contribution":0.5}]' />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !form.name}>
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <th style={{ fontSize: 12 }}>Section</th>
                  <th style={{ fontSize: 12 }}></th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map(a => {
                  const linkedLesson = lessons.find((l: any) => l.id === a.lesson_id);
                  return (
                    <tr key={a.id}>
                      <td className="fw-medium">{a.name}</td>
                      <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{a.artifact_type}</span></td>
                      <td style={{ fontSize: 12 }}>
                        {a.required_for_session && <span className="badge bg-primary me-1" style={{ fontSize: 10 }}>Session</span>}
                        {a.required_for_build_unlock && <span className="badge bg-success me-1" style={{ fontSize: 10 }}>Build</span>}
                        {a.required_for_presentation_unlock && <span className="badge bg-warning text-dark me-1" style={{ fontSize: 10 }}>Presentation</span>}
                        {a.required_before && <span className="badge bg-info me-1" style={{ fontSize: 10 }}>Before: {a.required_before}</span>}
                        {!a.required_for_session && !a.required_for_build_unlock && !a.required_for_presentation_unlock && !a.required_before && <span className="text-muted">Optional</span>}
                      </td>
                      <td style={{ fontSize: 11 }}>{(a.produces_variable_keys || []).join(', ') || '-'}</td>
                      <td style={{ fontSize: 11 }}>{linkedLesson ? `M${linkedLesson.moduleNumber}.${linkedLesson.lesson_number}` : '-'}</td>
                      <td>
                        <div className="d-flex gap-1">
                          <button className="btn btn-sm btn-outline-primary" onClick={() => handleEdit(a)}>Edit</button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(a.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {artifacts.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-4">No artifact definitions for this session.</td></tr>
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
