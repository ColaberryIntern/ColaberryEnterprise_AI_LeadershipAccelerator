import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  InternProjectSize, IntakeQuestion, IntakeQuestionsResponse, InternProjectBuildView,
  internProjectQuestions, generateInternProject, internProjectBuild, assignInternProject,
} from '../../../services/adminInternshipApi';
import RequirementCoveragePanel from './RequirementCoveragePanel';

/**
 * Assign an intern a project by generating it.
 *
 * Ali, 2026-09-28: "We will never build projects like this, one story at a
 * time. We do not create manually. This is where I need to put my idea process
 * in here. The same process that already exists for creating projects."
 *
 * Three steps, and the middle one is the one people want to skip:
 *
 *   1. the idea
 *   2. the sharpening interview
 *   3. read what came back, then assign it
 *
 * Step 2 is why the output is any good. The pipeline's own isolation study:
 * with no interview a generated plan named the student's real systems 0 times
 * out of 14 and carried their stated guardrail 0 of 6; with it, 14/14 and 6/6.
 * An idea box with a Generate button beside it would be the fast path AND the
 * weak plans. So the questions are not skippable here — they are answerable
 * tersely, which is a different thing.
 *
 * Nothing reaches the intern until step 3. The build is generated with a review
 * hold, rests at `drafted`, and Assign is what publishes it.
 */

const SIZES: Array<{ key: InternProjectSize; label: string; hint: string }> = [
  { key: 'workflow', label: 'Workflow', hint: '3 releases · 8-12 requirements' },
  { key: 'project', label: 'Project', hint: '5 releases · 18-24 requirements' },
  { key: 'autonomous', label: 'Autonomous', hint: '7 releases · 30-40 requirements' },
];

/** Statuses where generation is still running and polling should continue. */
const RUNNING = ['generating', 'captured'];

const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' };

type Step = 'idea' | 'questions' | 'review';

const InternshipProjectGenerator: React.FC<{
  applicationId: string;
  onAssigned: () => void;
  onManual: () => void;
}> = ({ applicationId, onAssigned, onManual }) => {
  const [step, setStep] = useState<Step>('idea');
  const [idea, setIdea] = useState('');
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState<InternProjectSize>('project');

  const [questions, setQuestions] = useState<IntakeQuestionsResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [build, setBuild] = useState<InternProjectBuildView | null>(null);
  const [generating, setGenerating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Polling has to stop when this unmounts, or a reviewer who navigates away
  // leaves an interval calling a dead component for as long as the tab lives.
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => () => {
    aliveRef.current = false;
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      const res = await internProjectQuestions(applicationId, { idea, size, name: name || null });
      setQuestions(res);
      setStep('questions');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not generate the questions.');
    } finally {
      setAsking(false);
    }
  };

  const poll = useCallback(async (pid: string) => {
    if (!aliveRef.current) return;
    try {
      const view = await internProjectBuild(applicationId, pid);
      if (!aliveRef.current) return;
      setBuild(view);
      if (view.status && RUNNING.includes(view.status)) {
        pollRef.current = setTimeout(() => poll(pid), 5000);
      } else {
        setGenerating(false);
      }
    } catch (err: any) {
      if (!aliveRef.current) return;
      setGenerating(false);
      setError(err?.response?.data?.error ?? 'Lost track of the generation. Reload to see where it got to.');
    }
  }, [applicationId]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    setStep('review');
    try {
      const started = await generateInternProject(applicationId, {
        idea,
        size,
        name: name || null,
        industry: industry || null,
        answers: (questions?.questions ?? [])
          .map((q) => ({ id: q.id, question: q.question, answer: (answers[q.id] ?? '').trim(), angle: q.angle }))
          .filter((a) => a.answer),
        covered: questions?.covered,
      });
      setProjectId(started.project_id);
      void poll(started.project_id);
    } catch (err: any) {
      setGenerating(false);
      setError(err?.response?.data?.error ?? 'Could not start the generation.');
    }
  };

  const assign = async () => {
    if (!projectId) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await assignInternProject(applicationId, {
        project_id: projectId,
        // The hash of the plan actually on screen. Publish refuses on a
        // mismatch, so a regeneration between reading and assigning cannot ship
        // a plan nobody reviewed.
        expected_sha256: build?.plan_sha256 ?? null,
      });
      setNote(res.status === 'awaiting_repo'
        ? 'Assigned. No repo is connected, so the documents were not committed; the tasks are on their Projects page.'
        : 'Assigned. The intern can see it on their Projects page.');
      onAssigned();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not assign the project.');
    } finally {
      setAssigning(false);
    }
  };

  const answeredCount = (questions?.questions ?? []).filter((q) => (answers[q.id] ?? '').trim()).length;
  const plan = build?.plan ?? null;
  const canAssign = !!plan && (build?.blocking.length ?? 0) === 0 && !build?.assigned;

  return (
    <div className="mt-2 pt-2" style={{ borderTop: '1px solid #f1f3f5' }}>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
        <span className="text-muted" style={eyebrow}>Assign a project</span>
        <button type="button" className="btn btn-sm btn-link p-0" style={{ fontSize: 12.5 }} onClick={onManual}>
          Author manually instead
        </button>
      </div>

      {error && <div className="alert alert-danger py-2" role="alert" style={{ fontSize: 13 }}>{error}</div>}
      {note && <div className="alert alert-success py-2" role="status" style={{ fontSize: 13 }}>{note}</div>}

      {/* ── 1. the idea ───────────────────────────────────────────────────── */}
      {step === 'idea' && (
        <div className="d-flex flex-column gap-2">
          <label className="form-label mb-0" style={{ fontSize: 12.5, fontWeight: 600 }}>
            What is the project?
          </label>
          <textarea
            className="form-control form-control-sm"
            rows={3}
            style={{ fontSize: 13 }}
            placeholder="One or two sentences. What it does, who uses it, and what it has to get right."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
          <div className="d-flex flex-wrap gap-2">
            <input
              type="text" className="form-control form-control-sm" style={{ maxWidth: 260, fontSize: 13 }}
              placeholder="Project name (optional)" value={name} onChange={(e) => setName(e.target.value)}
            />
            <input
              type="text" className="form-control form-control-sm" style={{ maxWidth: 200, fontSize: 13 }}
              placeholder="Industry (optional)" value={industry} onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div className="d-flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button
                key={s.key} type="button"
                className={`btn btn-sm ${size === s.key ? 'btn-dark' : 'btn-outline-secondary'}`}
                onClick={() => setSize(s.key)} title={s.hint}
              >
                {s.label}
              </button>
            ))}
            <span className="text-muted align-self-center" style={{ fontSize: 12 }}>
              {SIZES.find((s) => s.key === size)?.hint}
            </span>
          </div>
          <div>
            <button
              type="button" className="btn btn-sm btn-primary"
              disabled={idea.trim().length < 20 || asking}
              onClick={ask}
            >
              {asking ? 'Reading the idea…' : 'Next: sharpen it'}
            </button>
            {idea.trim().length > 0 && idea.trim().length < 20 && (
              <span className="text-muted ms-2" style={{ fontSize: 12 }}>A sentence or two, please.</span>
            )}
          </div>
        </div>
      )}

      {/* ── 2. the sharpening interview ───────────────────────────────────── */}
      {step === 'questions' && questions && (
        <div className="d-flex flex-column gap-2">
          {!questions.generated && (
            <div className="alert alert-warning py-2 mb-0" role="alert" style={{ fontSize: 12.5 }}>
              These are the generic questions: the model could not read your idea. A plan built on them is
              measurably weaker, so it is worth retrying before you generate.
            </div>
          )}
          <p className="text-muted mb-1" style={{ fontSize: 12.5 }}>
            Short answers are fine. This is the step that makes the plan name the real system instead of a
            generic one.
          </p>
          {questions.questions.map((q: IntakeQuestion) => (
            <div key={q.id}>
              <label className="form-label mb-0" style={{ fontSize: 12.5, fontWeight: 600 }}>{q.question}</label>
              {q.why && <div className="text-muted" style={{ fontSize: 11.5, marginBottom: 2 }}>{q.why}</div>}
              <textarea
                className="form-control form-control-sm"
                rows={2}
                style={{ fontSize: 13 }}
                placeholder={q.placeholder}
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              />
            </div>
          ))}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setStep('idea')}>
              Back
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={generate} disabled={generating}>
              Generate the plan
            </button>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {answeredCount} of {questions.questions.length} answered
            </span>
          </div>
        </div>
      )}

      {/* ── 3. read it, then assign ───────────────────────────────────────── */}
      {step === 'review' && (
        <div className="d-flex flex-column gap-2">
          {generating && (
            <div className="d-flex align-items-center gap-2" style={{ fontSize: 13 }}>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              <span>Generating. This takes a few minutes, and the intern cannot see anything yet.</span>
            </div>
          )}

          {build?.status === 'failed' && (
            <div className="alert alert-danger py-2 mb-0" role="alert" style={{ fontSize: 13 }}>
              Generation failed. Nothing was assigned; start again from the idea.
            </div>
          )}

          {(build?.blocking.length ?? 0) > 0 && (
            <div className="alert alert-warning py-2 mb-0" role="alert" style={{ fontSize: 12.5 }}>
              <strong>This plan cannot be assigned yet.</strong>
              <ul className="mb-0 mt-1" style={{ paddingLeft: 18 }}>
                {build!.blocking.map((v, i) => <li key={`${v.rule}-${i}`}>{v.message}</li>)}
              </ul>
              <div className="mt-1">Usually the brief is too thin. Go back and sharpen the answers.</div>
            </div>
          )}

          {plan && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{plan.project_name}</div>
              <div className="text-muted mb-2" style={{ fontSize: 12.5 }}>
                {plan.descriptor} · {plan.requirements.length} requirements · {plan.releases.length} releases · {plan.stories.length} stories
                {build?.version ? ` · v${build.version}` : ''}
              </div>
              <div className="d-flex flex-column gap-2">
                {plan.releases.map((rel) => {
                  const stories = plan.stories.filter((s) => s.release === rel.key);
                  return (
                    <div key={rel.key} style={{ border: '1px solid #e9ecef', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {rel.name} <span className="text-muted" style={{ fontWeight: 400 }}>· {stories.length} stories · weeks {rel.week_start}-{rel.week_end}</span>
                      </div>
                      {rel.goal && <div className="text-muted" style={{ fontSize: 12 }}>{rel.goal}</div>}
                      <ul className="mb-0 mt-1" style={{ paddingLeft: 18, fontSize: 12.5 }}>
                        {stories.map((s) => (
                          <li key={s.id}>
                            <span style={{ fontWeight: 600 }}>{s.id}</span> {s.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(build?.advisory.length ?? 0) > 0 && (
            <details style={{ fontSize: 12.5 }}>
              <summary className="text-muted">{build!.advisory.length} advisory note(s) — these do not stop an assignment</summary>
              <ul className="mb-0 mt-1" style={{ paddingLeft: 18 }}>
                {build!.advisory.map((v, i) => <li key={`${v.rule}-${i}`}>{v.message}</li>)}
              </ul>
            </details>
          )}

          {build?.coverage && (
            <RequirementCoveragePanel coverage={build.coverage} summary={build.coverage_summary} />
          )}

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button" className="btn btn-sm btn-success"
              disabled={!canAssign || assigning}
              onClick={assign}
            >
              {assigning ? 'Assigning…' : build?.assigned ? 'Already assigned' : 'Assign to intern'}
            </button>
            <button
              type="button" className="btn btn-sm btn-outline-secondary"
              disabled={generating || assigning}
              onClick={() => { setBuild(null); setProjectId(null); setStep('questions'); }}
            >
              Change the answers and regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InternshipProjectGenerator;
