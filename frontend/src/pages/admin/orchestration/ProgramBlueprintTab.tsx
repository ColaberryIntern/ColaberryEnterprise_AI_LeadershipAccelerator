import React, { useEffect, useState } from 'react';

interface ProgramBlueprint {
  id: string;
  name: string;
  description: string;
  goals: string[];
  target_persona: string;
  learning_philosophy: string;
  core_competency_domains: { domain_id: string; name: string; weight: number }[];
  skill_genome_mapping: Record<string, string[]>;
  default_prompt_injection_rules: { system_context: string; tone: string; audience_level: string };
  is_active: boolean;
  version: number;
  created_at: string;
  modules?: { id: string; module_number: number; title: string; skill_area: string }[];
  cohorts?: { id: string; name: string; status: string }[];
}

const EMPTY_PROGRAM: Partial<ProgramBlueprint> = {
  name: '',
  description: '',
  goals: [],
  target_persona: '',
  learning_philosophy: '',
  core_competency_domains: [],
  default_prompt_injection_rules: { system_context: '', tone: '', audience_level: '' },
  is_active: true,
};

export default function ProgramBlueprintTab({ token, apiUrl }: { token: string; apiUrl: string }) {
  const [programs, setPrograms] = useState<ProgramBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ProgramBlueprint> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [goalsInput, setGoalsInput] = useState('');
  const [domainsInput, setDomainsInput] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/programs`, { headers });
      setPrograms(await res.json());
    } catch { setError('Failed to load programs'); }
    setLoading(false);
  };

  useEffect(() => { fetchPrograms(); }, []);

  const startCreate = () => {
    setEditing({ ...EMPTY_PROGRAM });
    setGoalsInput('');
    setDomainsInput('');
  };

  const startEdit = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/programs/${id}`, { headers });
      const p = await res.json();
      setEditing(p);
      setGoalsInput((p.goals || []).join('\n'));
      setDomainsInput((p.core_competency_domains || []).map((d: any) => `${d.name}:${d.weight}`).join('\n'));
    } catch { setError('Failed to load program'); }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const goals = goalsInput.split('\n').map(s => s.trim()).filter(Boolean);
      const core_competency_domains = domainsInput.split('\n').map(s => s.trim()).filter(Boolean).map((line, i) => {
        const [name, weight] = line.split(':');
        return { domain_id: `domain_${i + 1}`, name: name.trim(), weight: parseFloat(weight) || 1.0 };
      });

      const payload = { ...editing, goals, core_competency_domains };
      const isNew = !editing.id;
      const url = isNew
        ? `${apiUrl}/api/admin/orchestration/programs`
        : `${apiUrl}/api/admin/orchestration/programs/${editing.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      setEditing(null);
      fetchPrograms();
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this program blueprint?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/programs/${id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Delete failed');
      }
      fetchPrograms();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleClone = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/programs/${id}/clone`, { method: 'POST', headers });
      if (!res.ok) throw new Error('Clone failed');
      fetchPrograms();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // Edit/Create form
  if (editing) {
    const rules = editing.default_prompt_injection_rules || { system_context: '', tone: '', audience_level: '' };
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <span className="fw-semibold">{editing.id ? 'Edit Program Blueprint' : 'New Program Blueprint'}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
        </div>
        <div className="card-body">
          {error && <div className="alert alert-danger small py-2">{error}</div>}

          <div className="row g-3">
            <div className="col-md-8">
              <label className="form-label small fw-medium">Program Name</label>
              <input
                className="form-control form-control-sm"
                value={editing.name || ''}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Status</label>
              <div className="form-check form-switch mt-1">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={editing.is_active !== false}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
                />
                <label className="form-check-label small">{editing.is_active !== false ? 'Active' : 'Inactive'}</label>
              </div>
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium">Description</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={editing.description || ''}
                onChange={e => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium">Target Persona</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={editing.target_persona || ''}
                onChange={e => setEditing({ ...editing, target_persona: e.target.value })}
                placeholder="Describe the ideal learner for this program..."
              />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium">Learning Philosophy</label>
              <textarea
                className="form-control form-control-sm"
                rows={3}
                value={editing.learning_philosophy || ''}
                onChange={e => setEditing({ ...editing, learning_philosophy: e.target.value })}
                placeholder="Describe the pedagogical approach..."
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Program Goals (one per line)</label>
              <textarea
                className="form-control form-control-sm"
                rows={4}
                value={goalsInput}
                onChange={e => setGoalsInput(e.target.value)}
                placeholder="Build AI strategy capability&#10;Develop governance frameworks&#10;..."
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Competency Domains (name:weight, one per line)</label>
              <textarea
                className="form-control form-control-sm"
                rows={4}
                value={domainsInput}
                onChange={e => setDomainsInput(e.target.value)}
                placeholder="Strategy & Trust:1.0&#10;Governance:0.8&#10;..."
              />
            </div>

            <div className="col-12">
              <hr className="my-2" />
              <h6 className="small fw-semibold mb-2">Prompt Injection Rules</h6>
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium">System Context</label>
              <textarea
                className="form-control form-control-sm"
                rows={3}
                value={rules.system_context}
                onChange={e => setEditing({ ...editing, default_prompt_injection_rules: { ...rules, system_context: e.target.value } })}
                placeholder="You are an AI curriculum engine for an enterprise leadership accelerator..."
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Tone</label>
              <input
                className="form-control form-control-sm"
                value={rules.tone}
                onChange={e => setEditing({ ...editing, default_prompt_injection_rules: { ...rules, tone: e.target.value } })}
                placeholder="Professional, authoritative, practical"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Audience Level</label>
              <input
                className="form-control form-control-sm"
                value={rules.audience_level}
                onChange={e => setEditing({ ...editing, default_prompt_injection_rules: { ...rules, audience_level: e.target.value } })}
                placeholder="Senior executives, VP+, C-suite"
              />
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 mt-4">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !editing.name}>
              {saving ? 'Saving...' : editing.id ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="text-muted small mb-0">
          Program blueprints define the top-level structure, philosophy, and prompt injection rules for the curriculum.
        </p>
        <button className="btn btn-sm btn-primary" onClick={startCreate}>
          <i className="bi bi-plus-lg me-1"></i>New Program
        </button>
      </div>

      {error && <div className="alert alert-danger small py-2">{error}</div>}

      {programs.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-diagram-3" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
            <h6 className="fw-bold mt-3">No Program Blueprints</h6>
            <p className="text-muted small">Create a program blueprint to define your curriculum structure.</p>
            <button className="btn btn-sm btn-primary" onClick={startCreate}>Create First Program</button>
          </div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {programs.map(p => (
            <div key={p.id} className="card border-0 shadow-sm">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <h6 className="fw-bold mb-0">{p.name}</h6>
                      <span className={`badge ${p.is_active ? 'bg-success' : 'bg-secondary'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="badge bg-info">v{p.version}</span>
                    </div>
                    {p.description && <p className="text-muted small mb-2">{p.description}</p>}
                    <div className="d-flex gap-3 small text-muted">
                      {p.goals && <span><i className="bi bi-bullseye me-1"></i>{p.goals.length} goals</span>}
                      {p.core_competency_domains && <span><i className="bi bi-diagram-3 me-1"></i>{p.core_competency_domains.length} domains</span>}
                      <span><i className="bi bi-calendar me-1"></i>{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="d-flex gap-1">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      title="Details"
                      onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    >
                      <i className={`bi ${expandedId === p.id ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" title="Edit" onClick={() => startEdit(p.id)}>
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" title="Clone" onClick={() => handleClone(p.id)}>
                      <i className="bi bi-copy"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(p.id)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>

                {expandedId === p.id && (
                  <div className="mt-3 pt-3 border-top">
                    <div className="row g-3">
                      {p.target_persona && (
                        <div className="col-md-6">
                          <h6 className="small fw-semibold text-muted">Target Persona</h6>
                          <p className="small mb-0">{p.target_persona}</p>
                        </div>
                      )}
                      {p.learning_philosophy && (
                        <div className="col-md-6">
                          <h6 className="small fw-semibold text-muted">Learning Philosophy</h6>
                          <p className="small mb-0">{p.learning_philosophy}</p>
                        </div>
                      )}
                      {p.goals && p.goals.length > 0 && (
                        <div className="col-md-6">
                          <h6 className="small fw-semibold text-muted">Goals</h6>
                          <ul className="small mb-0 ps-3">
                            {p.goals.map((g, i) => <li key={i}>{g}</li>)}
                          </ul>
                        </div>
                      )}
                      {p.core_competency_domains && p.core_competency_domains.length > 0 && (
                        <div className="col-md-6">
                          <h6 className="small fw-semibold text-muted">Competency Domains</h6>
                          <div className="d-flex flex-wrap gap-1">
                            {p.core_competency_domains.map((d, i) => (
                              <span key={i} className="badge bg-light text-dark border">
                                {d.name} <small className="text-muted">({d.weight})</small>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {p.default_prompt_injection_rules && (
                        <div className="col-12">
                          <h6 className="small fw-semibold text-muted">Prompt Injection Rules</h6>
                          <div className="row g-2">
                            {p.default_prompt_injection_rules.tone && (
                              <div className="col-md-4">
                                <span className="text-muted small">Tone:</span>{' '}
                                <span className="small">{p.default_prompt_injection_rules.tone}</span>
                              </div>
                            )}
                            {p.default_prompt_injection_rules.audience_level && (
                              <div className="col-md-4">
                                <span className="text-muted small">Audience:</span>{' '}
                                <span className="small">{p.default_prompt_injection_rules.audience_level}</span>
                              </div>
                            )}
                            {p.default_prompt_injection_rules.system_context && (
                              <div className="col-12">
                                <span className="text-muted small">System Context:</span>
                                <pre className="small bg-light p-2 rounded mt-1 mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>
                                  {p.default_prompt_injection_rules.system_context}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
