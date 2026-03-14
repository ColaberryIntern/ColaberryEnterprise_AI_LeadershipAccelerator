import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; onNavigateToMiniSections?: (lessonId: string) => void; }

const SectionControlTab: React.FC<Props> = ({ token, apiUrl, onNavigateToMiniSections }) => {
  const [modules, setModules] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingLesson, setEditingLesson] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Reference data for section-level assignments
  const [allVariables, setAllVariables] = useState<any[]>([]);
  const [allArtifacts, setAllArtifacts] = useState<any[]>([]);
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [modRes, sessRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/orchestration/program/modules`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/orchestration/program/sessions`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!modRes.ok || !sessRes.ok) throw new Error('Failed to load data');
      const [modData, sessData] = await Promise.all([modRes.json(), sessRes.json()]);
      setModules(Array.isArray(modData) ? modData : []);
      setSessions(Array.isArray(sessData) ? sessData : []);
      if (Array.isArray(modData) && modData.length > 0 && !expandedModule) {
        setExpandedModule(modData[0].id);
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, apiUrl]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchReferenceData = useCallback(async () => {
    setRefLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [varRes, artRes, skillRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/orchestration/variable-definitions`, { headers }),
        fetch(`${apiUrl}/api/admin/orchestration/program/artifacts`, { headers }),
        fetch(`${apiUrl}/api/admin/orchestration/program/skills`, { headers }),
      ]);
      if (varRes.ok) setAllVariables(await varRes.json());
      if (artRes.ok) setAllArtifacts(await artRes.json());
      if (skillRes.ok) setAllSkills(await skillRes.json());
    } catch { /* silent */ }
    finally { setRefLoading(false); }
  }, [token, apiUrl]);

  const handleEdit = (lesson: any) => {
    setEditingLesson({
      id: lesson.id,
      title: lesson.title,
      learning_goal: lesson.learning_goal || '',
      mandatory: lesson.mandatory !== false,
      build_phase_flag: lesson.build_phase_flag || false,
      presentation_phase_flag: lesson.presentation_phase_flag || false,
      associated_session_id: lesson.associated_session_id || '',
      required_min_completion_before_session: lesson.required_min_completion_before_session || 0,
      sort_order: lesson.sort_order || 0,
      section_variable_keys: lesson.section_variable_keys || [],
      section_artifact_ids: lesson.section_artifact_ids || [],
      section_skill_ids: lesson.section_skill_ids || [],
    });
    fetchReferenceData();
  };

  const handleSave = async () => {
    if (!editingLesson) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${editingLesson.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learning_goal: editingLesson.learning_goal || null,
          mandatory: editingLesson.mandatory,
          build_phase_flag: editingLesson.build_phase_flag,
          presentation_phase_flag: editingLesson.presentation_phase_flag,
          associated_session_id: editingLesson.associated_session_id || null,
          required_min_completion_before_session: editingLesson.required_min_completion_before_session || 0,
          sort_order: editingLesson.sort_order || 0,
          section_variable_keys: editingLesson.section_variable_keys,
          section_artifact_ids: editingLesson.section_artifact_ids,
          section_skill_ids: editingLesson.section_skill_ids,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setEditingLesson(null);
      fetchData();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const toggleArrayItem = (field: string, value: string) => {
    if (!editingLesson) return;
    const arr: string[] = editingLesson[field] || [];
    const updated = arr.includes(value) ? arr.filter((v: string) => v !== value) : [...arr, value];
    setEditingLesson({ ...editingLesson, [field]: updated });
  };

  if (loading) return (
    <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
  );

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      {editingLesson && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">Edit Section: {editingLesson.title}</h6>
                <button className="btn-close" onClick={() => setEditingLesson(null)} />
              </div>
              <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <div className="mb-3">
                  <label className="form-label small fw-medium">Learning Goal</label>
                  <textarea className="form-control form-control-sm" rows={3}
                    value={editingLesson.learning_goal}
                    onChange={e => setEditingLesson({ ...editingLesson, learning_goal: e.target.value })}
                    placeholder="What should learners achieve in this section?" />
                </div>
                <div className="row mb-3">
                  <div className="col-md-4">
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="mandatory"
                        checked={editingLesson.mandatory}
                        onChange={e => setEditingLesson({ ...editingLesson, mandatory: e.target.checked })} />
                      <label className="form-check-label small" htmlFor="mandatory">Mandatory</label>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="buildPhase"
                        checked={editingLesson.build_phase_flag}
                        onChange={e => setEditingLesson({ ...editingLesson, build_phase_flag: e.target.checked })} />
                      <label className="form-check-label small" htmlFor="buildPhase">Build Phase</label>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="form-check">
                      <input type="checkbox" className="form-check-input" id="presentationPhase"
                        checked={editingLesson.presentation_phase_flag}
                        onChange={e => setEditingLesson({ ...editingLesson, presentation_phase_flag: e.target.checked })} />
                      <label className="form-check-label small" htmlFor="presentationPhase">Presentation Phase</label>
                    </div>
                  </div>
                </div>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Associated Session</label>
                    <select className="form-select form-select-sm"
                      value={editingLesson.associated_session_id}
                      onChange={e => setEditingLesson({ ...editingLesson, associated_session_id: e.target.value })}>
                      <option value="">None</option>
                      {sessions.map(s => (
                        <option key={s.id} value={s.id}>Session {s.session_number}: {s.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-medium">Min Completion %</label>
                    <input type="number" className="form-control form-control-sm" min={0} max={100}
                      value={editingLesson.required_min_completion_before_session}
                      onChange={e => setEditingLesson({ ...editingLesson, required_min_completion_before_session: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small fw-medium">Sort Order</label>
                    <input type="number" className="form-control form-control-sm" min={0}
                      value={editingLesson.sort_order}
                      onChange={e => setEditingLesson({ ...editingLesson, sort_order: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>

                <hr className="my-3" />

                {/* Section-Level Assignments */}
                <h6 className="fw-semibold small mb-3">
                  <i className="bi bi-diagram-3 me-1"></i>Section-Level Assignments
                  <span className="text-muted fw-normal ms-2" style={{ fontSize: 11 }}>
                    Inherited by all mini-sections in this section
                  </span>
                </h6>

                {refLoading ? (
                  <div className="text-center py-3">
                    <div className="spinner-border spinner-border-sm text-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  </div>
                ) : (
                  <div className="row g-3">
                    {/* Section Variables */}
                    <div className="col-12">
                      <div className="card border-0" style={{ background: 'rgba(128,90,213,0.04)', border: '1px solid rgba(128,90,213,0.15)' }}>
                        <div className="card-body py-2">
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-semibold small" style={{ color: '#553c9a' }}>
                              <i className="bi bi-braces me-1"></i>Variables
                              <span className="badge ms-2" style={{ fontSize: 9, background: 'rgba(128,90,213,0.15)', color: '#553c9a' }}>
                                {(editingLesson.section_variable_keys || []).length} assigned
                              </span>
                            </span>
                          </div>
                          <p className="text-muted mb-2" style={{ fontSize: 11 }}>
                            Variables assigned here are available to all mini-sections in this section. They appear as purple chips in the prompt editor.
                          </p>
                          <div className="d-flex flex-wrap gap-1">
                            {allVariables.map((v: any) => {
                              const key = v.variable_key || v.key;
                              const selected = (editingLesson.section_variable_keys || []).includes(key);
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className="btn btn-sm py-0 px-2"
                                  style={{
                                    fontSize: 10,
                                    background: selected ? 'rgba(128,90,213,0.2)' : 'transparent',
                                    color: selected ? '#553c9a' : 'var(--color-text-light)',
                                    border: `1px solid ${selected ? 'rgba(128,90,213,0.4)' : 'var(--color-border)'}`,
                                    borderRadius: 4,
                                  }}
                                  onClick={() => toggleArrayItem('section_variable_keys', key)}
                                >
                                  {selected && <i className="bi bi-check-lg me-1"></i>}
                                  {key}
                                </button>
                              );
                            })}
                            {allVariables.length === 0 && (
                              <span className="text-muted" style={{ fontSize: 11 }}>No variable definitions found.</span>
                            )}
                          </div>
                          {/* Auto-injected section variables info */}
                          <div className="mt-2 d-flex flex-wrap gap-1">
                            <span className="text-muted" style={{ fontSize: 9 }}>Auto-injected:</span>
                            {['section_title', 'section_description', 'section_learning_goal'].map(k => (
                              <span key={k} className="badge" style={{ fontSize: 9, background: 'rgba(128,90,213,0.12)', color: '#553c9a' }}>
                                {`{{${k}}}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section Artifacts */}
                    <div className="col-md-6">
                      <div className="card border-0" style={{ background: 'var(--color-bg-alt, #f7fafc)' }}>
                        <div className="card-body py-2">
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-semibold small">
                              <i className="bi bi-file-earmark-code me-1"></i>Artifacts
                              <span className="badge bg-info ms-2" style={{ fontSize: 9 }}>
                                {(editingLesson.section_artifact_ids || []).length} assigned
                              </span>
                            </span>
                          </div>
                          <p className="text-muted mb-2" style={{ fontSize: 11 }}>
                            Artifacts assigned here apply to the Implementation Task in this section.
                          </p>
                          <div className="d-flex flex-wrap gap-1">
                            {allArtifacts.map((a: any) => {
                              const selected = (editingLesson.section_artifact_ids || []).includes(a.id);
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  className="btn btn-sm py-0 px-2"
                                  style={{
                                    fontSize: 10,
                                    background: selected ? 'rgba(56,161,105,0.15)' : 'transparent',
                                    color: selected ? '#276749' : 'var(--color-text-light)',
                                    border: `1px solid ${selected ? 'rgba(56,161,105,0.3)' : 'var(--color-border)'}`,
                                    borderRadius: 4,
                                  }}
                                  onClick={() => toggleArrayItem('section_artifact_ids', a.id)}
                                >
                                  {selected && <i className="bi bi-check-lg me-1"></i>}
                                  {a.name}
                                </button>
                              );
                            })}
                            {allArtifacts.length === 0 && (
                              <span className="text-muted" style={{ fontSize: 11 }}>No artifact definitions found.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section Skills */}
                    <div className="col-md-6">
                      <div className="card border-0" style={{ background: 'var(--color-bg-alt, #f7fafc)' }}>
                        <div className="card-body py-2">
                          <div className="d-flex align-items-center justify-content-between mb-2">
                            <span className="fw-semibold small">
                              <i className="bi bi-mortarboard me-1"></i>Skills
                              <span className="badge bg-info ms-2" style={{ fontSize: 9 }}>
                                {(editingLesson.section_skill_ids || []).length} assigned
                              </span>
                            </span>
                          </div>
                          <p className="text-muted mb-2" style={{ fontSize: 11 }}>
                            Skills assigned here map to all mini-sections in this section.
                          </p>
                          <div className="d-flex flex-wrap gap-1">
                            {allSkills.map((s: any) => {
                              const selected = (editingLesson.section_skill_ids || []).includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  className="btn btn-sm py-0 px-2"
                                  style={{
                                    fontSize: 10,
                                    background: selected ? 'rgba(43,108,176,0.15)' : 'transparent',
                                    color: selected ? '#2b6cb0' : 'var(--color-text-light)',
                                    border: `1px solid ${selected ? 'rgba(43,108,176,0.3)' : 'var(--color-border)'}`,
                                    borderRadius: 4,
                                  }}
                                  onClick={() => toggleArrayItem('section_skill_ids', s.id)}
                                >
                                  {selected && <i className="bi bi-check-lg me-1"></i>}
                                  {s.name}
                                </button>
                              );
                            })}
                            {allSkills.length === 0 && (
                              <span className="text-muted" style={{ fontSize: 11 }}>No skill definitions found.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingLesson(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modules.map(mod => (
        <div key={mod.id} className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center"
            style={{ cursor: 'pointer' }}
            onClick={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}>
            <span>Module {mod.module_number}: {mod.title}</span>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-info" style={{ fontSize: 11 }}>{(mod.lessons || []).length} sections</span>
              <span style={{ fontSize: 12 }}>{expandedModule === mod.id ? '\u25B2' : '\u25BC'}</span>
            </div>
          </div>
          {expandedModule === mod.id && (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
                <thead className="table-light">
                  <tr>
                    <th style={{ fontSize: 12 }}>#</th>
                    <th style={{ fontSize: 12 }}>Title</th>
                    <th style={{ fontSize: 12 }}>Learning Goal</th>
                    <th style={{ fontSize: 12 }}>Flags</th>
                    <th style={{ fontSize: 12 }}>Session</th>
                    <th style={{ fontSize: 12 }}>Min %</th>
                    <th style={{ fontSize: 12 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(mod.lessons || [])
                    .sort((a: any, b: any) => (a.lesson_number || 0) - (b.lesson_number || 0))
                    .map((lesson: any) => {
                      const assocSession = sessions.find((s: any) => s.id === lesson.associated_session_id);
                      const varCount = (lesson.section_variable_keys || []).length;
                      const artCount = (lesson.section_artifact_ids || []).length;
                      const skillCount = (lesson.section_skill_ids || []).length;
                      return (
                        <tr key={lesson.id}>
                          <td>{lesson.lesson_number}</td>
                          <td className="fw-medium" style={{ maxWidth: 200, cursor: 'pointer', color: 'var(--color-primary-light, #2b6cb0)' }}
                            onClick={() => onNavigateToMiniSections?.(lesson.id)}
                            title="View mini-sections">{lesson.title}</td>
                          <td style={{ maxWidth: 250, fontSize: 12 }}>
                            {lesson.learning_goal
                              ? (lesson.learning_goal.length > 80 ? lesson.learning_goal.substring(0, 80) + '...' : lesson.learning_goal)
                              : <span className="text-muted">&mdash;</span>}
                          </td>
                          <td>
                            {lesson.mandatory !== false && <span className="badge bg-primary me-1" style={{ fontSize: 10 }}>Required</span>}
                            {lesson.build_phase_flag && <span className="badge bg-success me-1" style={{ fontSize: 10 }}>Build</span>}
                            {lesson.presentation_phase_flag && <span className="badge bg-warning text-dark me-1" style={{ fontSize: 10 }}>Present</span>}
                            {(varCount + artCount + skillCount) > 0 && (
                              <span className="badge me-1" style={{ fontSize: 10, background: 'rgba(128,90,213,0.15)', color: '#553c9a' }}>
                                {varCount}V {artCount}A {skillCount}S
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {assocSession ? `S${assocSession.session_number}` : <span className="text-muted">&mdash;</span>}
                          </td>
                          <td style={{ fontSize: 12 }}>{lesson.required_min_completion_before_session || <span className="text-muted">&mdash;</span>}</td>
                          <td>
                            <button className="btn btn-sm btn-outline-primary" onClick={() => handleEdit(lesson)}>Edit</button>
                          </td>
                        </tr>
                      );
                    })}
                  {(mod.lessons || []).length === 0 && (
                    <tr><td colSpan={7} className="text-center text-muted py-3">No sections in this module.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SectionControlTab;
