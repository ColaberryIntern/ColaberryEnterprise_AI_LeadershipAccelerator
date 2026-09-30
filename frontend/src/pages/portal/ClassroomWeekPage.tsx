import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  WeekData,
  WeekItemType,
  WeekVisibilityMap,
  StartInterviewResult,
  SubmitInterviewResult,
  getWeekData,
  revealNextActivity,
  startInterview,
  submitInterview,
} from '../../services/classroomApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {}

interface InterviewState {
  phase: 'idle' | 'loading' | 'questions' | 'submitting' | 'done' | 'error';
  session_id: string | null;
  questions: Array<{ id: string; text: string }>;
  answers: Record<string, string>;
  result: SubmitInterviewResult | null;
  error: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEK_THEMES: Record<number, { theme: string; type: 'skilljar' | 'original' | 'cert' }> = {
  1:  { theme: 'Claude Code Foundations', type: 'skilljar' },
  2:  { theme: 'Agent Skills', type: 'skilljar' },
  3:  { theme: 'Claude API + Workflow Assistant', type: 'skilljar' },
  4:  { theme: 'Prompt Engineering', type: 'original' },
  5:  { theme: 'MCP Foundations', type: 'skilljar' },
  6:  { theme: 'MCP Advanced Topics', type: 'skilljar' },
  7:  { theme: 'Introduction to Subagents', type: 'skilljar' },
  8:  { theme: 'Multi-Agent Systems', type: 'skilljar' },
  9:  { theme: 'Reliability Engineering', type: 'original' },
  10: { theme: 'Governance + Audit Layer', type: 'original' },
  11: { theme: 'Executive Capstone', type: 'original' },
  12: { theme: 'CCA-F Certification Exam', type: 'cert' },
};

const ITEM_LABELS: Record<WeekItemType, string> = {
  warm_up: '5-question warm-up quiz',
  lab: 'Build it on your project',
  video_critique: 'Record & critique',
  post_quiz: '10-question post-quiz',
  mock_interview: 'AI mock interview',
};

const ITEM_POINTS: Record<WeekItemType, number> = {
  warm_up: 25,
  lab: 90,
  video_critique: 60,
  post_quiz: 75,
  mock_interview: 50,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ visible, done }: { visible: boolean; done: boolean }) {
  if (!visible) {
    return (
      <span className="badge rounded-pill" style={{ background: '#f1f5f9', color: '#94a3b8', fontSize: 12 }}>
        <i className="bi bi-lock-fill me-1" />Locked
      </span>
    );
  }
  if (done) {
    return (
      <span className="badge rounded-pill" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 12 }}>
        <i className="bi bi-check-circle-fill me-1" />Done
      </span>
    );
  }
  return (
    <span className="badge rounded-pill" style={{ background: '#eef2ff', color: 'var(--color-primary)', fontSize: 12 }}>
      <i className="bi bi-circle me-1" />Not started
    </span>
  );
}

function CourseLinkCard({ courseLink, weekNumber }: {
  courseLink: WeekData['course_link'];
  weekNumber: number;
}) {
  const meta = WEEK_THEMES[weekNumber];
  const isCert = meta?.type === 'cert';
  const isOriginal = meta?.type === 'original';

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body">
        <div className="d-flex align-items-start gap-3">
          <div
            className="rounded d-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: 42, height: 42, background: 'var(--color-primary)', color: '#fff' }}
          >
            <i className="bi bi-play-circle-fill fs-5" />
          </div>
          <div className="flex-grow-1 min-w-0">
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <span className="text-muted small fw-medium">Course</span>
              {isCert && (
                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: 11 }}>
                  CCA-F Certification
                </span>
              )}
              {isOriginal && (
                <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', fontSize: 11 }}>
                  Colaberry Original
                </span>
              )}
              {!isCert && !isOriginal && (
                <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 11 }}>
                  Anthropic · Skilljar
                </span>
              )}
            </div>
            <h6 className="mb-1 fw-semibold" style={{ color: 'var(--color-text)' }}>
              {courseLink?.title ?? meta?.theme ?? `Week ${weekNumber} course`}
            </h6>
            {isOriginal ? (
              <p className="small text-muted mb-2">Colaberry-authored content for this week. Reading list below.</p>
            ) : (
              <p className="small text-muted mb-2">
                Opens in a new tab on Skilljar. No separate login expected for enrolled students.
                Completion is confirmed by your post-quiz.
              </p>
            )}
            {courseLink?.url && !isOriginal ? (
              <a
                href={courseLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
                style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: 6 }}
              >
                <i className="bi bi-box-arrow-up-right me-1" />
                Open course on Skilljar
              </a>
            ) : courseLink?.status === 'pending_confirmation' ? (
              <span className="badge" style={{ background: '#fef9c3', color: '#854d0e', fontSize: 12 }}>
                <i className="bi bi-clock me-1" />Link pending — check back soon
              </span>
            ) : null}
          </div>
          <span className="badge rounded-pill" style={{ background: '#f0fdf4', color: '#166534', fontSize: 11, whiteSpace: 'nowrap' }}>
            <i className="bi bi-eye me-1" />Always open
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityStep({
  itemType,
  stepNumber,
  visible,
  done,
  onComplete,
  children,
}: {
  itemType: WeekItemType;
  stepNumber: number;
  visible: boolean;
  done: boolean;
  onComplete?: () => void;
  children?: React.ReactNode;
}) {
  const points = ITEM_POINTS[itemType];

  return (
    <div className={`card border-0 shadow-sm mb-3 ${!visible ? 'opacity-50' : ''}`}>
      <div className="card-body">
        <div className="d-flex align-items-start gap-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold"
            style={{
              width: 36,
              height: 36,
              background: done ? '#ecfdf5' : visible ? '#eef2ff' : '#f1f5f9',
              color: done ? '#10b981' : visible ? 'var(--color-primary)' : '#94a3b8',
              fontSize: 14,
            }}
          >
            {done ? <i className="bi bi-check-lg" /> : stepNumber}
          </div>
          <div className="flex-grow-1 min-w-0">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
              <h6 className="mb-0 fw-semibold" style={{ color: 'var(--color-text)' }}>
                {ITEM_LABELS[itemType]}
              </h6>
              <div className="d-flex align-items-center gap-2">
                <span className="small text-muted">+{points} pts</span>
                <StatusPill visible={visible} done={done} />
              </div>
            </div>
            {children}
            {visible && !done && onComplete && (
              <button
                className="btn btn-sm mt-2"
                style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: 6 }}
                onClick={onComplete}
              >
                Mark complete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MockInterviewPanel({
  weekNumber,
  visible,
}: {
  weekNumber: number;
  visible: boolean;
}) {
  const [state, setState] = useState<InterviewState>({
    phase: 'idle',
    session_id: null,
    questions: [],
    answers: {},
    result: null,
    error: null,
  });

  const handleStart = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading', error: null }));
    try {
      const res = await startInterview(weekNumber);
      const data: StartInterviewResult = res.data;
      if (data.already_completed && data.status === 'completed') {
        setState((s) => ({ ...s, phase: 'done' }));
        return;
      }
      setState((s) => ({
        ...s,
        phase: 'questions',
        session_id: data.session_id,
        questions: data.questions,
        answers: Object.fromEntries(data.questions.map((q) => [q.id, ''])),
      }));
    } catch {
      setState((s) => ({ ...s, phase: 'error', error: 'Unable to start interview. Try again.' }));
    }
  }, [weekNumber]);

  const handleSubmit = useCallback(async () => {
    if (!state.session_id) return;
    const answers = Object.entries(state.answers).map(([question_id, answer]) => ({
      question_id,
      answer,
    }));
    if (answers.some((a) => !a.answer.trim())) {
      setState((s) => ({ ...s, error: 'Please answer all questions before submitting.' }));
      return;
    }
    setState((s) => ({ ...s, phase: 'submitting', error: null }));
    try {
      const res = await submitInterview(state.session_id!, answers);
      setState((s) => ({ ...s, phase: 'done', result: res.data }));
    } catch {
      setState((s) => ({ ...s, phase: 'error', error: 'Submission failed. Try again.' }));
    }
  }, [state.session_id, state.answers]);

  if (!visible) return null;

  if (state.phase === 'idle') {
    return (
      <div className="mt-2">
        <p className="small text-muted mb-2">
          3–5 questions scoped to this week. Type your answers — scored on specificity and
          accuracy. Results emailed to you.
        </p>
        <button
          className="btn btn-sm"
          style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: 6 }}
          onClick={handleStart}
        >
          <i className="bi bi-robot me-1" />Start interview
        </button>
      </div>
    );
  }

  if (state.phase === 'loading' || state.phase === 'submitting') {
    return (
      <div className="mt-2 d-flex align-items-center gap-2 text-muted small">
        <div className="spinner-border spinner-border-sm" role="status" aria-label="Loading" />
        {state.phase === 'loading' ? 'Starting your interview…' : 'Scoring and emailing results…'}
      </div>
    );
  }

  if (state.phase === 'done') {
    const score = state.result?.total_score;
    const scoreColor = score !== undefined
      ? score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
      : '#6366f1';
    return (
      <div className="mt-2">
        {score !== undefined && (
          <div className="d-flex align-items-center gap-3 mb-2">
            <span className="fw-bold fs-4" style={{ color: scoreColor }}>{score}</span>
            <span className="text-muted small">/ 100 — results emailed</span>
          </div>
        )}
        {state.result?.feedback && (
          <p className="small" style={{ color: 'var(--color-text)', lineHeight: 1.6 }}>
            {state.result.feedback}
          </p>
        )}
        {!state.result && <p className="small text-muted">Interview already completed.</p>}
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="mt-2">
        <p className="small text-danger mb-2">{state.error}</p>
        <button className="btn btn-sm btn-outline-secondary" onClick={handleStart}>Retry</button>
      </div>
    );
  }

  // phase === 'questions'
  return (
    <div className="mt-2">
      {state.error && <p className="small text-danger mb-2">{state.error}</p>}
      {state.questions.map((q, i) => (
        <div key={q.id} className="mb-3">
          <label
            htmlFor={`iq-${q.id}`}
            className="form-label small fw-medium"
            style={{ color: 'var(--color-text)' }}
          >
            {i + 1}. {q.text}
          </label>
          <textarea
            id={`iq-${q.id}`}
            className="form-control form-control-sm"
            rows={3}
            placeholder="Type your answer…"
            value={state.answers[q.id] ?? ''}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                answers: { ...s.answers, [q.id]: e.target.value },
              }))
            }
          />
        </div>
      ))}
      <button
        className="btn btn-sm"
        style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: 6 }}
        onClick={handleSubmit}
      >
        <i className="bi bi-send me-1" />Submit answers
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ClassroomWeekPage(_props: Props) {
  const { weekNum } = useParams<{ weekNum: string }>();
  const navigate = useNavigate();
  const weekNumber = parseInt(weekNum ?? '1', 10);

  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [doneItems, setDoneItems] = useState<Set<WeekItemType>>(new Set());

  useEffect(() => {
    if (!weekNum || isNaN(weekNumber) || weekNumber < 1 || weekNumber > 12) {
      navigate('/portal/classroom/week/1', { replace: true });
      return;
    }
    setLoading(true);
    setError(false);
    setDoneItems(new Set());
    getWeekData(weekNumber)
      .then((res) => setWeekData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [weekNumber, weekNum, navigate]);

  const handleActivityComplete = useCallback(
    async (completedItem: WeekItemType) => {
      setDoneItems((prev) => new Set([...prev, completedItem]));
      try {
        const res = await revealNextActivity(weekNumber, completedItem);
        setWeekData((prev) =>
          prev ? { ...prev, visibility: res.data.visibility, next_unrevealed: res.data.revealed } : prev
        );
      } catch {
        // Non-fatal — visibility state will sync on next page load
      }
    },
    [weekNumber]
  );

  const v = (item: WeekItemType): boolean =>
    !!weekData?.visibility?.[item]?.visible;

  const meta = WEEK_THEMES[weekNumber];

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <div className="spinner-border" role="status" aria-label="Loading week content" />
      </div>
    );
  }

  if (error || !weekData) {
    return (
      <div className="alert alert-warning" role="alert">
        <i className="bi bi-exclamation-triangle me-2" />
        Unable to load Week {weekNumber}. Please refresh or contact support.
      </div>
    );
  }

  return (
    <>
      {/* Header + week switcher */}
      <div className="mb-3">
        <p className="text-muted small mb-1">
          <i className="bi bi-mortarboard me-1" />
          Classroom · Week {weekNumber} of 12
        </p>
        <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-text)' }}>
          Week {weekNumber} · {meta?.theme ?? 'Coming soon'}
        </h1>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {meta?.type === 'skilljar' && (
            <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 11 }}>
              Anthropic · Skilljar
            </span>
          )}
          {meta?.type === 'original' && (
            <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', fontSize: 11 }}>
              Colaberry Original
            </span>
          )}
          {meta?.type === 'cert' && (
            <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: 11 }}>
              CCA-F Certification
            </span>
          )}
        </div>
      </div>

      {/* Week navigation */}
      <div className="d-flex align-items-center gap-2 mb-4 flex-wrap">
        {weekNumber > 1 && (
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => navigate(`/portal/classroom/week/${weekNumber - 1}`)}
            aria-label={`Go to Week ${weekNumber - 1}`}
          >
            <i className="bi bi-chevron-left me-1" />Week {weekNumber - 1}
          </button>
        )}
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={weekNumber}
          onChange={(e) => navigate(`/portal/classroom/week/${e.target.value}`)}
          aria-label="Jump to week"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w} · {WEEK_THEMES[w]?.theme ?? 'Coming soon'}
            </option>
          ))}
        </select>
        {weekNumber < 12 && (
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => navigate(`/portal/classroom/week/${weekNumber + 1}`)}
            aria-label={`Go to Week ${weekNumber + 1}`}
          >
            Week {weekNumber + 1}<i className="bi bi-chevron-right ms-1" />
          </button>
        )}
      </div>

      <div className="row g-4">
        {/* ── Content band (always open) ── */}
        <div className="col-12 col-lg-5">
          <div className="mb-2 d-flex align-items-center gap-2">
            <i className="bi bi-eye text-muted" />
            <span className="fw-semibold small" style={{ color: 'var(--color-text)' }}>
              Content · open anytime
            </span>
            <span className="badge" style={{ background: '#f0fdf4', color: '#166534', fontSize: 10 }}>
              never locked
            </span>
          </div>

          <CourseLinkCard courseLink={weekData.course_link} weekNumber={weekNumber} />

          {/* NotebookLM video placeholder */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="rounded d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: 42, height: 42, background: '#fef2f2', color: '#ef4444' }}
                >
                  <i className="bi bi-play-btn-fill fs-5" />
                </div>
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                    <span className="text-muted small fw-medium">Watch</span>
                    <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 11 }}>
                      Colaberry · NotebookLM
                    </span>
                    <span className="badge" style={{ background: '#f0fdf4', color: '#166534', fontSize: 10 }}>
                      always open
                    </span>
                  </div>
                  <h6 className="mb-1 fw-semibold" style={{ color: 'var(--color-text)' }}>
                    Week {weekNumber} explainer — the architect's lens
                  </h6>
                  <p className="small text-muted mb-0">
                    Colaberry NotebookLM explainer. Reframes the course through the Systems-Architect
                    lens. Available when Swati's video is published.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Activities band (sequential reveal) ── */}
        <div className="col-12 col-lg-7">
          <div className="mb-2 d-flex align-items-center gap-2">
            <i className="bi bi-check2-square text-muted" />
            <span className="fw-semibold small" style={{ color: 'var(--color-text)' }}>
              Activities · complete to finish the week
            </span>
            <span className="badge" style={{ background: '#eef2ff', color: 'var(--color-primary)', fontSize: 10 }}>
              reveal as you go
            </span>
          </div>

          <ActivityStep
            itemType="warm_up"
            stepNumber={1}
            visible={v('warm_up')}
            done={doneItems.has('warm_up')}
            onComplete={() => handleActivityComplete('warm_up')}
          >
            <p className="small text-muted mb-0">
              A 5-question primer before the course — surfaces what you already know so the course
              time lands where it counts.
            </p>
          </ActivityStep>

          <ActivityStep
            itemType="lab"
            stepNumber={2}
            visible={v('lab')}
            done={doneItems.has('lab')}
            onComplete={() => handleActivityComplete('lab')}
          >
            <p className="small text-muted mb-1">
              Apply this week to your own capstone project. Scored on-site and produces this week's
              Tier-A artifact for your portfolio.
            </p>
            <div
              className="rounded p-2 mb-1"
              style={{ background: '#1e293b', fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}
            >
              <span style={{ color: '#64748b' }}># Claude Code prompt for this lab</span>
              <br />
              <span style={{ color: '#e2e8f0' }}>
                Goal: apply this week's concepts to your project.
                <br />
                Commit and push when done.
              </span>
            </div>
          </ActivityStep>

          <ActivityStep
            itemType="video_critique"
            stepNumber={3}
            visible={v('video_critique')}
            done={doneItems.has('video_critique')}
            onComplete={() => handleActivityComplete('video_critique')}
          >
            <p className="small text-muted mb-0">
              Record a 2-min demo of your build or an interview answer. AI Video Critiquer gives
              feedback on pacing, clarity, and filler words. <em>Coming in Epic 5.</em>
            </p>
          </ActivityStep>

          <ActivityStep
            itemType="post_quiz"
            stepNumber={4}
            visible={v('post_quiz')}
            done={doneItems.has('post_quiz')}
            onComplete={() => handleActivityComplete('post_quiz')}
          >
            <p className="small text-muted mb-0">
              10-question post-quiz — our course completion signal — plus a short reflection survey.
            </p>
          </ActivityStep>

          <div className={`card border-0 shadow-sm mb-3 ${!v('mock_interview') ? 'opacity-50' : ''}`}>
            <div className="card-body">
              <div className="d-flex align-items-start gap-3">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 fw-bold"
                  style={{
                    width: 36,
                    height: 36,
                    background: doneItems.has('mock_interview') ? '#ecfdf5' : v('mock_interview') ? '#eef2ff' : '#f1f5f9',
                    color: doneItems.has('mock_interview') ? '#10b981' : v('mock_interview') ? 'var(--color-primary)' : '#94a3b8',
                    fontSize: 14,
                  }}
                >
                  {doneItems.has('mock_interview') ? <i className="bi bi-check-lg" /> : 5}
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
                    <h6 className="mb-0 fw-semibold" style={{ color: 'var(--color-text)' }}>
                      {ITEM_LABELS['mock_interview']}
                    </h6>
                    <div className="d-flex align-items-center gap-2">
                      <span className="small text-muted">+{ITEM_POINTS['mock_interview']} pts</span>
                      <StatusPill visible={v('mock_interview')} done={doneItems.has('mock_interview')} />
                    </div>
                  </div>
                  <MockInterviewPanel weekNumber={weekNumber} visible={v('mock_interview')} />
                </div>
              </div>
            </div>
          </div>

          {/* Week complete state */}
          {doneItems.size === 5 && (
            <div
              className="card border-0 text-center py-4"
              style={{ background: '#f0fdf4', borderRadius: 12 }}
            >
              <i className="bi bi-trophy-fill fs-2 mb-2" style={{ color: '#10b981' }} />
              <h5 className="fw-bold mb-1" style={{ color: '#166534' }}>
                Week {weekNumber} complete!
              </h5>
              <p className="small text-muted mb-2">
                All activities done. Your Tier-A artifact has been filed to your portfolio.
              </p>
              {weekNumber < 12 && (
                <button
                  className="btn btn-sm mx-auto"
                  style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: 6, width: 'fit-content' }}
                  onClick={() => navigate(`/portal/classroom/week/${weekNumber + 1}`)}
                >
                  Start Week {weekNumber + 1} <i className="bi bi-arrow-right ms-1" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ClassroomWeekPage;
