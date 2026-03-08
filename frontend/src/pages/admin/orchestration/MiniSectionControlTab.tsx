import React, { useEffect, useState, useCallback } from 'react';

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
interface SkillOption { id: string; skill_id: string; name: string; layer_id: string; domain_id: string }
interface VariableOption { id: string; variable_key: string; display_name: string; data_type: string; scope: string }
interface ArtifactOption { id: string; name: string; artifact_type: string }
interface DryRunResult { lessonTitle?: string; miniSectionCount?: number; typeBreakdown?: Record<string, number>; warnings?: string[]; requiredVariables?: string[]; linkedSkills?: string[] }

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

// --- Multi-Select Checkbox Component ---
function MultiSelect({ label, options, selected, onChange, renderLabel, colorClass }: {
  label: string;
  options: { value: string; label: string; sub?: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  renderLabel?: (opt: { value: string; label: string; sub?: string }) => React.ReactNode;
  colorClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <div>
      <label className={`form-label small fw-medium ${colorClass || ''}`}>{label}</label>
      <div
        className="form-control form-control-sm d-flex flex-wrap gap-1 align-items-center"
        style={{ minHeight: 32, cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        {selected.length === 0 && <span className="text-muted" style={{ fontSize: 11 }}>Click to select...</span>}
        {selected.map(v => {
          const opt = options.find(o => o.value === v);
          return <span key={v} className={`badge ${colorClass ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary'} border`} style={{ fontSize: 10 }}>{opt?.label || v}</span>;
        })}
      </div>
      {open && (
        <div className="border rounded mt-1 p-2" style={{ maxHeight: 180, overflowY: 'auto', fontSize: 12 }}>
          {options.length === 0 && <span className="text-muted">No options available</span>}
          {options.map(opt => (
            <div key={opt.value} className="form-check py-0">
              <input className="form-check-input" type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} id={`ms-${label}-${opt.value}`} />
              <label className="form-check-label" htmlFor={`ms-${label}-${opt.value}`}>
                {renderLabel ? renderLabel(opt) : <>{opt.label} {opt.sub && <span className="text-muted">({opt.sub})</span>}</>}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MiniSectionControlTab({ token, apiUrl, initialLessonId }: { token: string; apiUrl: string; initialLessonId?: string | null }) {
  // Core state
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [miniSections, setMiniSections] = useState<MiniSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<MiniSection> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reference data
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [variables, setVariables] = useState<VariableOption[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactOption[]>([]);

  // Right panel
  const [rightTab, setRightTab] = useState<'validation' | 'preview' | 'variables' | 'testai'>('validation');
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [validating, setValidating] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Load reference data on mount
  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/api/admin/orchestration/program/modules`, { headers }).then(r => r.json()),
      fetch(`${apiUrl}/api/admin/orchestration/prompts`, { headers }).then(r => r.json()),
      fetch(`${apiUrl}/api/admin/orchestration/variable-definitions`, { headers }).then(r => r.json()),
      fetch(`${apiUrl}/api/admin/orchestration/program/skills`, { headers }).then(r => r.json()),
    ]).then(([modData, promptData, varData, skillData]) => {
      setModules(Array.isArray(modData) ? modData : []);
      setPrompts(Array.isArray(promptData) ? promptData : []);
      setVariables(Array.isArray(varData) ? varData : []);
      // Skills come grouped — flatten
      const flatSkills: SkillOption[] = [];
      if (skillData?.skills) {
        for (const s of skillData.skills) {
          flatSkills.push({ id: s.id, skill_id: s.skill_id, name: s.name, layer_id: s.layer_id, domain_id: s.domain_id });
        }
      } else if (Array.isArray(skillData)) {
        for (const s of skillData) {
          flatSkills.push({ id: s.id, skill_id: s.skill_id, name: s.name, layer_id: s.layer_id, domain_id: s.domain_id });
        }
      }
      setSkills(flatSkills);
    }).catch(() => {});
  }, []);

  // Navigate from Sections tab
  useEffect(() => {
    if (initialLessonId && initialLessonId !== selectedLessonId) {
      selectLesson(initialLessonId);
    }
  }, [initialLessonId]);

  const fetchMiniSections = useCallback(async (lessonId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${lessonId}/mini-sections`, { headers });
      setMiniSections(await res.json());
    } catch { setError('Failed to load mini-sections'); }
    setLoading(false);
  }, [apiUrl, token]);

  const selectLesson = (id: string) => {
    setSelectedLessonId(id);
    setEditing(null);
    setDryRun(null);
    if (id) {
      fetchMiniSections(id);
      runValidation(id);
    } else {
      setMiniSections([]);
    }
  };

  const runValidation = async (lessonId: string) => {
    setValidating(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/dry-run/section/${lessonId}`, { headers });
      if (res.ok) setDryRun(await res.json());
    } catch {}
    setValidating(false);
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
      await fetchMiniSections(selectedLessonId);
      runValidation(selectedLessonId);
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this mini-section?')) return;
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/mini-sections/${id}`, { method: 'DELETE', headers });
      await fetchMiniSections(selectedLessonId);
      runValidation(selectedLessonId);
    } catch (err: any) { setError(err.message); }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const newOrder = [...miniSections];
    const [item] = newOrder.splice(index, 1);
    newOrder.splice(index + direction, 0, item);
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/lessons/${selectedLessonId}/mini-sections/reorder`, {
        method: 'PUT', headers, body: JSON.stringify({ ordered_ids: newOrder.map(ms => ms.id) }),
      });
      fetchMiniSections(selectedLessonId);
    } catch (err: any) { setError(err.message); }
  };

  // Derived data for multi-selects
  const skillOptions = skills.map(s => ({ value: s.skill_id, label: s.name, sub: s.domain_id }));
  const variableOptions = variables.map(v => ({ value: v.variable_key, label: v.display_name || v.variable_key, sub: v.scope }));
  const artifactOptions = artifacts.map(a => ({ value: a.id, label: a.name, sub: a.artifact_type }));

  // Get selected lesson info
  const selectedLesson = modules.flatMap(m => m.lessons || []).find(l => l.id === selectedLessonId);

  // Variable dependency analysis
  const createdVarsInLesson = miniSections
    .filter(ms => ms.mini_section_type === 'prompt_template' && ms.creates_variable_keys?.length)
    .flatMap(ms => (ms.creates_variable_keys || []).map(k => ({ key: k, title: ms.title, order: ms.mini_section_order })));
  const referencedVarsInLesson = miniSections
    .filter(ms => ms.associated_variable_keys?.length)
    .flatMap(ms => (ms.associated_variable_keys || []).map(k => ({ key: k, title: ms.title, order: ms.mini_section_order })));

  const editType = editing?.mini_section_type;
  const selectedTypeInfo = TYPE_OPTIONS.find(t => t.value === editType);

  // ===================== EDIT FORM (inline in left panel) =====================
  const renderEditForm = () => {
    if (!editing) return null;
    const kc = editing.knowledge_check_config || { enabled: false, question_count: 3, pass_score: 70 };
    return (
      <div className="card border-0 shadow-sm mt-2">
        <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
          <span className="fw-semibold small">{editing.id ? 'Edit Mini-Section' : 'New Mini-Section'}</span>
          <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setEditing(null)}>Cancel</button>
        </div>
        <div className="card-body py-2">
          {error && <div className="alert alert-danger small py-1 mb-2">{error}</div>}
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small fw-medium mb-0">Type <span className="text-danger">*</span></label>
              <select className="form-select form-select-sm" value={editType || ''} onChange={e => {
                const newType = e.target.value as MiniSectionType;
                const updates: Partial<MiniSection> = { ...editing, mini_section_type: newType };
                if (newType !== 'prompt_template') updates.creates_variable_keys = [];
                if (newType !== 'implementation_task') updates.creates_artifact_ids = [];
                if (newType !== 'knowledge_check') updates.knowledge_check_config = { enabled: false, question_count: 3, pass_score: 70 };
                setEditing(updates);
              }}>
                <option value="">Select type...</option>
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {selectedTypeInfo && <div className="text-muted" style={{ fontSize: 10 }}>{selectedTypeInfo.description}</div>}
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium mb-0">Title <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-medium mb-0">Weight</label>
              <input className="form-control form-control-sm" type="number" step="0.1" value={editing.completion_weight ?? 1} onChange={e => setEditing({ ...editing, completion_weight: parseFloat(e.target.value) })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium mb-0">Description</label>
              <textarea className="form-control form-control-sm" rows={2} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
            </div>

            {/* Prompt Selectors */}
            <div className="col-md-4">
              <label className="form-label small fw-medium mb-0">Concept Prompt</label>
              <select className="form-select form-select-sm" value={editing.concept_prompt_template_id || ''} onChange={e => setEditing({ ...editing, concept_prompt_template_id: e.target.value || undefined })}>
                <option value="">None</option>
                {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium mb-0">Build Prompt</label>
              <select className="form-select form-select-sm" value={editing.build_prompt_template_id || ''} onChange={e => setEditing({ ...editing, build_prompt_template_id: e.target.value || undefined })}>
                <option value="">None</option>
                {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium mb-0">Mentor Prompt</label>
              <select className="form-select form-select-sm" value={editing.mentor_prompt_template_id || ''} onChange={e => setEditing({ ...editing, mentor_prompt_template_id: e.target.value || undefined })}>
                <option value="">None</option>
                {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Multi-select: Skills */}
            <div className="col-md-6">
              <MultiSelect
                label="Associated Skills"
                options={skillOptions}
                selected={editing.associated_skill_ids || []}
                onChange={vals => setEditing({ ...editing, associated_skill_ids: vals })}
              />
            </div>

            {/* Multi-select: Variable Keys */}
            <div className="col-md-6">
              <MultiSelect
                label="Uses Variables"
                options={variableOptions}
                selected={editing.associated_variable_keys || []}
                onChange={vals => setEditing({ ...editing, associated_variable_keys: vals })}
              />
            </div>

            {/* Creates Variable Keys — prompt_template only */}
            {editType === 'prompt_template' && (
              <div className="col-12">
                <MultiSelect
                  label="Creates Variables"
                  options={variableOptions}
                  selected={editing.creates_variable_keys || []}
                  onChange={vals => setEditing({ ...editing, creates_variable_keys: vals })}
                  colorClass="text-success"
                />
              </div>
            )}

            {/* Creates Artifact IDs — implementation_task only */}
            {editType === 'implementation_task' && (
              <div className="col-12">
                <MultiSelect
                  label="Creates Artifacts"
                  options={artifactOptions}
                  selected={editing.creates_artifact_ids || []}
                  onChange={vals => setEditing({ ...editing, creates_artifact_ids: vals })}
                  colorClass="text-warning"
                />
              </div>
            )}

            {/* Knowledge Check config */}
            {editType === 'knowledge_check' && (
              <div className="col-12">
                <label className="form-label small fw-semibold mb-1">Knowledge Check Config</label>
                <div className="d-flex gap-3 align-items-center">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" checked={kc.enabled} onChange={e => setEditing({ ...editing, knowledge_check_config: { ...kc, enabled: e.target.checked } })} />
                    <label className="form-check-label small">Enabled</label>
                  </div>
                  <div>
                    <label className="form-label small mb-0">Questions</label>
                    <input className="form-control form-control-sm" type="number" style={{ width: 65 }} value={kc.question_count} onChange={e => setEditing({ ...editing, knowledge_check_config: { ...kc, question_count: parseInt(e.target.value) } })} />
                  </div>
                  <div>
                    <label className="form-label small mb-0">Pass %</label>
                    <input className="form-control form-control-sm" type="number" style={{ width: 65 }} value={kc.pass_score} onChange={e => setEditing({ ...editing, knowledge_check_config: { ...kc, pass_score: parseInt(e.target.value) } })} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !editing.title || !editType}>
              {saving ? 'Saving...' : editing.id ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===================== MINI-SECTION LIST (left panel) =====================
  const renderMiniSectionList = () => {
    if (loading) return <div className="text-center py-3"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;
    if (miniSections.length === 0) return (
      <div className="text-center py-4">
        <i className="bi bi-layers" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
        <p className="text-muted small mt-2 mb-0">No mini-sections. Click + Add to create.</p>
      </div>
    );
    return (
      <div className="d-flex flex-column gap-1">
        {miniSections.map((ms, i) => {
          const typeInfo = TYPE_BADGE_MAP[ms.mini_section_type] || { badge: 'bg-dark', label: ms.mini_section_type || '?' };
          const isSelected = editing?.id === ms.id;
          return (
            <div key={ms.id} className={`card border-0 ${isSelected ? 'border-primary border-2' : 'shadow-sm'}`} style={isSelected ? { borderStyle: 'solid', borderWidth: 2, borderColor: 'var(--color-primary-light, #2b6cb0)' } : {}}>
              <div className="card-body py-1 px-2">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-1" style={{ minWidth: 0 }}>
                    <div className="d-flex flex-column">
                      <button className="btn btn-link p-0 lh-1" disabled={i === 0} onClick={() => moveItem(i, -1)} style={{ fontSize: 10 }}><i className="bi bi-chevron-up"></i></button>
                      <button className="btn btn-link p-0 lh-1" disabled={i === miniSections.length - 1} onClick={() => moveItem(i, 1)} style={{ fontSize: 10 }}><i className="bi bi-chevron-down"></i></button>
                    </div>
                    <span className="badge bg-light text-dark border" style={{ fontSize: 10 }}>{ms.mini_section_order}</span>
                    <span className={`badge ${typeInfo.badge}`} style={{ fontSize: 9 }}>{typeInfo.label}</span>
                    <span className="fw-semibold text-truncate" style={{ fontSize: 12 }}>{ms.title}</span>
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-shrink-0">
                    {ms.creates_variable_keys?.length > 0 && <span className="badge bg-success-subtle text-success border border-success" style={{ fontSize: 8 }}>+{ms.creates_variable_keys.length}v</span>}
                    {ms.creates_artifact_ids?.length > 0 && <span className="badge bg-warning-subtle text-dark border border-warning" style={{ fontSize: 8 }}>+{ms.creates_artifact_ids.length}a</span>}
                    {ms.knowledge_check_config?.enabled && <span className="badge bg-secondary" style={{ fontSize: 8 }}>Q</span>}
                    <button className="btn btn-sm btn-outline-secondary py-0 px-1" onClick={() => setEditing(ms)} style={{ fontSize: 11 }}><i className="bi bi-pencil"></i></button>
                    <button className="btn btn-sm btn-outline-danger py-0 px-1" onClick={() => handleDelete(ms.id)} style={{ fontSize: 11 }}><i className="bi bi-trash"></i></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ===================== RIGHT PANEL TABS =====================
  const renderValidationTab = () => {
    if (validating) return <div className="text-center py-3"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Validating...</span></div></div>;
    if (!dryRun) return <p className="text-muted small">Select a section to see validation.</p>;
    const w = dryRun.warnings || [];
    return (
      <div>
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className={`badge ${w.length === 0 ? 'bg-success' : 'bg-warning text-dark'}`}>
            {w.length === 0 ? 'All Checks Passed' : `${w.length} Warning${w.length > 1 ? 's' : ''}`}
          </span>
          <button className="btn btn-sm btn-outline-primary py-0" onClick={() => runValidation(selectedLessonId)}>
            <i className="bi bi-arrow-clockwise me-1"></i>Re-validate
          </button>
        </div>
        {dryRun.typeBreakdown && (
          <div className="d-flex gap-1 mb-2 flex-wrap">
            {Object.entries(dryRun.typeBreakdown).map(([type, count]) => {
              const info = TYPE_BADGE_MAP[type] || { badge: 'bg-dark', label: type };
              return <span key={type} className={`badge ${info.badge}`} style={{ fontSize: 10 }}>{info.label}: {count}</span>;
            })}
          </div>
        )}
        {dryRun.requiredVariables?.length ? (
          <div className="mb-2">
            <span className="small fw-medium">Required Variables:</span>
            <div className="d-flex flex-wrap gap-1 mt-1">
              {dryRun.requiredVariables.map(v => <span key={v} className="badge bg-info-subtle text-info border" style={{ fontSize: 10 }}>{v}</span>)}
            </div>
          </div>
        ) : null}
        {dryRun.linkedSkills?.length ? (
          <div className="mb-2">
            <span className="small fw-medium">Linked Skills:</span>
            <div className="d-flex flex-wrap gap-1 mt-1">
              {dryRun.linkedSkills.map(s => <span key={s} className="badge bg-primary-subtle text-primary border" style={{ fontSize: 10 }}>{s}</span>)}
            </div>
          </div>
        ) : null}
        {w.length > 0 && (
          <div className="mt-2">
            {w.map((warn, i) => (
              <div key={i} className="alert alert-warning py-1 px-2 small mb-1" style={{ fontSize: 11 }}><i className="bi bi-exclamation-triangle me-1"></i>{warn}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderVariablesTab = () => {
    if (!selectedLessonId) return <p className="text-muted small">Select a section first.</p>;
    return (
      <div>
        <h6 className="small fw-semibold mb-2" style={{ color: 'var(--color-accent, #38a169)' }}>Variables Created by This Lesson</h6>
        {createdVarsInLesson.length === 0 ? (
          <p className="text-muted small">No variables created. Only prompt_template type can create variables.</p>
        ) : (
          <div className="d-flex flex-wrap gap-1 mb-3">
            {createdVarsInLesson.map((v, i) => {
              const def = variables.find(vd => vd.variable_key === v.key);
              return (
                <span key={i} className={`badge ${def ? 'bg-success-subtle text-success border-success' : 'bg-danger-subtle text-danger border-danger'} border`} style={{ fontSize: 10 }}>
                  {v.key} <span className="text-muted">(#{v.order} {v.title})</span>
                  {!def && <i className="bi bi-exclamation-triangle ms-1"></i>}
                </span>
              );
            })}
          </div>
        )}

        <h6 className="small fw-semibold mb-2" style={{ color: 'var(--color-primary-light, #2b6cb0)' }}>Variables Referenced by This Lesson</h6>
        {referencedVarsInLesson.length === 0 ? (
          <p className="text-muted small">No variables referenced.</p>
        ) : (
          <div className="d-flex flex-wrap gap-1 mb-3">
            {referencedVarsInLesson.map((v, i) => {
              const def = variables.find(vd => vd.variable_key === v.key);
              const createdLocally = createdVarsInLesson.find(c => c.key === v.key);
              const orderIssue = createdLocally && createdLocally.order > v.order;
              return (
                <span key={i} className={`badge ${orderIssue ? 'bg-danger-subtle text-danger border-danger' : def ? 'bg-info-subtle text-info border-info' : 'bg-warning-subtle text-warning border-warning'} border`} style={{ fontSize: 10 }}>
                  {v.key} <span className="text-muted">(#{v.order})</span>
                  {orderIssue && <i className="bi bi-exclamation-circle ms-1" title="Used before created"></i>}
                  {!def && !createdLocally && <i className="bi bi-question-circle ms-1" title="No definition found"></i>}
                </span>
              );
            })}
          </div>
        )}

        <h6 className="small fw-semibold mb-2">Dependency Flow</h6>
        <div style={{ fontSize: 11 }}>
          {miniSections.map(ms => {
            const creates = ms.creates_variable_keys || [];
            const uses = ms.associated_variable_keys || [];
            if (creates.length === 0 && uses.length === 0) return null;
            return (
              <div key={ms.id} className="mb-1 d-flex align-items-center gap-1">
                <span className="badge bg-light text-dark border" style={{ fontSize: 9 }}>#{ms.mini_section_order}</span>
                <span className="fw-medium">{ms.title}</span>
                {uses.length > 0 && <span className="text-info">reads: {uses.join(', ')}</span>}
                {creates.length > 0 && <span className="text-success">creates: {creates.join(', ')}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPreviewTab = () => (
    <div className="text-center py-4">
      <i className="bi bi-eye" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
      <p className="text-muted small mt-2">Live Preview — coming soon.</p>
      <p className="text-muted" style={{ fontSize: 11 }}>Will render student-facing V2 content from mini-section config.</p>
    </div>
  );

  const renderTestAITab = () => (
    <div className="text-center py-4">
      <i className="bi bi-robot" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
      <p className="text-muted small mt-2">Test AI Simulation — coming soon.</p>
      <p className="text-muted" style={{ fontSize: 11 }}>Will execute composite prompts with test profiles and render results.</p>
    </div>
  );

  // ===================== MAIN RENDER =====================
  return (
    <div>
      {/* Section selector bar */}
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
          <button className="btn btn-sm btn-primary" onClick={startCreate}>
            <i className="bi bi-plus-lg me-1"></i>Add
          </button>
        )}
      </div>

      {!selectedLessonId ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-cursor-fill" style={{ fontSize: 36, color: 'var(--color-text-light)' }}></i>
            <h6 className="fw-bold mt-3">Select a Section</h6>
            <p className="text-muted small">Choose a section above to configure its mini-sections, preview content, and run simulations.</p>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {/* LEFT PANEL — Mini-section list + edit form */}
          <div className="col-lg-5">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
                <span className="fw-semibold small">{selectedLesson?.title || 'Mini-Sections'}</span>
                <span className="badge bg-info" style={{ fontSize: 10 }}>{miniSections.length} items</span>
              </div>
              <div className="card-body py-2" style={{ maxHeight: editing ? 'none' : 400, overflowY: 'auto' }}>
                {renderMiniSectionList()}
              </div>
            </div>
            {renderEditForm()}
          </div>

          {/* RIGHT PANEL — Context tabs */}
          <div className="col-lg-7">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white py-1">
                <ul className="nav nav-tabs card-header-tabs" style={{ fontSize: 12 }}>
                  {[
                    { id: 'validation' as const, label: 'Validation', icon: 'bi-check-circle' },
                    { id: 'variables' as const, label: 'Variables', icon: 'bi-braces' },
                    { id: 'preview' as const, label: 'Preview', icon: 'bi-eye' },
                    { id: 'testai' as const, label: 'Test AI', icon: 'bi-robot' },
                  ].map(tab => (
                    <li key={tab.id} className="nav-item">
                      <button
                        className={`nav-link py-1 px-2 ${rightTab === tab.id ? 'active' : ''}`}
                        onClick={() => setRightTab(tab.id)}
                        style={{ fontSize: 12 }}
                      >
                        <i className={`bi ${tab.icon} me-1`}></i>{tab.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card-body" style={{ minHeight: 300, maxHeight: 500, overflowY: 'auto' }}>
                {rightTab === 'validation' && renderValidationTab()}
                {rightTab === 'variables' && renderVariablesTab()}
                {rightTab === 'preview' && renderPreviewTab()}
                {rightTab === 'testai' && renderTestAITab()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
