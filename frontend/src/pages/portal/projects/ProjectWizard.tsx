import React, { useState } from 'react';
import { NewBuildAnswers, BuildSize } from './projectsStore';
import { useIsExplorer } from '../useIsExplorer';
import { fetchIntakeQuestions, IntakeQuestion } from '../../../services/sbpApi';

// "Start a new build" — the questionnaire that shapes an idea into a project.
// Three steps: (1) idea + size, (2) interview questions generated from THAT
// idea, (3) review + confirm. On confirm it hands the answers up; the parent
// kicks off the background build.
//
// Step 2 used to ask three hardcoded questions, identical for every student and
// pre-filled with a support-inbox example — so a student building a warehouse
// robot was asked about their Zendesk. It now asks the server, which reads the
// idea and writes the questions. Step 3 used to render a fabricated plan (four
// invented requirements, three invented tasks) that called nothing; the real
// plan only exists minutes after Confirm, so step 3 now shows the student their
// own inputs and what actually happens next. Nothing here is presented as
// generated unless it was.

const SIZES: { key: BuildSize; title: string; time: string; desc: string }[] = [
  { key: 'workflow', title: 'A workflow', time: '~5 min', desc: 'A focused automation. Cory drafts a tailored requirements doc fast — no repo needed.' },
  { key: 'project', title: 'A full project', time: '~13 min', desc: 'The full build: requirements, an MCP server or app, reliability, and a showcase.' },
  { key: 'autonomous', title: 'Fully autonomous', time: '~21 min · deepest', desc: 'A complete agent system designed end to end, with a live preview as it builds.' },
];

const STEPS = ['Your idea', 'Sharpen it', 'Review & confirm'];

const ProjectWizard: React.FC<{ onCreate: (a: NewBuildAnswers) => void | Promise<void> }> = ({ onCreate }) => {
  const demo = useIsExplorer();
  const [step, setStep] = useState(1);
  const [idea, setIdea] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState<BuildSize>('project');
  const [weeks, setWeeks] = useState(6);

  // Step 2 is server-driven. `generated` false means the model was unreachable
  // and the server sent its generic set — usable, but we must not call it
  // tailored.
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [generated, setGenerated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  // Which idea the current questions were written for, so going Back and
  // Next again doesn't re-ask the server for the same thing.
  const [askedFor, setAskedFor] = useState<string | null>(null);

  const answered = questions
    .map((q) => ({ id: q.id, question: q.question, answer: (replies[q.id] || '').trim() }))
    .filter((a) => a.answer.length > 0);

  const answers: NewBuildAnswers = { idea, name, size, weeks, answers: answered };

  async function loadQuestions(force = false): Promise<void> {
    const current = idea.trim();
    if (!force && askedFor === current && questions.length > 0) return;
    setLoading(true);
    setError(null);
    const res = await fetchIntakeQuestions({ idea: current, size, name: name.trim() || undefined });
    setLoading(false);
    if (res.ok) {
      setQuestions(res.result.questions);
      setGenerated(res.result.generated !== false);
      setAskedFor(current);
    } else {
      // The server degrades internally, so a failure here means the request
      // never landed. Say so and let them retry or move on — never strand them.
      setError(res.error.message);
    }
  }

  function goSharpen(): void {
    setStep(2);
    void loadQuestions();
  }

  return (
    <div>
      <div className="pjw-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`pjw-step${i + 1 === step ? ' active' : i + 1 < step ? ' done' : ''}`}>
            <div className="n">{i + 1 < step ? '✓' : i + 1}</div>{s}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="card pjw-pane">
          <h3>What do you want to build?</h3>
          <p className="lead">Tell us everything — the whole idea, who it's for, what it should do, every capability and edge you can think of. Don't hold back or worry about being precise; the more you pour out here, the better we shape it. The next step reads what you wrote and asks you about it.</p>
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} style={{ minHeight: 240 }} placeholder={"e.g. An AI agent that triages my support inbox and drafts replies.\n\nGo further — what would make it great? Who uses it, what data would it touch, what should it automate, what would 'done' look like, what have you always wished existed? Brain-dump it all."} />
          <label className="pjw-label">Give it a name (optional)</label>
          <input className="txt" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank and we'll name it from your idea" />
          <label className="pjw-label">How big is what you're building?</label>
          <div className="pjw-sizes">
            {SIZES.map((sz) => (
              <button key={sz.key} type="button" className={`pjw-size${size === sz.key ? ' sel' : ''}`} onClick={() => setSize(sz.key)}>
                <span className="rb" />
                <span className="sz-b">
                  <span className="sz-t">{sz.title} <span className="sz-time">{sz.time}</span></span>
                  <span className="sz-d">{sz.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="pjw-actions">
            <button className="btn primary grow" disabled={idea.trim().length < 20} onClick={goSharpen}>Sharpen my idea
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {idea.trim().length > 0 && idea.trim().length < 20 && (
            <div className="small" style={{ marginTop: 8, color: '#B5710A' }}>A few more words and we can start asking about it.</div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card pjw-pane">
          <h3>A few questions to sharpen scope</h3>

          {loading && (
            <>
              <p className="lead">Reading your idea and writing questions about it…</p>
              <div className="small" style={{ opacity: .75 }}>This takes a few seconds.</div>
            </>
          )}

          {!loading && error && (
            <>
              <p className="lead" style={{ color: '#B5710A' }}>We couldn't reach the server to write your questions. {error}</p>
              <div className="pjw-actions">
                <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn ghost" onClick={() => { void loadQuestions(true); }}>Try again</button>
                <button className="btn primary grow" onClick={() => setStep(3)}>Continue without them</button>
              </div>
            </>
          )}

          {!loading && !error && (
            <>
              <p className="lead">
                {generated
                  ? 'These come from what you just wrote. Answer what you can — anything you skip, we infer.'
                  : 'Our standard scoping questions. Answer what you can — anything you skip, we infer.'}
              </p>
              {questions.map((q) => (
                <div key={q.id}>
                  <label className="pjw-label" htmlFor={`q-${q.id}`}>{q.question}</label>
                  {q.why && <div className="small" style={{ opacity: .75, margin: '-2px 0 6px' }}>{q.why}</div>}
                  <input
                    id={`q-${q.id}`}
                    className="txt"
                    value={replies[q.id] || ''}
                    placeholder={q.placeholder}
                    onChange={(e) => setReplies((r) => ({ ...r, [q.id]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="pjw-actions">
                <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn primary grow" onClick={() => setStep(3)}>Review &amp; confirm
                  <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="card pjw-pane">
          <h3>Review &amp; confirm</h3>
          <p className="lead">This is what we'll build from. Nothing has been generated yet — that starts when you confirm.</p>

          <div className="section-title" style={{ margin: '4px 0 10px' }}>Your idea</div>
          <div className="pjw-review">{idea.trim()}</div>

          {answered.length > 0 && (
            <>
              <div className="section-title" style={{ margin: '18px 0 10px' }}>What you told us</div>
              {answered.map((a) => (
                <div className="pjw-review" key={a.id}>
                  <div className="small" style={{ opacity: .75 }}>{a.question}</div>
                  <div>{a.answer}</div>
                </div>
              ))}
            </>
          )}

          <div className="section-title" style={{ margin: '18px 0 10px' }}>What happens next</div>
          <ol className="pjw-next">
            <li>Your requirements are written server-side from your idea and answers.</li>
            <li>They're broken into releases and tasks, then checked — every task has to trace back to a requirement.</li>
            <li>The tasks appear on your Path as a new branch. You can keep working while it builds.</li>
          </ol>

          <div className="section-title" style={{ margin: '18px 0 10px' }}>Timeline</div>
          <div className="pjw-tf">
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="pjw-label" style={{ marginTop: 0 }}>Finish this build in</label>
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {[4, 6, 8, 10].map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </div>
            <div className="small" style={{ flex: 1, minWidth: 160 }}>Due dates back-schedule from your target, around the fixed 12-week training. A new branch appears on your Path.</div>
          </div>

          {demo && <div className="small" style={{ margin: '4px 0 -2px', color: '#B5710A' }}>This is a demo — you can shape the whole build, but enroll to actually create it.</div>}
          <div className="pjw-actions">
            <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn primary grow" onClick={() => { void onCreate(answers); }} disabled={demo} title={demo ? 'Demo — enroll to build for real' : undefined}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg> {demo ? 'Enroll to build for real' : 'Confirm & build in background'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectWizard;
