import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

interface TypeDefinition {
  id: string;
  slug: string;
  label: string;
  student_label: string;
  description: string;
  icon: string;
  badge_class: string;
  can_create_variables: boolean;
  can_create_artifacts: boolean;
  applicable_prompt_pairs: string[];
  default_prompts: Record<string, { system: string; user: string }>;
  settings_schema: Record<string, any>;
  is_system: boolean;
  is_active: boolean;
  display_order: number;
}

const BADGE_OPTIONS = [
  { value: 'bg-primary', label: 'Primary (Navy)' },
  { value: 'bg-info', label: 'Info (Blue)' },
  { value: 'bg-success', label: 'Success (Green)' },
  { value: 'bg-warning text-dark', label: 'Warning (Yellow)' },
  { value: 'bg-secondary', label: 'Secondary (Gray)' },
  { value: 'bg-danger', label: 'Danger (Red)' },
  { value: 'bg-dark', label: 'Dark' },
];

const ICON_OPTIONS = [
  'bi-lightbulb', 'bi-diagram-3', 'bi-code-square', 'bi-clipboard-check',
  'bi-question-circle', 'bi-book', 'bi-journal-text', 'bi-graph-up',
  'bi-chat-dots', 'bi-puzzle', 'bi-rocket', 'bi-shield-check',
  'bi-briefcase', 'bi-people', 'bi-bullseye', 'bi-bar-chart',
  'bi-gear', 'bi-stars', 'bi-trophy', 'bi-pencil-square',
  'bi-megaphone', 'bi-layers', 'bi-easel', 'bi-kanban',
];

const PROMPT_PAIR_OPTIONS = [
  { key: 'concept', label: 'Concept Prompt' },
  { key: 'build', label: 'Build Prompt' },
  { key: 'mentor', label: 'Mentor Prompt' },
  { key: 'kc', label: 'Knowledge Check Prompt' },
  { key: 'reflection', label: 'Reflection Prompt' },
];

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export default function CurriculumTypesTab() {
  const [types, setTypes] = useState<TypeDefinition[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit modal state
  const [editing, setEditing] = useState<Partial<TypeDefinition> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI generator modal state
  const [showGenerator, setShowGenerator] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<Partial<TypeDefinition> | null>(null);

  // Reverse engineer modal state
  const [showReverseEngineer, setShowReverseEngineer] = useState(false);
  const [reversePrompt, setReversePrompt] = useState('');
  const [reverseLoading, setReverseLoading] = useState(false);

  // Default prompts editing
  const [editingPromptPair, setEditingPromptPair] = useState<string | null>(null);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/orchestration/curriculum-types');
      setTypes(res.data.types || []);
      setUsageCounts(res.data.usageCounts || {});
    } catch {
      setError('Failed to load curriculum types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        await api.post('/api/admin/orchestration/curriculum-types', editing);
      } else {
        await api.put(`/api/admin/orchestration/curriculum-types/${editing.id}`, editing);
      }
      setEditing(null);
      fetchTypes();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this curriculum type?')) return;
    try {
      await api.delete(`/api/admin/orchestration/curriculum-types/${id}`);
      fetchTypes();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await api.post(`/api/admin/orchestration/curriculum-types/${id}/duplicate`);
      fetchTypes();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleReverseEngineer = async (id: string) => {
    setReverseLoading(true);
    setShowReverseEngineer(true);
    setReversePrompt('');
    try {
      const res = await api.post(`/api/admin/orchestration/curriculum-types/${id}/reverse-engineer`);
      setReversePrompt(res.data.prompt || '');
    } catch (err: any) {
      setReversePrompt(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setReverseLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!aiDescription.trim()) return;
    setAiGenerating(true);
    setAiResult(null);
    try {
      const res = await api.post('/api/admin/orchestration/curriculum-types/generate', {
        description: aiDescription,
      });
      setAiResult(res.data.generated || null);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveGenerated = async () => {
    if (!aiResult) return;
    setSaving(true);
    try {
      await api.post('/api/admin/orchestration/curriculum-types', aiResult);
      setShowGenerator(false);
      setAiResult(null);
      setAiDescription('');
      fetchTypes();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const startNew = () => {
    setEditing({
      label: '',
      student_label: '',
      slug: '',
      description: '',
      icon: 'bi-square',
      badge_class: 'bg-secondary',
      can_create_variables: false,
      can_create_artifacts: false,
      applicable_prompt_pairs: ['concept', 'mentor'],
      default_prompts: {},
    });
    setIsNew(true);
  };

  const startEdit = (t: TypeDefinition) => {
    setEditing({ ...t });
    setIsNew(false);
  };

  const updateField = (field: string, value: any) => {
    setEditing(prev => prev ? { ...prev, [field]: value } : prev);
    if (field === 'label' && isNew && editing && !editing.slug) {
      setEditing(prev => prev ? { ...prev, slug: slugify(value) } : prev);
    }
  };

  const togglePromptPair = (key: string) => {
    const current = editing?.applicable_prompt_pairs || [];
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    updateField('applicable_prompt_pairs', next);
  };

  const updateDefaultPrompt = (pairKey: string, field: 'system' | 'user', value: string) => {
    const current = editing?.default_prompts || {};
    const pair = current[pairKey] || { system: '', user: '' };
    updateField('default_prompts', {
      ...current,
      [pairKey]: { ...pair, [field]: value },
    });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-semibold mb-1">Curriculum Types</h5>
          <small className="text-muted">{types.length} types configured</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-primary" onClick={() => setShowGenerator(true)}>
            <i className="bi bi-stars me-1"></i>Generate with AI
          </button>
          <button className="btn btn-sm btn-primary" onClick={startNew}>
            <i className="bi bi-plus-lg me-1"></i>New Type
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show py-2" role="alert">
          <small>{error}</small>
          <button type="button" className="btn-close btn-close-sm" onClick={() => setError('')}></button>
        </div>
      )}

      {/* Type Cards Grid */}
      <div className="row g-3">
        {types.map(t => (
          <div key={t.id} className="col-12 col-lg-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className={`badge ${t.badge_class}`}>
                      <i className={`bi ${t.icon} me-1`}></i>{t.label}
                    </span>
                    {t.is_system && <span className="badge bg-light text-muted border">System</span>}
                  </div>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => startEdit(t)} title="Edit">
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => handleDuplicate(t.id)} title="Duplicate">
                      <i className="bi bi-copy"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => handleReverseEngineer(t.id)} title="Reverse Engineer">
                      <i className="bi bi-arrow-repeat"></i>
                    </button>
                    {!t.is_system && (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(t.id)} title="Delete">
                        <i className="bi bi-trash"></i>
                      </button>
                    )}
                  </div>
                </div>
                <div className="mb-2">
                  <small className="text-muted">Student sees: </small>
                  <small className="fw-medium">{t.student_label}</small>
                </div>
                <p className="small text-muted mb-2" style={{ lineHeight: '1.4' }}>
                  {t.description || 'No description'}
                </p>
                <div className="d-flex flex-wrap gap-2 mb-2">
                  {t.can_create_variables && (
                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">
                      <i className="bi bi-braces me-1"></i>Creates Variables
                    </span>
                  )}
                  {t.can_create_artifacts && (
                    <span className="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25">
                      <i className="bi bi-file-earmark me-1"></i>Creates Artifacts
                    </span>
                  )}
                  {(t.applicable_prompt_pairs || []).map(p => (
                    <span key={p} className="badge bg-light text-dark border">{p}</span>
                  ))}
                </div>
                <div className="small text-muted">
                  Used in {usageCounts[t.slug] || 0} mini-section(s)
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit/Create Modal */}
      {editing && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title fw-semibold">{isNew ? 'New Curriculum Type' : `Edit: ${editing.label}`}</h6>
                <button type="button" className="btn-close" onClick={() => setEditing(null)}></button>
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  {/* Label */}
                  <div className="col-6">
                    <label className="form-label small fw-medium">Label (Admin)</label>
                    <input className="form-control form-control-sm" value={editing.label || ''} onChange={e => updateField('label', e.target.value)} placeholder="e.g. Case Study Analysis" />
                  </div>
                  {/* Student Label */}
                  <div className="col-6">
                    <label className="form-label small fw-medium">Student Label</label>
                    <input className="form-control form-control-sm" value={editing.student_label || ''} onChange={e => updateField('student_label', e.target.value)} placeholder="e.g. Case Study" />
                  </div>
                  {/* Slug */}
                  <div className="col-6">
                    <label className="form-label small fw-medium">Slug</label>
                    <input className="form-control form-control-sm" value={editing.slug || ''} onChange={e => updateField('slug', e.target.value)} disabled={!isNew && editing.is_system} placeholder="auto-generated" />
                    <div className="form-text">Unique identifier. Cannot change on system types.</div>
                  </div>
                  {/* Icon */}
                  <div className="col-3">
                    <label className="form-label small fw-medium">Icon</label>
                    <select className="form-select form-select-sm" value={editing.icon || 'bi-square'} onChange={e => updateField('icon', e.target.value)}>
                      {ICON_OPTIONS.map(ic => (
                        <option key={ic} value={ic}>{ic.replace('bi-', '')}</option>
                      ))}
                    </select>
                  </div>
                  {/* Badge */}
                  <div className="col-3">
                    <label className="form-label small fw-medium">Badge Color</label>
                    <select className="form-select form-select-sm" value={editing.badge_class || 'bg-secondary'} onChange={e => updateField('badge_class', e.target.value)}>
                      {BADGE_OPTIONS.map(b => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Preview */}
                  <div className="col-12">
                    <label className="form-label small fw-medium">Preview</label>
                    <div>
                      <span className={`badge ${editing.badge_class || 'bg-secondary'}`}>
                        <i className={`bi ${editing.icon || 'bi-square'} me-1`}></i>
                        {editing.label || 'Type Name'}
                      </span>
                    </div>
                  </div>
                  {/* Description */}
                  <div className="col-12">
                    <label className="form-label small fw-medium">Description</label>
                    <textarea className="form-control form-control-sm" rows={3} value={editing.description || ''} onChange={e => updateField('description', e.target.value)} placeholder="Describe what this curriculum type does and its pedagogical purpose..." />
                  </div>
                  {/* Capabilities */}
                  <div className="col-12">
                    <label className="form-label small fw-medium">Capabilities</label>
                    <div className="d-flex gap-4">
                      <div className="form-check">
                        <input className="form-check-input" type="checkbox" id="canCreateVars" checked={editing.can_create_variables || false} onChange={e => updateField('can_create_variables', e.target.checked)} />
                        <label className="form-check-label small" htmlFor="canCreateVars">Can create variables</label>
                      </div>
                      <div className="form-check">
                        <input className="form-check-input" type="checkbox" id="canCreateArts" checked={editing.can_create_artifacts || false} onChange={e => updateField('can_create_artifacts', e.target.checked)} />
                        <label className="form-check-label small" htmlFor="canCreateArts">Can create artifacts</label>
                      </div>
                    </div>
                  </div>
                  {/* Prompt Pairs */}
                  <div className="col-12">
                    <label className="form-label small fw-medium">Applicable Prompt Pairs</label>
                    <div className="d-flex flex-wrap gap-2">
                      {PROMPT_PAIR_OPTIONS.map(pp => (
                        <button
                          key={pp.key}
                          className={`btn btn-sm ${(editing.applicable_prompt_pairs || []).includes(pp.key) ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => togglePromptPair(pp.key)}
                        >
                          {pp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Default Prompts */}
                  <div className="col-12">
                    <label className="form-label small fw-medium">Default Prompts (optional templates for new mini-sections)</label>
                    {(editing.applicable_prompt_pairs || []).map(pairKey => {
                      const pair = editing.default_prompts?.[pairKey];
                      const isExpanded = editingPromptPair === pairKey;
                      return (
                        <div key={pairKey} className="border rounded p-2 mb-2">
                          <div
                            className="d-flex justify-content-between align-items-center"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setEditingPromptPair(isExpanded ? null : pairKey)}
                          >
                            <span className="small fw-medium text-capitalize">{pairKey} Prompt</span>
                            <div className="d-flex align-items-center gap-2">
                              {pair?.system || pair?.user
                                ? <span className="badge bg-success bg-opacity-25 text-success">Configured</span>
                                : <span className="badge bg-light text-muted">Empty</span>
                              }
                              <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} small`}></i>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="mt-2">
                              <label className="form-label small text-muted">System Prompt</label>
                              <textarea className="form-control form-control-sm mb-2" rows={3} value={pair?.system || ''} onChange={e => updateDefaultPrompt(pairKey, 'system', e.target.value)} placeholder="System instructions for this prompt type..." />
                              <label className="form-label small text-muted">User Template</label>
                              <textarea className="form-control form-control-sm" rows={3} value={pair?.user || ''} onChange={e => updateDefaultPrompt(pairKey, 'user', e.target.value)} placeholder="User prompt template with {{variables}}..." />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !editing.label || !editing.student_label}>
                  {saving ? 'Saving...' : isNew ? 'Create Type' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Generator Modal */}
      {showGenerator && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title fw-semibold"><i className="bi bi-stars me-2"></i>Generate Curriculum Type with AI</h6>
                <button type="button" className="btn-close" onClick={() => { setShowGenerator(false); setAiResult(null); setAiDescription(''); }}></button>
              </div>
              <div className="modal-body">
                <label className="form-label small fw-medium">Describe the curriculum type you want to create</label>
                <textarea
                  className="form-control form-control-sm mb-3"
                  rows={4}
                  value={aiDescription}
                  onChange={e => setAiDescription(e.target.value)}
                  placeholder="e.g. A case study analysis component where students examine real-world AI implementation failures and successes. It should generate discussion prompts and reference the student's industry. It doesn't create variables or artifacts — it's purely analytical."
                />
                <button className="btn btn-sm btn-primary mb-3" onClick={handleGenerate} disabled={aiGenerating || !aiDescription.trim()}>
                  {aiGenerating ? (<><span className="spinner-border spinner-border-sm me-1"></span>Generating...</>) : 'Generate'}
                </button>

                {aiResult && (
                  <div className="border rounded p-3">
                    <h6 className="fw-semibold mb-3">Generated Configuration</h6>
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <small className="text-muted d-block">Label</small>
                        <input className="form-control form-control-sm" value={aiResult.label || ''} onChange={e => setAiResult(prev => prev ? { ...prev, label: e.target.value } : prev)} />
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Student Label</small>
                        <input className="form-control form-control-sm" value={aiResult.student_label || ''} onChange={e => setAiResult(prev => prev ? { ...prev, student_label: e.target.value } : prev)} />
                      </div>
                      <div className="col-12">
                        <small className="text-muted d-block">Description</small>
                        <textarea className="form-control form-control-sm" rows={2} value={aiResult.description || ''} onChange={e => setAiResult(prev => prev ? { ...prev, description: e.target.value } : prev)} />
                      </div>
                    </div>
                    <div className="mb-2">
                      <span className={`badge ${aiResult.badge_class || 'bg-secondary'} me-2`}>
                        <i className={`bi ${aiResult.icon || 'bi-square'} me-1`}></i>
                        {aiResult.label || 'Preview'}
                      </span>
                      {aiResult.can_create_variables && <span className="badge bg-success bg-opacity-10 text-success border me-1">Variables</span>}
                      {aiResult.can_create_artifacts && <span className="badge bg-warning bg-opacity-10 text-warning border me-1">Artifacts</span>}
                      {(aiResult.applicable_prompt_pairs || []).map((p: string) => (
                        <span key={p} className="badge bg-light text-dark border me-1">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => { setShowGenerator(false); setAiResult(null); }}>Cancel</button>
                {aiResult && (
                  <>
                    <button className="btn btn-sm btn-outline-primary" onClick={handleGenerate} disabled={aiGenerating}>Regenerate</button>
                    <button className="btn btn-sm btn-primary" onClick={handleSaveGenerated} disabled={saving}>
                      {saving ? 'Saving...' : 'Save as New Type'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Engineer Modal */}
      {showReverseEngineer && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title fw-semibold"><i className="bi bi-arrow-repeat me-2"></i>Reverse Engineered Prompt</h6>
                <button type="button" className="btn-close" onClick={() => setShowReverseEngineer(false)}></button>
              </div>
              <div className="modal-body">
                {reverseLoading ? (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                    <div className="small text-muted mt-2">Analyzing type configuration...</div>
                  </div>
                ) : (
                  <>
                    <label className="form-label small fw-medium">Natural Language Description</label>
                    <textarea className="form-control form-control-sm" rows={8} value={reversePrompt} onChange={e => setReversePrompt(e.target.value)} />
                    <div className="form-text">This is the prompt that would recreate this type. You can copy it, edit it, or use it to generate a new type.</div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowReverseEngineer(false)}>Close</button>
                <button className="btn btn-sm btn-outline-primary" onClick={() => { navigator.clipboard.writeText(reversePrompt); }}>
                  <i className="bi bi-clipboard me-1"></i>Copy
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => {
                  setShowReverseEngineer(false);
                  setAiDescription(reversePrompt);
                  setShowGenerator(true);
                }}>
                  Create New Type from This
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
