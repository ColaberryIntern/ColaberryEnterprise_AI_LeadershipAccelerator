import React, { useEffect, useState } from 'react';

type MiniSectionType = 'executive_reality_check' | 'ai_strategy' | 'prompt_template' | 'implementation_task' | 'knowledge_check';

interface MiniSection {
  id: string;
  lesson_id: string;
  mini_section_type: MiniSectionType;
  mini_section_order: number;
  title: string;
  description: string;
  concept_prompt_template_id: string;
  build_prompt_template_id: string;
  mentor_prompt_template_id: string;
  associated_skill_ids: string[];
  associated_variable_keys: string[];
  associated_artifact_ids: string[];
  creates_variable_keys: string[];
  creates_artifact_ids: string[];
  knowledge_check_config: { enabled: boolean; question_count: number; pass_score: number } | null;
  completion_weight: number;
  is_active: boolean;
  conceptPrompt?: { id: string; name: string };
  buildPrompt?: { id: string; name: string };
  mentorPrompt?: { id: string; name: string };
}

interface Module { id: string; module_number: number; title: string; lessons: Lesson[] }
interface Lesson { id: string; lesson_number: number; title: string }
interface PromptOption { id: string; name: string }

const TYPE_OPTIONS: { value: MiniSectionType; label: string; badge: string; description: string }[] = [
  { value: 'executive_reality_check', label: 'Executive Reality Check', badge: 'bg-primary', description: 'Contextual analysis using student variables. Cannot create variables or artifacts.' },
  { value: 'ai_strategy', label: 'AI Strategy', badge: 'bg-info', description: 'Strategic AI frameworks and decision logic. Cannot create variables or artifacts.' },
  { value: 'prompt_template', label: 'Prompt Template', badge: 'bg-success', description: 'Structured output + variable creation engine. The ONLY type that can create variables.' },
  { value: 'implementation_task', label: 'Implementation Task', badge: 'bg-warning text-dark', description: 'Artifact production. The ONLY type that can create artifacts.' },
  { value: 'knowledge_check', label: 'Knowledge Check', badge: 'bg-secondary', description: 'Assessment mapped to skills. Influences gating and skill scores.' },
];

const TYPE_BADGE_MAP: Record<string, { badge: string; label: string }> = {
  executive_reality_check: { badge: 'bg-primary', label: 'Reality Check' },
  ai_strategy: { badge: 'bg-info', label: 'AI Strategy' },
  prompt_template: { badge: 'bg-success', label: 'Prompt' },
  implementation_task: { badge: 'bg-warning text-dark', label: 'Task' },
  knowledge_check: { badge: 'bg-secondary', label: 'Quiz' },
};

export default function MiniSectionControlTab({ token, apiUrl }: { token: string; apiUrl: string }) {
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [miniSections, setMiniSections] = useState<MiniSection[]>([]);
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<MiniSection> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/orchestration/program/modules`, { headers })
      .then(r => r.json()).then(data => setModules(data || [])).catch(() => {});
    fetch(`${apiUrl}/api/admin/orchestration/prompts`, { headers })
      .then(r => r.json()).then(data => setPrompts(data || [])).catch(() => {});
  }, []);

  const fetchMiniSections = async (lessonId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${lessonId}/mini-sections`, { headers });
      setMiniSections(await res.json());
    } catch { setError('Failed to load mini-sections'); }
    setLoading(false);
  };

  const selectLesson = (id: string) => {
    setSelectedLessonId(id);
    if (id) fetchMiniSections(id);
    else setMiniSections([]);
  };

  const startCreate = () => {
    setEditing({
      title: '', description: '', completion_weight: 1.0, is_active: true,
      mini_section_type: undefined as any,
      knowledge_check_config: { enabled: false, question_count: 3, pass_score: 70 },
      associated_skill_ids: [], associated_variable_keys: [], associated_artifact_ids: [],
      creates_variable_keys: [], creates_artifact_ids: [],
    });
  };

  const handleSave = async () => {
    if (!editing || !selectedLessonId) return;
    setSaving(true); setError('');
    try {
      const isNew = !editing.id;
      const url = isNew
        ? `${apiUrl}/api/admin/orchestration/lessons/${selectedLessonId}/mini-sections`
        : `${apiUrl}/api/admin/orchestration/mini-sections/${editing.id}`;
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers, body: JSON.stringify(editing) });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setEditing(null);
      fetchMiniSections(selectedLessonId);
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this mini-section?')) return;
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/mini-sections/${id}`, { method: 'DELETE', headers });
      fetchMiniSections(selectedLessonId);
    } catch (err: any) { setError(err.message); }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const newOrder = [...miniSections];
    const [item] = newOrder.splice(index, 1);
    newOrder.splice(index + direction, 0, item);
    const ordered_ids = newOrder.map(ms => ms.id);
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/lessons/${selectedLessonId}/mini-sections/reorder`, {
        method: 'PUT', headers, body: JSON.stringify({ ordered_ids }),
      });
      fetchMiniSections(selectedLessonId);
    } catch (err: any) { setError(err.message); }
  };

  const handleRebuild = async (lessonId: string) => {
    if (!window.confirm('Rebuild content for this section? This will regenerate all lesson content.')) return;
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/dry-run/section/${lessonId}`, { headers });
      if (!res.ok) throw new Error('Rebuild validation failed');
      const data = await res.json();
      if (data.warnings?.length) {
        alert(`Dry-run warnings:\n${data.warnings.join('\n')}`);
      } else {
        alert('Dry-run passed. Section is ready for content generation.');
      }
    } catch (err: any) { setError(err.message); }
  };

  const editType = editing?.mini_section_type;
  const selectedTypeInfo = TYPE_OPTIONS.find(t => t.value === editType);

  // Edit form
  if (editing) {
    const kc = editing.knowledge_check_config || { enabled: false, question_count: 3, pass_score: 70 };
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <span className="fw-semibold">{editing.id ? 'Edit Mini-Section' : 'New Mini-Section'}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
        </div>
        <div className="card-body">
          {error && <div className="alert alert-danger small py-2">{error}</div>}
          <div className="row g-3">
            {/* Type selector — required, first field */}
            <div className="col-md-6">
              <label className="form-label small fw-medium">Type <span className="text-danger">*</span></label>
              <select
                className="form-select form-select-sm"
                value={editType || ''}
                onChange={e => {
                  const newType = e.target.value as MiniSectionType;
                  const updates: Partial<MiniSection> = { ...editing, mini_section_type: newType };
                  // Clear type-specific fields when switching types
                  if (newType !== 'prompt_template') updates.creates_variable_keys = [];
                  if (newType !== 'implementation_task') updates.creates_artifact_ids = [];
                  if (newType !== 'knowledge_check') updates.knowledge_check_config = { enabled: false, question_count: 3, pass_score: 70 };
                  setEditing(updates);
                }}
              >
                <option value="">Select type...</option>
                {TYPE_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {selectedTypeInfo && (
                <div className="text-muted small mt-1" style={{ fontSize: 11 }}>{selectedTypeInfo.description}</div>
              )}
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Title <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-medium">Weight</label>
              <input className="form-control form-control-sm" type="number" step="0.1" value={editing.completion_weight ?? 1} onChange={e => setEditing({ ...editing, completion_weight: parseFloat(e.target.value) })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium">Description</label>
              <textarea className="form-control form-control-sm" rows={2} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Concept Prompt</label>
              <select className="form-select form-select-sm" value={editing.concept_prompt_template_id || ''} onChange={e => setEditing({ ...editing, concept_prompt_template_id: e.target.value || undefined })}>
                <option value="">None</option>
                {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Build Prompt</label>
              <select className="form-select form-select-sm" value={editing.build_prompt_template_id || ''} onChange={e => setEditing({ ...editing, build_prompt_template_id: e.target.value || undefined })}>
                <option value="">None</option>
                {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Mentor Prompt</label>
              <select className="form-select form-select-sm" value={editing.mentor_prompt_template_id || ''} onChange={e => setEditing({ ...editing, mentor_prompt_template_id: e.target.value || undefined })}>
                <option value="">None</option>
                {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Uses Variable Keys (comma-separated)</label>
              <input className="form-control form-control-sm" value={(editing.associated_variable_keys || []).join(', ')} onChange={e => setEditing({ ...editing, associated_variable_keys: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Skill IDs (comma-separated)</label>
              <input className="form-control form-control-sm" value={(editing.associated_skill_ids || []).join(', ')} onChange={e => setEditing({ ...editing, associated_skill_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            </div>

            {/* Creates Variable Keys — only for prompt_template */}
            {editType === 'prompt_template' && (
              <div className="col-12">
                <label className="form-label small fw-medium text-success">Creates Variable Keys (comma-separated)</label>
                <input
                  className="form-control form-control-sm border-success"
                  placeholder="e.g. company_ai_strategy, identified_risks"
                  value={(editing.creates_variable_keys || []).join(', ')}
                  onChange={e => setEditing({ ...editing, creates_variable_keys: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                />
                <div className="text-muted small mt-1" style={{ fontSize: 11 }}>Variables this mini-section will create. Must exist in Variable Definitions.</div>
              </div>
            )}

            {/* Creates Artifact IDs — only for implementation_task */}
            {editType === 'implementation_task' && (
              <div className="col-12">
                <label className="form-label small fw-medium text-warning">Creates Artifact IDs (comma-separated)</label>
                <input
                  className="form-control form-control-sm border-warning"
                  placeholder="Artifact definition UUIDs"
                  value={(editing.creates_artifact_ids || []).join(', ')}
                  onChange={e => setEditing({ ...editing, creates_artifact_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                />
                <div className="text-muted small mt-1" style={{ fontSize: 11 }}>Artifacts this mini-section will produce. Must exist in Artifact Definitions.</div>
              </div>
            )}

            {/* Knowledge Check config — only for knowledge_check */}
            {editType === 'knowledge_check' && (
              <div className="col-12">
                <h6 className="small fw-semibold mt-2">Knowledge Check Configuration</h6>
                <div className="d-flex gap-3 align-items-center">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" checked={kc.enabled} onChange={e => setEditing({ ...editing, knowledge_check_config: { ...kc, enabled: e.target.checked } })} />
                    <label className="form-check-label small">Enabled</label>
                  </div>
                  <div>
                    <label className="form-label small mb-0">Questions</label>
                    <input className="form-control form-control-sm" type="number" style={{ width: 70 }} value={kc.question_count} onChange={e => setEditing({ ...editing, knowledge_check_config: { ...kc, question_count: parseInt(e.target.value) } })} />
                  </div>
                  <div>
                    <label className="form-label small mb-0">Pass %</label>
                    <input className="form-control form-control-sm" type="number" style={{ width: 70 }} value={kc.pass_score} onChange={e => setEditing({ ...editing, knowledge_check_config: { ...kc, pass_score: parseInt(e.target.value) } })} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="d-flex justify-content-end gap-2 mt-4">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !editing.title || !editType}>{saving ? 'Saving...' : editing.id ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-muted small mb-3">Configure typed mini-sections: Executive Reality Check, AI Strategy, Prompt Template, Implementation Task, Knowledge Check.</p>

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <select className="form-select form-select-sm" style={{ maxWidth: 400 }} value={selectedLessonId} onChange={e => selectLesson(e.target.value)}>
          <option value="">Select a section...</option>
          {modules.map(m => (
            <optgroup key={m.id} label={`Module ${m.module_number}: ${m.title}`}>
              {(m.lessons || []).map((l: Lesson) => (
                <option key={l.id} value={l.id}>Section {l.lesson_number}: {l.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedLessonId && (
          <>
            <button className="btn btn-sm btn-primary" onClick={startCreate}>
              <i className="bi bi-plus-lg me-1"></i>Add Mini-Section
            </button>
            {miniSections.length > 0 && (
              <button className="btn btn-sm btn-outline-info" onClick={() => handleRebuild(selectedLessonId)}>
                <i className="bi bi-arrow-clockwise me-1"></i>Validate & Rebuild
              </button>
            )}
          </>
        )}
      </div>

      {error && <div className="alert alert-danger small py-2">{error}</div>}

      {loading ? (
        <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
      ) : selectedLessonId && miniSections.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-layers" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
            <h6 className="fw-bold mt-3">No Mini-Sections</h6>
            <p className="text-muted small">This section uses the standard V2 prompt path. Add typed mini-sections for granular control.</p>
          </div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {miniSections.map((ms, i) => {
            const typeInfo = TYPE_BADGE_MAP[ms.mini_section_type] || { badge: 'bg-dark', label: ms.mini_section_type || 'Untyped' };
            return (
              <div key={ms.id} className="card border-0 shadow-sm">
                <div className="card-body py-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <div className="d-flex flex-column gap-1">
                        <button className="btn btn-sm btn-link p-0" disabled={i === 0} onClick={() => moveItem(i, -1)}><i className="bi bi-chevron-up"></i></button>
                        <button className="btn btn-sm btn-link p-0" disabled={i === miniSections.length - 1} onClick={() => moveItem(i, 1)}><i className="bi bi-chevron-down"></i></button>
                      </div>
                      <span className="badge bg-light text-dark border" style={{ fontSize: 11 }}>{ms.mini_section_order}</span>
                      <span className={`badge ${typeInfo.badge}`} style={{ fontSize: 10 }}>{typeInfo.label}</span>
                      <div>
                        <span className="fw-semibold small">{ms.title}</span>
                        {ms.description && <p className="text-muted small mb-0" style={{ fontSize: 11 }}>{ms.description}</p>}
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-1 flex-wrap">
                      {ms.creates_variable_keys?.length > 0 && (
                        <span className="badge bg-success-subtle text-success border border-success" style={{ fontSize: 9 }}>
                          Creates: {ms.creates_variable_keys.join(', ')}
                        </span>
                      )}
                      {ms.creates_artifact_ids?.length > 0 && (
                        <span className="badge bg-warning-subtle text-warning border border-warning" style={{ fontSize: 9 }}>
                          Artifacts: {ms.creates_artifact_ids.length}
                        </span>
                      )}
                      {ms.conceptPrompt && <span className="badge bg-info-subtle text-info border" style={{ fontSize: 9 }}>C: {ms.conceptPrompt.name}</span>}
                      {ms.knowledge_check_config?.enabled && <span className="badge bg-warning text-dark" style={{ fontSize: 9 }}>Quiz: {ms.knowledge_check_config.question_count}q</span>}
                      <span className="badge bg-light text-dark border" style={{ fontSize: 9 }}>w:{ms.completion_weight}</span>
                      <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setEditing(ms)}><i className="bi bi-pencil"></i></button>
                      <button className="btn btn-sm btn-outline-danger py-0" onClick={() => handleDelete(ms.id)}><i className="bi bi-trash"></i></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
