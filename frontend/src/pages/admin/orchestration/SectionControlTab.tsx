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
    });
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
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setEditingLesson(null);
      fetchData();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
  );

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      {editingLesson && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">Edit Section: {editingLesson.title}</h6>
                <button className="btn-close" onClick={() => setEditingLesson(null)} />
              </div>
              <div className="modal-body">
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
