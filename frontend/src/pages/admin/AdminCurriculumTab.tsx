import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

interface CurriculumModule {
  id: string;
  module_number: number;
  title: string;
  description: string;
  skill_area: string;
  total_lessons: number;
  lessons: CurriculumLesson[];
}

interface CurriculumLesson {
  id: string;
  lesson_number: number;
  title: string;
  lesson_type: string;
  estimated_minutes: number;
  requires_structured_input: boolean;
}

interface ParticipantProgress {
  enrollment_id: string;
  overall_progress: number;
  total_lessons: number;
  completed_lessons: number;
  modules: Array<{
    id: string;
    module_number: number;
    title: string;
    skill_area: string;
    total_lessons: number;
    completed_lessons: number;
    status: string;
    lessons: Array<{
      id: string;
      lesson_number: number;
      title: string;
      lesson_type: string;
      status: string;
      quiz_score: number | null;
      completed_at: string | null;
    }>;
  }>;
}

interface LabResponse {
  lesson_id: string;
  lesson_title: string;
  lesson_type: string;
  structured_responses: Record<string, any>;
  completed_at: string | null;
}

interface EnrollmentInfo {
  id: string;
  full_name: string;
  email: string;
  company: string;
}

const SKILL_COLORS: Record<string, string> = {
  strategy_trust: '#6366f1',
  governance: '#ef4444',
  requirements: '#3b82f6',
  build_discipline: '#8b5cf6',
  executive_authority: '#10b981',
};

const LESSON_TYPE_BADGES: Record<string, { bg: string; label: string }> = {
  concept: { bg: '#e0e7ff', label: 'Concept' },
  lab: { bg: '#f3e8ff', label: 'Lab' },
  assessment: { bg: '#fef3c7', label: 'Assessment' },
  reflection: { bg: '#fef9c3', label: 'Reflection' },
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  locked: { bg: '#f1f5f9', color: '#94a3b8' },
  available: { bg: '#dbeafe', color: '#2563eb' },
  in_progress: { bg: '#fef3c7', color: '#d97706' },
  completed: { bg: '#dcfce7', color: '#16a34a' },
};

interface Props {
  cohortId: string;
  enrollments: EnrollmentInfo[];
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function AdminCurriculumTab({ cohortId, enrollments, showToast }: Props) {
  const [modules, setModules] = useState<CurriculumModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [progress, setProgress] = useState<ParticipantProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [labResponses, setLabResponses] = useState<LabResponse[]>([]);
  const [labLoading, setLabLoading] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [viewingLab, setViewingLab] = useState<LabResponse | null>(null);
  const [overrideModal, setOverrideModal] = useState<{ lessonId: string; lessonTitle: string; currentStatus: string } | null>(null);
  const [overrideStatus, setOverrideStatus] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const loadModules = useCallback(async () => {
    if (!cohortId) return;
    setModulesLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/cohorts/${cohortId}/curriculum/modules`);
      setModules(res.data.modules || []);
    } catch { showToast('Failed to load curriculum modules', 'error'); }
    setModulesLoading(false);
  }, [cohortId, showToast]);

  useEffect(() => { loadModules(); }, [loadModules]);

  const loadParticipantProgress = async (enrollmentId: string) => {
    if (!enrollmentId) { setProgress(null); setLabResponses([]); return; }
    setProgressLoading(true);
    setLabLoading(true);
    try {
      const [progRes, labRes] = await Promise.all([
        api.get(`/api/admin/accelerator/enrollments/${enrollmentId}/curriculum-progress`),
        api.get(`/api/admin/accelerator/enrollments/${enrollmentId}/lab-responses`),
      ]);
      setProgress(progRes.data);
      setLabResponses(labRes.data.responses || []);
    } catch { showToast('Failed to load participant data', 'error'); }
    setProgressLoading(false);
    setLabLoading(false);
  };

  const handleOverride = async () => {
    if (!overrideModal || !selectedEnrollmentId || !overrideStatus) return;
    try {
      await api.put(`/api/admin/accelerator/curriculum/lessons/${overrideModal.lessonId}/override`, {
        enrollment_id: selectedEnrollmentId,
        status: overrideStatus,
      });
      showToast('Lesson status updated', 'success');
      setOverrideModal(null);
      loadParticipantProgress(selectedEnrollmentId);
    } catch { showToast('Failed to override status', 'error'); }
  };

  const handleExport = async () => {
    if (!selectedEnrollmentId) return;
    setExportLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/enrollments/${selectedEnrollmentId}/project-architect`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const participant = enrollments.find(e => e.id === selectedEnrollmentId);
      a.href = url;
      a.download = `project-architect-${participant?.full_name?.replace(/\s+/g, '-').toLowerCase() || selectedEnrollmentId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export downloaded', 'success');
    } catch { showToast('Failed to export data', 'error'); }
    setExportLoading(false);
  };

  return (
    <div className="row g-3">
      {/* Left Column: Module Structure */}
      <div className="col-lg-5">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white border-bottom d-flex align-items-center justify-content-between" style={{ padding: '12px 16px' }}>
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
              <i className="bi bi-mortarboard me-2"></i>Curriculum Structure
            </span>
            <span className="badge bg-secondary">{modules.length} modules</span>
          </div>
          <div className="card-body p-0">
            {modulesLoading ? (
              <div className="text-center py-4">
                <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>
              </div>
            ) : modules.length === 0 ? (
              <div className="text-center text-muted py-4">No curriculum modules found for this cohort</div>
            ) : (
              <div className="list-group list-group-flush">
                {modules.map((mod) => {
                  const color = SKILL_COLORS[mod.skill_area] || '#6366f1';
                  const isExpanded = expandedModule === mod.id;
                  return (
                    <div key={mod.id}>
                      <button
                        className="list-group-item list-group-item-action border-0 d-flex align-items-center gap-2 py-2 px-3"
                        onClick={() => setExpandedModule(isExpanded ? null : mod.id)}
                        style={{ borderLeft: `3px solid ${color}` }}
                      >
                        <div
                          className="d-flex align-items-center justify-content-center rounded flex-shrink-0"
                          style={{ width: 28, height: 28, background: `${color}15`, fontSize: 12, fontWeight: 700, color }}
                        >
                          {mod.module_number}
                        </div>
                        <div className="flex-grow-1 text-start">
                          <div className="small fw-semibold">{mod.title}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {mod.total_lessons} lessons · {mod.skill_area.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} small`} style={{ color: '#94a3b8' }}></i>
                      </button>
                      {isExpanded && mod.lessons && (
                        <div style={{ background: '#f8fafc' }}>
                          {mod.lessons
                            .sort((a, b) => a.lesson_number - b.lesson_number)
                            .map((lesson) => {
                              const typeBadge = LESSON_TYPE_BADGES[lesson.lesson_type] || { bg: '#f1f5f9', label: lesson.lesson_type };
                              return (
                                <div key={lesson.id} className="d-flex align-items-center gap-2 py-2 px-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <span className="small text-muted" style={{ width: 20 }}>{lesson.lesson_number}.</span>
                                  <span className="small flex-grow-1">{lesson.title}</span>
                                  <span className="badge" style={{ background: typeBadge.bg, color: '#475569', fontSize: 10 }}>
                                    {typeBadge.label}
                                  </span>
                                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{lesson.estimated_minutes}m</span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Participant Progress & Lab Responses */}
      <div className="col-lg-7">
        {/* Participant Selector */}
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body py-2 px-3">
            <div className="d-flex gap-2 align-items-center">
              <label className="form-label small fw-medium mb-0 flex-shrink-0">Participant:</label>
              <select
                className="form-select form-select-sm"
                value={selectedEnrollmentId}
                onChange={(e) => {
                  setSelectedEnrollmentId(e.target.value);
                  loadParticipantProgress(e.target.value);
                }}
              >
                <option value="">Select participant...</option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name} — {e.company}</option>
                ))}
              </select>
              {selectedEnrollmentId && (
                <button
                  className="btn btn-sm btn-outline-primary flex-shrink-0"
                  onClick={handleExport}
                  disabled={exportLoading}
                  title="Export Project Architect data"
                >
                  <i className="bi bi-download me-1"></i>
                  {exportLoading ? 'Exporting...' : 'Export'}
                </button>
              )}
            </div>
          </div>
        </div>

        {!selectedEnrollmentId ? (
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center text-muted py-5">
              <i className="bi bi-person-circle" style={{ fontSize: 32, opacity: 0.3 }}></i>
              <p className="small mt-2 mb-0">Select a participant to view their curriculum progress</p>
            </div>
          </div>
        ) : progressLoading ? (
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-4">
              <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>
            </div>
          </div>
        ) : progress ? (
          <>
            {/* Progress Overview */}
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
                    <i className="bi bi-graph-up me-2"></i>Curriculum Progress
                  </span>
                  <span className="fw-bold" style={{ color: '#6366f1' }}>{progress.overall_progress}%</span>
                </div>
              </div>
              <div className="card-body">
                <div className="progress mb-3" style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
                  <div className="progress-bar" style={{ width: `${progress.overall_progress}%`, background: '#6366f1', borderRadius: 4 }}></div>
                </div>
                <div className="small text-muted mb-3">{progress.completed_lessons}/{progress.total_lessons} lessons completed</div>

                {/* Module Progress */}
                {progress.modules.map((mod) => {
                  const color = SKILL_COLORS[mod.skill_area] || '#6366f1';
                  const pct = mod.total_lessons > 0 ? Math.round((mod.completed_lessons / mod.total_lessons) * 100) : 0;
                  return (
                    <div key={mod.id} className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="small fw-medium">
                          M{mod.module_number}: {mod.title}
                        </span>
                        <span className="small" style={{ color: pct === 100 ? '#10b981' : '#94a3b8' }}>
                          {mod.completed_lessons}/{mod.total_lessons} ({pct}%)
                        </span>
                      </div>
                      <div className="progress mb-1" style={{ height: 4, background: '#f1f5f9' }}>
                        <div className="progress-bar" style={{ width: `${pct}%`, background: color }}></div>
                      </div>
                      {/* Lesson statuses */}
                      <div className="d-flex flex-wrap gap-1 mt-1">
                        {mod.lessons.map((lesson) => {
                          const st = STATUS_STYLES[lesson.status] || STATUS_STYLES.locked;
                          return (
                            <div
                              key={lesson.id}
                              className="d-flex align-items-center gap-1 px-2 py-1 rounded"
                              style={{ background: st.bg, fontSize: 10, cursor: 'pointer' }}
                              title={`${lesson.title} — ${lesson.status}${lesson.quiz_score != null ? ` (${lesson.quiz_score}%)` : ''}`}
                              onClick={() => {
                                setOverrideModal({ lessonId: lesson.id, lessonTitle: lesson.title, currentStatus: lesson.status });
                                setOverrideStatus(lesson.status);
                              }}
                            >
                              <span style={{ color: st.color, fontWeight: 600 }}>{lesson.lesson_number}</span>
                              <span style={{ color: st.color }}>{lesson.status === 'completed' ? '✓' : lesson.status === 'in_progress' ? '…' : lesson.status === 'available' ? '○' : '🔒'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lab Responses */}
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white border-bottom" style={{ padding: '12px 16px' }}>
                <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
                  <i className="bi bi-journal-code me-2"></i>Lab Responses ({labResponses.length})
                </span>
              </div>
              <div className="card-body p-0">
                {labLoading ? (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div>
                  </div>
                ) : labResponses.length === 0 ? (
                  <div className="text-center text-muted py-4 small">No lab responses submitted yet</div>
                ) : (
                  <div className="list-group list-group-flush">
                    {labResponses.map((lab, i) => (
                      <button
                        key={i}
                        className="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 px-3"
                        onClick={() => setViewingLab(lab)}
                      >
                        <div>
                          <div className="small fw-medium">{lab.lesson_title}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {lab.lesson_type} · {lab.completed_at ? new Date(lab.completed_at).toLocaleDateString() : 'In progress'}
                          </div>
                        </div>
                        <i className="bi bi-chevron-right small text-muted"></i>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center text-muted py-4 small">
              No curriculum data found for this participant
            </div>
          </div>
        )}
      </div>

      {/* Lab Response Detail Modal */}
      {viewingLab && (
        <>
          <div className="modal-backdrop show" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <div className="modal show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title h6">{viewingLab.lesson_title}</h5>
                  <button type="button" className="btn-close" onClick={() => setViewingLab(null)} />
                </div>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {viewingLab.structured_responses && Object.keys(viewingLab.structured_responses).length > 0 ? (
                    <div>
                      {Object.entries(viewingLab.structured_responses).map(([key, value]) => (
                        <div key={key} className="mb-3">
                          <label className="form-label small fw-semibold text-capitalize" style={{ color: '#475569' }}>
                            {key.replace(/_/g, ' ')}
                          </label>
                          <div
                            className="form-control form-control-sm"
                            style={{ background: '#f8fafc', minHeight: 40, whiteSpace: 'pre-wrap', fontSize: 13 }}
                          >
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted text-center py-3">No structured data</div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setViewingLab(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Override Status Modal */}
      {overrideModal && (
        <>
          <div className="modal-backdrop show" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <div className="modal show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-sm">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title h6">Override Lesson Status</h5>
                  <button type="button" className="btn-close" onClick={() => setOverrideModal(null)} />
                </div>
                <div className="modal-body">
                  <p className="small mb-2"><strong>{overrideModal.lessonTitle}</strong></p>
                  <p className="small text-muted mb-3">Current status: <strong>{overrideModal.currentStatus}</strong></p>
                  <select
                    className="form-select form-select-sm"
                    value={overrideStatus}
                    onChange={(e) => setOverrideStatus(e.target.value)}
                  >
                    <option value="locked">Locked</option>
                    <option value="available">Available</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setOverrideModal(null)}>Cancel</button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleOverride}
                    disabled={overrideStatus === overrideModal.currentStatus}
                  >
                    Update Status
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
