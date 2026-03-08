import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useMentorContext } from '../../contexts/MentorContext';
import ConceptLesson from '../../components/portal/lesson/ConceptLesson';

interface LessonData {
  instance: {
    id: string;
    status: string;
    generated_content_json: any;
    structured_responses_json: any;
    reflection_responses_json: any;
    quiz_score: number | null;
    quiz_responses_json: any;
    attempts: number;
  };
  lesson: {
    id: string;
    title: string;
    description: string;
    lesson_type: string;
    estimated_minutes: number;
    lesson_number: number;
    requires_structured_input: boolean;
    structured_fields_schema: any;
    content_template_json: any;
  };
  module: {
    id: string;
    title: string;
    module_number: number;
  };
}

function PortalLessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labValues, setLabValues] = useState<Record<string, string>>({});
  const [labSaving, setLabSaving] = useState(false);
  const [labSaved, setLabSaved] = useState(false);
  const [reflectionValues, setReflectionValues] = useState<Record<string, string>>({});
  const [expandedReflections, setExpandedReflections] = useState<Set<number>>(new Set());
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionResult, setCompletionResult] = useState<any>(null);
  const [canComplete, setCanComplete] = useState(true);
  const [conceptQuizScore, setConceptQuizScore] = useState<number | null>(null);
  const { updateLessonContext } = useMentorContext();

  const startLesson = useCallback(async () => {
    try {
      const res = await portalApi.post(`/api/portal/curriculum/lessons/${lessonId}/start`);
      setData(res.data);
      if (res.data.instance.structured_responses_json) {
        setLabValues(res.data.instance.structured_responses_json);
      }
      if (res.data.instance.reflection_responses_json) {
        setReflectionValues(res.data.instance.reflection_responses_json);
      }
      if (res.data.instance.quiz_responses_json) {
        setQuizAnswers(res.data.instance.quiz_responses_json);
        setQuizSubmitted(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Unable to load lesson.');
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => { startLesson(); }, [startLesson]);

  // Push lesson context to MentorContext for the global AI Mentor panel
  useEffect(() => {
    if (!data) return;
    const content = data.instance.generated_content_json || {};
    updateLessonContext({
      lessonId: data.lesson.id,
      lessonTitle: data.lesson.title,
      currentSection: data.lesson.lesson_type,
      conceptText: content.concept_snapshot?.executive_summary || content.concept_explanation?.substring(0, 300) || '',
      promptTemplate: content.prompt_template?.template || '',
    });
    return () => {
      updateLessonContext({ lessonId: null, lessonTitle: '', currentSection: '', conceptText: '', promptTemplate: '' });
    };
  }, [data, updateLessonContext]);

  // Auto-navigate to next lesson after completion
  useEffect(() => {
    if (completionResult?.passed && completionResult?.next_lesson) {
      const timer = setTimeout(() => {
        navigate(`/portal/curriculum/lessons/${completionResult.next_lesson.id}`);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [completionResult, navigate]);

  const toggleReflection = (idx: number) => {
    setExpandedReflections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleLabSubmit = async () => {
    setLabSaving(true);
    try {
      await portalApi.post(`/api/portal/curriculum/lessons/${lessonId}/lab`, labValues);
      setLabSaved(true);
      setTimeout(() => setLabSaved(false), 3000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save lab data.');
    } finally {
      setLabSaving(false);
    }
  };

  const getCorrectAnswer = (q: any): string => {
    if (q.correct_answer) return q.correct_answer;
    if (q.correct_index !== undefined && q.options[q.correct_index]) {
      return q.options[q.correct_index].charAt(0);
    }
    return 'A';
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const payload: any = {};
      if (Object.keys(quizAnswers).length > 0) payload.quiz_responses = quizAnswers;
      if (Object.keys(reflectionValues).length > 0) payload.reflection_responses = reflectionValues;
      if (Object.keys(labValues).length > 0) payload.structured_responses = labValues;

      // Calculate quiz_score for assessment lessons
      if (data?.lesson.lesson_type === 'assessment' && content.questions?.length > 0) {
        const correct = content.questions.filter((q: any, i: number) => quizAnswers[i] === getCorrectAnswer(q)).length;
        payload.quiz_score = Math.round((correct / content.questions.length) * 100);
      }

      // Include concept v2 quiz score if available
      if (conceptQuizScore !== null) {
        payload.quiz_score = conceptQuizScore;
      }

      const res = await portalApi.put(`/api/portal/curriculum/lessons/${lessonId}/complete`, payload);
      setCompletionResult(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to complete lesson.');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: '#6366f1' }} role="status">
          <span className="visually-hidden">Loading lesson...</span>
        </div>
        <p className="text-muted small mt-3">Generating personalized content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-warning">
        <i className="bi bi-exclamation-triangle me-2"></i>{error}
        <button className="btn btn-link btn-sm" onClick={() => navigate('/portal/curriculum')}>
          Back to Curriculum
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { lesson, module: mod, instance } = data;
  const content = instance.generated_content_json || {};
  const isCompleted = instance.status === 'completed' || !!completionResult;

  // Count completed sections for progress
  const sections: string[] = [];
  if (lesson.lesson_type === 'concept') sections.push('concept');
  if (lesson.lesson_type === 'lab') sections.push('lab');
  if (lesson.lesson_type === 'assessment') sections.push('assessment');
  if (lesson.lesson_type === 'reflection') sections.push('reflection');

  return (
    <div style={{ paddingBottom: 80, maxWidth: 860 }}>
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb small mb-0">
          <li className="breadcrumb-item">
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none"
              style={{ color: '#6366f1' }}
              onClick={() => navigate('/portal/curriculum')}
            >
              Curriculum
            </button>
          </li>
          <li className="breadcrumb-item text-muted">{mod ? `Module ${mod.module_number}: ${mod.title}` : 'Module'}</li>
          <li className="breadcrumb-item active" aria-current="page">Lesson {lesson.lesson_number}</li>
        </ol>
      </nav>

      {/* Lesson Header Card */}
      <div
        className="card border-0 shadow-sm mb-4"
        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
      >
        <div className="card-body py-4 text-white">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                  {lesson.lesson_type.charAt(0).toUpperCase() + lesson.lesson_type.slice(1)}
                </span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  <i className="bi bi-clock me-1"></i>{lesson.estimated_minutes} min
                </span>
              </div>
              <h2 className="h4 fw-bold mb-1">{lesson.title}</h2>
              <p className="small mb-0" style={{ opacity: 0.8 }}>{lesson.description}</p>
            </div>
            {isCompleted && (
              <span className="badge fs-6" style={{ background: '#10b981' }}>
                <i className="bi bi-check-circle me-1"></i>Completed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Completion Success Banner */}
      {completionResult && (
        <div
          className="card border-0 shadow-sm mb-4"
          style={{ background: '#ecfdf5', border: '1px solid #a7f3d0 !important' }}
        >
          <div className="card-body py-3">
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <div
                  className="d-flex align-items-center justify-content-center rounded-circle"
                  style={{ width: 48, height: 48, background: '#10b981' }}
                >
                  <i className="bi bi-check-lg text-white" style={{ fontSize: 24 }}></i>
                </div>
                <div>
                  <h5 className="fw-bold mb-0" style={{ color: '#065f46' }}>Lesson Complete!</h5>
                  {completionResult.quiz_score != null && (
                    <span className="small" style={{ color: '#047857' }}>
                      Quiz Score: <strong>{Math.round(completionResult.quiz_score)}%</strong>
                    </span>
                  )}
                </div>
              </div>
              {completionResult.next_lesson ? (
                <div className="d-flex flex-column align-items-end gap-1">
                  <button
                    className="btn btn-sm px-3"
                    style={{ background: '#10b981', color: '#fff', borderRadius: 6, fontWeight: 600, fontSize: 13 }}
                    onClick={() => navigate(`/portal/curriculum/lessons/${completionResult.next_lesson.id}`)}
                  >
                    Next Lesson <i className="bi bi-arrow-right ms-1"></i>
                  </button>
                  <span className="small" style={{ color: '#6b7280', fontSize: 11 }}>
                    Continuing automatically...
                  </span>
                </div>
              ) : (
                <button
                  className="btn btn-sm px-3"
                  style={{ background: '#6366f1', color: '#fff', borderRadius: 6, fontWeight: 600, fontSize: 13 }}
                  onClick={() => navigate('/portal/curriculum')}
                >
                  <i className="bi bi-grid me-1"></i>Back to Curriculum
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  CONCEPT LESSON (v1 or v2 dispatched by ConceptLesson)        */}
      {/* ============================================================ */}
      {lesson.lesson_type === 'concept' && (content.concept_explanation || content.content_version === 'v2') && (
        <ConceptLesson
          content={content}
          lessonId={lesson.id}
          isCompleted={isCompleted}
          onCanCompleteChange={setCanComplete}
          onQuizScoreChange={setConceptQuizScore}
          quizResponses={instance.quiz_responses_json}
          taskData={instance.structured_responses_json?.task_progress}
        />
      )}

      {/* ============================================================ */}
      {/*  ASSESSMENT LESSON                                            */}
      {/* ============================================================ */}
      {lesson.lesson_type === 'assessment' && content.questions && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white border-bottom d-flex align-items-center justify-content-between" style={{ padding: '14px 20px' }}>
            <div className="d-flex align-items-center gap-2">
              <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#fffbeb' }}>
                <i className="bi bi-clipboard-check" style={{ color: '#f59e0b', fontSize: 14 }}></i>
              </div>
              <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Knowledge Check</span>
            </div>
            {instance.quiz_score != null && (
              <span
                className="badge"
                style={{
                  background: instance.quiz_score >= 70 ? '#ecfdf5' : '#fef2f2',
                  color: instance.quiz_score >= 70 ? '#10b981' : '#ef4444',
                  fontSize: 12,
                }}
              >
                Score: {Math.round(instance.quiz_score)}%
                {instance.quiz_score >= 70 ? ' — Passed' : ' — Retry Required'}
              </span>
            )}
          </div>
          <div className="card-body" style={{ padding: 20 }}>
            {instance.quiz_score != null && instance.quiz_score < 70 && (
              <div
                className="d-flex align-items-center gap-2 p-3 rounded mb-4"
                style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
              >
                <i className="bi bi-exclamation-triangle" style={{ color: '#ef4444' }}></i>
                <span className="small" style={{ color: '#991b1b' }}>
                  You need at least 70% to pass. Review the material and try again.
                </span>
              </div>
            )}

            {content.questions.map((q: any, qi: number) => {
              const isSelected = (letter: string) => quizAnswers[qi] === letter;
              return (
                <div key={qi} className="mb-4">
                  <p className="fw-semibold mb-3" style={{ fontSize: 14, color: '#1e293b' }}>
                    <span
                      className="d-inline-flex align-items-center justify-content-center rounded-circle me-2"
                      style={{ width: 24, height: 24, background: '#eef2ff', color: '#6366f1', fontSize: 12, fontWeight: 700 }}
                    >
                      {qi + 1}
                    </span>
                    {q.question}
                  </p>
                  <div className="d-flex flex-column gap-2 ps-4">
                    {q.options?.map((opt: string, oi: number) => {
                      const letter = opt.charAt(0);
                      const selected = isSelected(letter);
                      const isCorrect = quizSubmitted && letter === q.correct_answer;
                      const isWrong = quizSubmitted && selected && letter !== q.correct_answer;

                      let borderColor = '#e2e8f0';
                      let bg = '#fff';
                      if (selected && !quizSubmitted) { borderColor = '#6366f1'; bg = '#eef2ff'; }
                      if (isCorrect) { borderColor = '#10b981'; bg = '#ecfdf5'; }
                      if (isWrong) { borderColor = '#ef4444'; bg = '#fef2f2'; }

                      return (
                        <label
                          key={oi}
                          className="d-flex align-items-center gap-3 p-3 rounded"
                          style={{
                            border: `1.5px solid ${borderColor}`,
                            background: bg,
                            cursor: (quizSubmitted && instance.quiz_score != null && instance.quiz_score >= 70) ? 'default' : 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          <input
                            type="radio"
                            name={`q${qi}`}
                            checked={selected}
                            disabled={quizSubmitted && instance.quiz_score != null && instance.quiz_score >= 70}
                            onChange={() => {
                              setQuizAnswers({ ...quizAnswers, [qi]: letter });
                              setQuizSubmitted(false);
                            }}
                            style={{ accentColor: '#6366f1' }}
                          />
                          <span style={{ fontSize: 13, color: '#334155' }}>{opt}</span>
                          {isCorrect && <i className="bi bi-check-circle-fill ms-auto" style={{ color: '#10b981' }}></i>}
                          {isWrong && <i className="bi bi-x-circle-fill ms-auto" style={{ color: '#ef4444' }}></i>}
                        </label>
                      );
                    })}
                  </div>
                  {quizSubmitted && q.explanation && (
                    <div
                      className="d-flex align-items-start gap-2 mt-2 p-3 rounded ms-4"
                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
                    >
                      <i className="bi bi-info-circle" style={{ color: '#6366f1', fontSize: 14, marginTop: 1 }}></i>
                      <span className="small" style={{ color: '#475569' }}>{q.explanation}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  LAB LESSON                                                   */}
      {/* ============================================================ */}
      {lesson.lesson_type === 'lab' && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
            <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#f5f3ff' }}>
              <i className="bi bi-tools" style={{ color: '#8b5cf6', fontSize: 14 }}></i>
            </div>
            <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Hands-On Lab</span>
            <span className="badge" style={{ background: '#f5f3ff', color: '#8b5cf6', fontSize: 10 }}>Interactive</span>
          </div>
          <div className="card-body" style={{ padding: 20 }}>
            {/* Instructions */}
            {content.instructions && (
              <div className="mb-4" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#334155', fontSize: 14 }}>
                {content.instructions}
              </div>
            )}

            {/* Context Brief */}
            {content.context_brief && (
              <div
                className="d-flex align-items-start gap-2 p-3 rounded mb-4"
                style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}
              >
                <i className="bi bi-lightbulb" style={{ color: '#6366f1', fontSize: 16, marginTop: 1 }}></i>
                <span className="small" style={{ color: '#3730a3' }}>{content.context_brief}</span>
              </div>
            )}

            {/* Structured Fields */}
            {lesson.structured_fields_schema?.fields?.map((field: any) => {
              const guidance = content.field_guidance?.[field.name];
              const example = content.example_responses?.[field.name];
              return (
                <div key={field.name} className="mb-4">
                  <label className="form-label small fw-semibold" style={{ color: '#1e293b' }}>
                    {field.label}
                    {field.required && <span className="text-danger ms-1">*</span>}
                  </label>
                  {guidance && (
                    <div className="d-flex align-items-start gap-1 mb-2" style={{ fontSize: 12, color: '#64748b' }}>
                      <i className="bi bi-info-circle" style={{ marginTop: 1 }}></i>
                      <span>{guidance}</span>
                    </div>
                  )}
                  {field.type === 'textarea' ? (
                    <textarea
                      className="form-control"
                      rows={4}
                      placeholder={field.placeholder || (example ? `Example: ${example}` : '')}
                      value={labValues[field.name] || ''}
                      onChange={(e) => setLabValues({ ...labValues, [field.name]: e.target.value })}
                      style={{ borderColor: '#e2e8f0', fontSize: 13 }}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      className="form-select"
                      value={labValues[field.name] || ''}
                      onChange={(e) => setLabValues({ ...labValues, [field.name]: e.target.value })}
                      style={{ borderColor: '#e2e8f0', fontSize: 13 }}
                    >
                      <option value="">Select...</option>
                      {field.options?.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-control"
                      placeholder={field.placeholder || (example ? `Example: ${example}` : '')}
                      value={labValues[field.name] || ''}
                      onChange={(e) => setLabValues({ ...labValues, [field.name]: e.target.value })}
                      style={{ borderColor: '#e2e8f0', fontSize: 13 }}
                    />
                  )}
                </div>
              );
            })}

            <div className="d-flex gap-2">
              <button
                className="btn btn-sm px-3"
                style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, fontSize: 12, fontWeight: 600 }}
                onClick={handleLabSubmit}
                disabled={labSaving}
              >
                <i className={`bi ${labSaved ? 'bi-check-lg' : 'bi-save'} me-1`}></i>
                {labSaving ? 'Saving...' : labSaved ? 'Saved!' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  REFLECTION LESSON                                            */}
      {/* ============================================================ */}
      {lesson.lesson_type === 'reflection' && content.prompts && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
            <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#fffbeb' }}>
              <i className="bi bi-chat-square-quote" style={{ color: '#f59e0b', fontSize: 14 }}></i>
            </div>
            <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Reflection</span>
          </div>
          <div className="card-body p-0">
            {/* Accordion-style reflection prompts */}
            {content.prompts.map((p: any, i: number) => {
              const isExpanded = expandedReflections.has(i);
              return (
                <div key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <button
                    className="btn w-100 text-start d-flex align-items-center justify-content-between py-3 px-4"
                    onClick={() => toggleReflection(i)}
                    style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}
                  >
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-chat-dots" style={{ color: '#f59e0b' }}></i>
                      <span>{p.question}</span>
                    </div>
                    <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ color: '#94a3b8' }}></i>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3">
                      {p.guidance && (
                        <p className="small mb-2" style={{ color: '#64748b' }}>
                          <i className="bi bi-info-circle me-1"></i>{p.guidance}
                        </p>
                      )}
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Share your thoughts..."
                        value={reflectionValues[`prompt_${i}`] || ''}
                        onChange={(e) => setReflectionValues({ ...reflectionValues, [`prompt_${i}`]: e.target.value })}
                        style={{ borderColor: '#e2e8f0', fontSize: 13 }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Synthesis prompt */}
            {content.synthesis_prompt && (
              <div className="p-4" style={{ background: '#fffbeb' }}>
                <p className="fw-semibold small mb-2" style={{ color: '#92400e' }}>
                  <i className="bi bi-stars me-1"></i>Synthesis
                </p>
                <p className="small mb-2" style={{ color: '#78350f' }}>{content.synthesis_prompt}</p>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Connect your reflections together..."
                  value={reflectionValues['synthesis'] || ''}
                  onChange={(e) => setReflectionValues({ ...reflectionValues, synthesis: e.target.value })}
                  style={{ borderColor: '#fde68a', fontSize: 13 }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/*  BOTTOM STICKY BAR                                            */}
      {/* ============================================================ */}
      <div
        className="fixed-bottom bg-white border-top shadow-lg"
        style={{ padding: '12px 0' }}
      >
        <div className="container d-flex justify-content-between align-items-center">
          <button
            className="btn btn-sm px-3"
            style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, fontSize: 13, fontWeight: 500 }}
            onClick={() => navigate('/portal/curriculum')}
          >
            <i className="bi bi-arrow-left me-1"></i>Back to Dashboard
          </button>

          <div className="d-flex align-items-center gap-3">
            {/* Section indicators */}
            <div className="d-none d-md-flex align-items-center gap-2 me-2">
              {(content.content_version === 'v2' ? [
                { icon: 'bi-lightbulb', label: 'Concept' },
                { icon: 'bi-robot', label: 'AI Strategy' },
                { icon: 'bi-terminal', label: 'Prompt Lab' },
                { icon: 'bi-code-slash', label: 'Code' },
                { icon: 'bi-kanban', label: 'Task' },
                { icon: 'bi-patch-question', label: 'Check' },
                { icon: 'bi-chat-square-quote', label: 'Reflect' },
              ] : [
                { icon: 'bi-book', label: 'Learn' },
                { icon: 'bi-clipboard-check', label: 'Practice' },
                { icon: 'bi-chat-square-quote', label: 'Reflect' },
                { icon: 'bi-check2-square', label: 'Check' },
              ]).map((s, i) => (
                <div key={i} className="d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#94a3b8' }}>
                  <i className={`bi ${s.icon}`}></i>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            {!isCompleted ? (
              <div className="d-flex align-items-center gap-2">
                {content.content_version === 'v2' && !canComplete && (
                  <span className="small" style={{ color: '#94a3b8', fontSize: 11 }}>
                    <i className="bi bi-lock me-1"></i>Complete quiz & task first
                  </span>
                )}
                <button
                  className="btn btn-sm px-4"
                  style={{
                    background: (content.content_version === 'v2' && !canComplete) ? '#94a3b8' : '#10b981',
                    color: '#fff',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  onClick={handleComplete}
                  disabled={completing || (content.content_version === 'v2' && !canComplete)}
                >
                  {completing ? (
                    <><span className="spinner-border spinner-border-sm me-1"></span>Submitting...</>
                  ) : (
                    <><i className="bi bi-check-lg me-1"></i>Mark as Complete</>
                  )}
                </button>
              </div>
            ) : (
              <span className="badge" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 12, padding: '8px 16px' }}>
                <i className="bi bi-check-circle me-1"></i>Completed
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Error boundary to prevent blank screen on lesson render errors
class LessonErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body text-center py-5">
            <i className="bi bi-exclamation-triangle" style={{ fontSize: 40, color: '#f59e0b' }}></i>
            <h5 className="fw-bold mt-3">Something went wrong loading this lesson</h5>
            <p className="text-muted small">{this.state.error}</p>
            <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PortalLessonPageWithBoundary() {
  return (
    <LessonErrorBoundary>
      <PortalLessonPage />
    </LessonErrorBoundary>
  );
}

export default PortalLessonPageWithBoundary;
