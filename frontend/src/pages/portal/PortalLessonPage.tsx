import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useMentorContext } from '../../contexts/MentorContext';
import ConceptLesson from '../../components/portal/lesson/ConceptLesson';
import ModuleCompletionPanel from '../../components/portal/lesson/ModuleCompletionPanel';
import { StepInfo } from '../../components/portal/lesson/LessonStepTracker';

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
  const [completing, setCompleting] = useState(false);
  const [completionResult, setCompletionResult] = useState<any>(null);
  const [canComplete, setCanComplete] = useState(true);
  const [conceptQuizScore, setConceptQuizScore] = useState<number | null>(null);
  const [stepStatuses, setStepStatuses] = useState<StepInfo[]>([]);
  const [contextMode, setContextMode] = useState<string | null>(null);
  const { updateLessonContext } = useMentorContext();

  const startLesson = useCallback(async () => {
    try {
      const res = await portalApi.post(`/api/portal/curriculum/lessons/${lessonId}/start`);
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Unable to load lesson.');
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => { startLesson(); }, [startLesson]);

  // Fetch context mode (cold vs warm user)
  useEffect(() => {
    portalApi.get('/api/portal/context-state')
      .then(res => setContextMode(res.data.mode))
      .catch(() => {}); // non-critical
  }, []);

  // Push lesson context to MentorContext for the global AI Mentor panel
  useEffect(() => {
    if (!data) return;
    const content = data.instance.generated_content_json || {};
    updateLessonContext({
      lessonId: data.lesson.id,
      lessonTitle: data.lesson.title,
      currentSection: 'section',
      conceptText: content.concept_snapshot?.executive_summary || content.concept_explanation?.substring(0, 300) || '',
      promptTemplate: content.prompt_template?.template || '',
      implementationTaskData: content.implementation_task ? {
        title: content.implementation_task.title || 'Implementation Task',
        description: content.implementation_task.description || content.implementation_task.scenario || '',
        deliverable: content.implementation_task.deliverable || '',
        requirements: content.implementation_task.requirements || content.implementation_task.steps || [],
        artifacts: (content.implementation_task.required_artifacts || []).map((a: any) => ({
          name: a.name,
          description: a.description,
          file_types: a.file_types || [],
          validation_criteria: a.validation_criteria || '',
        })),
      } : undefined,
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

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const payload: any = {};

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
          <li className="breadcrumb-item active" aria-current="page">Section {lesson.lesson_number}</li>
        </ol>
      </nav>

      {/* Context Mode Banner */}
      {contextMode === 'GUIDED_DISCOVERY' && (
        <div className="alert alert-info py-2 small mb-3">
          <strong>Discovery Mode</strong> — We'll help you explore and define your AI strategy as you learn.
        </div>
      )}
      {contextMode === 'FAST_TRACK' && (
        <div className="alert alert-success py-2 small mb-3">
          <strong>Personalized Track</strong> — Content is tailored to your strategy session data.
        </div>
      )}

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
                  Section
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
                  <h5 className="fw-bold mb-0" style={{ color: '#065f46' }}>Section Complete!</h5>
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
                    Next Section <i className="bi bi-arrow-right ms-1"></i>
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

      {/* Unified Section Content — all lesson types render through ConceptV2 */}
      {/* Module Completion Panel */}
      {completionResult?.passed && !completionResult.next_lesson && data.module && (
        <ModuleCompletionPanel
          moduleName={data.module.title}
          moduleNumber={data.module.module_number}
          onContinue={() => navigate('/portal/curriculum')}
        />
      )}

      <ConceptLesson
        content={content}
        lessonId={lesson.id}
        isCompleted={isCompleted}
        onCanCompleteChange={setCanComplete}
        onQuizScoreChange={setConceptQuizScore}
        onStepStatusChange={setStepStatuses}
        quizResponses={instance.quiz_responses_json}
        taskData={instance.structured_responses_json?.task_progress}
      />

      {/* Bottom Sticky Bar */}
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
            {/* Dynamic section indicators */}
            <div className="d-none d-md-flex align-items-center gap-2 me-2">
              {stepStatuses.map((s, i) => (
                <div
                  key={i}
                  className="d-flex align-items-center gap-1"
                  style={{
                    fontSize: 11,
                    color: s.status === 'completed' ? 'var(--color-accent)' : s.status === 'active' ? 'var(--color-primary)' : '#94a3b8',
                  }}
                >
                  <i className={`bi ${s.status === 'completed' ? 'bi-check-circle-fill' : s.icon}`}></i>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            {!isCompleted ? (
              <div className="d-flex align-items-center gap-2">
                {!canComplete && (
                  <span className="small" style={{ color: '#94a3b8', fontSize: 11 }}>
                    <i className="bi bi-lock me-1"></i>Complete quiz & task first
                  </span>
                )}
                <button
                  className="btn btn-sm px-4"
                  style={{
                    background: !canComplete ? '#94a3b8' : '#10b981',
                    color: '#fff',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  onClick={handleComplete}
                  disabled={completing || !canComplete}
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
