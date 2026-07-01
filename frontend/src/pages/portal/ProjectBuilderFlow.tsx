import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReqDoc {
  technical_requirements: string[];
  non_functional_requirements: string[];
  error: string | null;
}

interface TaskItem { id: string; title: string; status: string; position: number }
interface TaskList { id: string; title: string; cluster: string; tasks: TaskItem[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Add project', 'Your idea', 'Sharpening', 'Requirements', 'Task list', 'Connect GitHub'];
const DONE = 6;

const LOOP = [
  { label: 'Add project',   sub: 'Name + Project DNA',        icon: 'ri-folder-add-line' },
  { label: 'Your idea',     sub: 'Raw idea, your words',       icon: 'ri-lightbulb-line' },
  { label: '10 questions',  sub: 'Advisor sharpens it',        icon: 'ri-questionnaire-line' },
  { label: 'Requirements',  sub: '4-state, auto-verified',     icon: 'ri-file-text-line' },
  { label: 'Task list',     sub: 'Your CB-System queue',       icon: 'ri-list-check-2' },
  { label: 'Build + verify',sub: 'Push → verified → portfolio',icon: 'ri-git-branch-line' },
];

const READINESS = [0, 8, 20, 45, 62, 80, 92];
const READINESS_LABEL = ['Not started', 'Idea captured', 'Scoping', 'Requirements drafted', 'Tasks planned', 'Repo connected', 'Build in progress'];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  unmapped: { bg: 'var(--status-unmapped-bg)', color: 'var(--status-unmapped-text)', label: 'Unmapped' },
  matched:  { bg: 'var(--status-matched-bg)',  color: 'var(--status-matched-text)',  label: 'Matched'  },
  partial:  { bg: 'var(--status-partial-bg)',  color: 'var(--status-partial-text)',  label: 'Partial'  },
  verified: { bg: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', label: 'Verified' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Gauge({ pct }: { pct: number }) {
  const r = 31; const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 74, height: 74, flexShrink: 0 }}>
      <svg width="74" height="74" viewBox="0 0 74 74" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="37" cy="37" r={r} fill="none" stroke="var(--n100)" strokeWidth="8" />
        <circle cx="37" cy="37" r={r} fill="none" stroke="var(--leaf-action)" strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ - (circ * pct / 100)}
          style={{ transition: 'stroke-dashoffset .7s ease' }} />
      </svg>
      <strong style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono-de)', fontSize: 16 }}>{pct}%</strong>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.unmapped;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33`, borderRadius: 'var(--r-pill)', padding: '2px 9px', fontSize: 11, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjectBuilderFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState('');
  const [dnaChips, setDnaChips] = useState<string[]>([]);
  const [idea, setIdea] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [reqDoc, setReqDoc] = useState<ReqDoc | null>(null);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [loading, setLoading] = useState('');
  const [err, setErr] = useState('');

  // On mount: load DNA chips + github status, detect OAuth return
  useEffect(() => {
    (async () => {
      try {
        const [dnaRes, ghRes] = await Promise.all([
          portalApi.get('/api/portal/project-dna').catch(() => null),
          portalApi.get('/api/portal/github/status').catch(() => null),
        ]);
        if (dnaRes?.data) {
          const d = dnaRes.data;
          const chips: string[] = [];
          if (d.industry)      chips.push(`Industry · ${d.industry}`);
          if (d.projectTypes?.length) chips.push(`Type · ${d.projectTypes[0]}`);
          if (d.aiComponents?.length) chips.push(`AI · ${d.aiComponents.slice(0,2).join(' + ')}`);
          if (d.orientation)   chips.push(`Scope · ${d.orientation}`);
          if (d.industryTrack) chips.push(`Track · ${d.industryTrack}`);
          setDnaChips(chips);
        }
        if (ghRes?.data?.connected) {
          setGithubConnected(true);
          setGithubRepo(`${ghRes.data.repo_owner ?? ''}/${ghRes.data.repo_name ?? ''}`);
        }
      } catch { /* non-critical */ }

      // Return from GitHub OAuth — jump to GitHub step
      if (searchParams.get('github_connected') === '1') {
        setGithubConnected(true);
        setStep(5);
      }
    })();
  }, [searchParams]);

  // ── Navigation handlers ────────────────────────────────────────────────────

  const goNext = useCallback(async () => {
    setErr('');

    if (step === 1) {
      // Generate sharpening questions from idea
      if (!idea.trim()) { setErr('Describe your idea first.'); return; }
      setLoading('Generating questions…');
      try {
        const res = await portalApi.post('/api/portal/advisor/questions', { idea });
        setQuestions(res.data.questions ?? []);
        setAnswers(new Array(res.data.questions?.length ?? 0).fill(''));
        setCurrentQ(0);
        setStep(2);
      } catch { setErr('Could not generate questions. Please retry.'); }
      finally { setLoading(''); }
      return;
    }

    if (step === 2) {
      if (currentQ < questions.length - 1) { setCurrentQ(q => q + 1); return; }
      // Last question answered — generate requirements + kick off save job
      setLoading('Writing your requirements…');
      try {
        const qaPairs = questions.map((q, i) => ({ question: q, answer: answers[i] ?? '' }));
        const [docRes] = await Promise.all([
          portalApi.post('/api/portal/advisor/requirements', { idea, answers: qaPairs }),
          portalApi.post('/api/portal/project/requirements/generate', { idea, project_name: projectName, mode: 'professional' })
            .catch(() => { /* non-critical — project created on best-effort */ }),
        ]);
        setReqDoc(docRes.data);
        setStep(3);
      } catch { setErr('Could not generate requirements. Please retry.'); }
      finally { setLoading(''); }
      return;
    }

    if (step === 3) {
      // Load tasks before showing task screen
      setLoading('Loading tasks…');
      try {
        const res = await portalApi.get('/api/portal/project/tasks');
        setTaskLists(res.data.taskLists ?? []);
      } catch { /* non-critical — show empty */ }
      finally { setLoading(''); }
      setStep(4);
      return;
    }

    if (step < DONE) setStep(s => s + 1);
  }, [step, idea, questions, answers, currentQ, projectName]);

  const goPrev = useCallback(() => {
    setErr('');
    if (step === 2 && currentQ > 0) { setCurrentQ(q => q - 1); return; }
    if (step > 0) setStep(s => s - 1);
  }, [step, currentQ]);

  // ── Stepper bar ────────────────────────────────────────────────────────────

  const visStep = step === DONE ? STEP_LABELS.length : step;
  const StepperBar = (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '18px 22px 0', gap: 0 }}>
      {STEP_LABELS.map((label, i) => {
        const done = i < visStep; const active = i === visStep && step !== DONE;
        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 54 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--r-pill)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, border: `2px solid ${done ? 'var(--cherry)' : active ? 'var(--cherry)' : 'var(--n300)'}`, background: done ? 'var(--cherry)' : active ? 'var(--cherry-bg)' : '#fff', color: done ? '#fff' : active ? 'var(--cherry-text)' : 'var(--n300)', transition: 'all .2s' }}>
                {done ? <i className="ri-check-line" style={{ fontSize: 16 }} /> : i + 1}
              </div>
              <span style={{ fontSize: 10, marginTop: 5, textAlign: 'center', fontWeight: active ? 700 : 400, color: active ? 'var(--n900)' : 'var(--n300)', lineHeight: 1.2 }}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 2, marginTop: 16, background: i < visStep ? 'var(--cherry)' : 'var(--n300)', transition: 'background .2s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // ── Aside panel ────────────────────────────────────────────────────────────

  const pct = step === DONE ? READINESS[6] : READINESS[step] ?? 0;
  const Aside = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 84 }}>
      {/* Project card */}
      <div className="card border-0 shadow-sm p-3">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cherry-text)', marginBottom: 8 }}>Your project</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--n900)' }}>{projectName || 'Untitled project'}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 3 }}>{READINESS_LABEL[step === DONE ? 6 : step]}</div>
        {dnaChips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {dnaChips.slice(0, 3).map(chip => (
              <span key={chip} style={{ background: 'var(--berry-bg)', color: 'var(--berry-hover)', border: '1px solid #2e6a8633', borderRadius: 'var(--r-pill)', padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{chip}</span>
            ))}
          </div>
        )}
      </div>
      {/* Synced loop */}
      <div className="card border-0 shadow-sm p-3">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--color-text-light)', marginBottom: 12 }}>The synced loop</div>
        {LOOP.map((s, i) => {
          const done = i < (step === DONE ? 6 : step); const active = i === (step === DONE ? 5 : step);
          return (
            <div key={s.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: i < 5 ? 10 : 0, position: 'relative' }}>
              {i < 5 && <div style={{ position: 'absolute', left: 14, top: 28, bottom: 0, width: 2, background: done ? 'var(--leaf-action)' : 'var(--n200)' }} />}
              <span style={{ width: 28, height: 28, borderRadius: 'var(--r-pill)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, zIndex: 1, border: `2px solid ${done ? 'var(--leaf-action)' : active ? 'var(--cherry)' : 'var(--n300)'}`, background: done ? 'var(--leaf-action)' : active ? 'var(--cherry-bg)' : '#fff', color: done ? '#fff' : active ? 'var(--cherry-text)' : 'var(--n300)' }}>
                <i className={done ? 'ri-check-line' : s.icon} />
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: done || active ? 700 : 400, color: done || active ? 'var(--n900)' : 'var(--color-text-light)' }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{s.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Readiness gauge */}
      <div className="card border-0 shadow-sm p-3">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--color-text-light)', marginBottom: 12 }}>Project readiness</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Gauge pct={pct} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--n900)' }}>{READINESS_LABEL[step === DONE ? 6 : step]}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>Rises as requirements verify from your pushes.</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Screen renders ─────────────────────────────────────────────────────────

  function renderScreen() {
    // Done screen
    if (step === DONE) return (
      <div className="text-center py-4 px-3">
        <div style={{ width: 72, height: 72, borderRadius: 'var(--r-pill)', background: 'var(--leaf-bg)', color: 'var(--leaf-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 16px' }}>
          <i className="ri-check-line" />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Your project is live</h2>
        <p style={{ color: 'var(--color-text-light)', maxWidth: 460, margin: '0 auto 24px' }}>
          <strong>{projectName || 'Your project'}</strong> is set up with a requirements doc{taskLists.length > 0 ? `, ${taskLists.flatMap(l => l.tasks).length} tasks,` : ''} and a connected repo. Here's your next action.
        </p>
        <div className="card border-0 shadow-sm p-3 text-start mx-auto" style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cherry-text)', marginBottom: 8 }}>
            <i className="ri-focus-3-line me-1" /> Your one next action
          </div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Reference requirement keys in commit messages</div>
          <p style={{ fontSize: 13, color: 'var(--color-text-light)', marginBottom: 12 }}>Every time you push, requirements with matching keys flip to Verified automatically.</p>
          <pre style={{ background: 'var(--n900)', color: '#e4e4e3', borderRadius: 'var(--r-12)', padding: '14px 16px', fontFamily: 'var(--font-mono-de)', fontSize: 12.5, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
{`Open Claude Code in your repo and run:

"Scaffold ${projectName || 'your project'} based on the requirements doc already generated. Reference requirement keys (e.g. FUNC.001) in each commit message so the portal auto-verifies them. Add happy-path + failure + boundary tests. Keep all data inside the tenant boundary."`}
          </pre>
        </div>
        <button className="btn btn-sm mt-4" style={{ background: 'var(--cherry)', borderColor: 'var(--cherry)', color: '#fff', borderRadius: 'var(--r-pill)', padding: '10px 22px', fontWeight: 700 }} onClick={() => navigate('/portal/project/blueprint')}>
          <i className="ri-dashboard-3-line me-2" /> Go to my Command Center
        </button>
      </div>
    );

    // Step 0 — Add project
    if (step === 0) return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}><span style={{ width: 32, height: 32, borderRadius: 'var(--r-12)', background: 'var(--cherry)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 10, verticalAlign: 'middle' }}><i className="ri-folder-add-line" /></span>Add your project</h3>
        <p style={{ color: 'var(--color-text-light)', fontSize: 13, marginBottom: 20, paddingLeft: 44 }}>Name it. Your Project DNA is carried in from onboarding.</p>
        <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Project name <span style={{ color: 'var(--cherry)' }}>*</span></label>
        <input className="form-control" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Tier-1 Support Copilot" />
        {dnaChips.length > 0 && (
          <div style={{ background: 'var(--n50)', border: '1px solid var(--n200)', borderRadius: 'var(--r-16)', padding: '14px 16px', marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--n900)', marginBottom: 8 }}><i className="ri-fingerprint-line me-2" style={{ color: 'var(--cherry-text)' }} />Your Project DNA</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {dnaChips.map(chip => <span key={chip} style={{ background: 'var(--berry-bg)', color: 'var(--berry-hover)', border: '1px solid #2e6a8633', borderRadius: 'var(--r-pill)', padding: '4px 11px', fontSize: 12, fontWeight: 700 }}>{chip}</span>)}
            </div>
          </div>
        )}
      </div>
    );

    // Step 1 — Your idea
    if (step === 1) return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}><span style={{ width: 32, height: 32, borderRadius: 'var(--r-12)', background: 'var(--cherry)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 10, verticalAlign: 'middle' }}><i className="ri-lightbulb-line" /></span>Your idea</h3>
        <p style={{ color: 'var(--color-text-light)', fontSize: 13, marginBottom: 20, paddingLeft: 44 }}>In your own words — the problem, who it's for, and what it should do.</p>
        <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Describe what you want to build <span style={{ color: 'var(--cherry)' }}>*</span></label>
        <textarea className="form-control" rows={7} value={idea} onChange={e => setIdea(e.target.value)} placeholder="e.g. Our support team answers the same questions all day. I want an AI agent that reads our help docs and past tickets, drafts an answer, and only escalates when it isn't confident." />
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><i className="ri-sparkling-2-line" style={{ color: 'var(--cherry)' }} /> Next we'll generate ~10 sharpening questions from this idea.</div>
      </div>
    );

    // Step 2 — Sharpening questions
    if (step === 2 && questions.length > 0) return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}><span style={{ width: 32, height: 32, borderRadius: 'var(--r-12)', background: 'var(--cherry)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 10, verticalAlign: 'middle' }}><i className="ri-questionnaire-line" /></span>Sharpening questions</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingLeft: 44 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--n900)' }}>Question {currentQ + 1} of {questions.length}</span>
        </div>
        <div style={{ height: 5, background: 'var(--n100)', borderRadius: 'var(--r-pill)', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ height: '100%', background: 'var(--cherry)', width: `${((currentQ + 1) / questions.length) * 100}%`, borderRadius: 'var(--r-pill)', transition: 'width .3s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <span style={{ width: 34, height: 34, borderRadius: 'var(--r-pill)', background: 'var(--cherry-bg)', color: 'var(--cherry-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}><i className="ri-robot-2-line" /></span>
          <div style={{ background: 'var(--n50)', border: '1px solid var(--n200)', borderRadius: '4px 14px 14px 14px', padding: '12px 16px', fontWeight: 500, color: 'var(--n900)', fontSize: 15 }}>{questions[currentQ]}</div>
        </div>
        <textarea className="form-control" rows={4} value={answers[currentQ] ?? ''} onChange={e => { const a = [...answers]; a[currentQ] = e.target.value; setAnswers(a); }} placeholder="Your answer…" />
      </div>
    );

    // Step 3 — Requirements doc
    if (step === 3) return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}><span style={{ width: 32, height: 32, borderRadius: 'var(--r-12)', background: 'var(--cherry)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 10, verticalAlign: 'middle' }}><i className="ri-file-text-line" /></span>Your requirements document</h3>
        <p style={{ color: 'var(--color-text-light)', fontSize: 13, marginBottom: 16, paddingLeft: 44 }}>Generated from your answers. Status updates as your GitHub pushes are ingested.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 16, fontSize: 13, color: 'var(--color-text-light)' }}>
          Status engine: {(['unmapped','matched','partial','verified'] as const).map((s,i) => <React.Fragment key={s}><StatusChip status={s} />{i < 3 && <i className="ri-arrow-right-s-line" />}</React.Fragment>)}
        </div>
        {reqDoc && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-light)', marginBottom: 8 }}>Functional</div>
              {reqDoc.technical_requirements.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: '1px solid var(--n200)', borderRadius: 'var(--r-12)', padding: '10px 14px', marginBottom: 7 }}>
                  <span style={{ fontSize: 14 }}>{r}</span><StatusChip status="unmapped" />
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--color-text-light)', marginBottom: 8 }}>Non-functional</div>
              {reqDoc.non_functional_requirements.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: '1px solid var(--n200)', borderRadius: 'var(--r-12)', padding: '10px 14px', marginBottom: 7 }}>
                  <span style={{ fontSize: 14 }}>{r}</span><StatusChip status="unmapped" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );

    // Step 4 — Task list
    if (step === 4) return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}><span style={{ width: 32, height: 32, borderRadius: 'var(--r-12)', background: 'var(--cherry)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 10, verticalAlign: 'middle' }}><i className="ri-list-check-2" /></span>Your task list</h3>
        <p style={{ color: 'var(--color-text-light)', fontSize: 13, marginBottom: 20, paddingLeft: 44 }}>Built from your requirements — your personal CB-System queue.</p>
        {taskLists.length === 0
          ? <div style={{ background: 'var(--n50)', border: '1px solid var(--n200)', borderRadius: 'var(--r-16)', padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-light)', fontSize: 14 }}><i className="ri-loader-4-line me-2" />Tasks are being generated in the background and will appear here on your next visit.</div>
          : taskLists.map(list => (
            <div key={list.id} style={{ border: '1px solid var(--n200)', borderRadius: 'var(--r-16)', padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--n900)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><i className="ri-stack-line" style={{ color: 'var(--cherry)' }} />{list.title}</div>
              {list.tasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                  <span style={{ width: 18, height: 18, border: '2px solid var(--n300)', borderRadius: 'var(--r-4)', flexShrink: 0, background: t.status === 'complete' ? 'var(--leaf-action)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {t.status === 'complete' && <i className="ri-check-line" style={{ fontSize: 11, color: '#fff' }} />}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--n900)', textDecoration: t.status === 'complete' ? 'line-through' : 'none' }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-light)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="ri-user-line" /> You</span>
                </div>
              ))}
            </div>
          ))
        }
      </div>
    );

    // Step 5 — Connect GitHub
    if (step === 5) return (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}><span style={{ width: 32, height: 32, borderRadius: 'var(--r-12)', background: 'var(--cherry)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 10, verticalAlign: 'middle' }}><i className="ri-github-fill" /></span>Connect GitHub</h3>
        <p style={{ color: 'var(--color-text-light)', fontSize: 13, marginBottom: 20, paddingLeft: 44 }}>Link the repo you'll build in. Every push is ingested and requirements update automatically.</p>
        {githubConnected
          ? <div style={{ background: 'var(--leaf-bg)', border: '1px solid var(--leaf-action)33', borderRadius: 'var(--r-16)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <i className="ri-checkbox-circle-fill" style={{ fontSize: 24, color: 'var(--leaf-action)' }} />
              <div><div style={{ fontWeight: 700, color: 'var(--leaf-text)' }}>Repository connected</div><div style={{ fontSize: 13, color: 'var(--color-text-light)' }}>{githubRepo}</div></div>
            </div>
          : <div style={{ background: 'var(--n50)', border: '1px solid var(--n300)', borderRadius: 'var(--r-16)', padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--r-12)', background: 'var(--n900)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}><i className="ri-github-fill" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--n900)', fontSize: 15 }}>Authorize Colaberry on GitHub</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginTop: 2 }}>We request read access to the one repo you pick. You can revoke any time.</div>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--cherry)', color: '#fff', border: 'none', borderRadius: 'var(--r-pill)', padding: '9px 18px', fontWeight: 700, fontSize: 13, marginTop: 12, cursor: 'pointer' }}
                  onClick={async () => {
                    try {
                      const res = await portalApi.get('/api/portal/github/oauth/url');
                      window.location.href = res.data.url;
                    } catch { setErr('Could not start GitHub connection. Please retry.'); }
                  }}>
                  <i className="ri-link" /> Connect repository
                </button>
              </div>
            </div>
        }
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 6 }}><i className="ri-shield-check-line" style={{ color: 'var(--berry)', marginTop: 1, flexShrink: 0 }} /> Per-student data isolation: your repo, requirements, and tasks are scoped to your enrollment.</div>
      </div>
    );

    return null;
  }

  // ── Button labels ──────────────────────────────────────────────────────────

  function nextLabel() {
    if (step === 1)  return <><i className="ri-sparkling-2-line me-1" /> Generate my questions</>;
    if (step === 2 && currentQ < questions.length - 1) return <>Next question <i className="ri-arrow-right-line ms-1" /></>;
    if (step === 2)  return <>Write my requirements <i className="ri-arrow-right-line ms-1" /></>;
    if (step === 5)  return <><i className="ri-checkbox-circle-line me-1" /> Finish &amp; create project</>;
    return <>Next <i className="ri-arrow-right-line ms-1" /></>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--cherry-text)', marginBottom: 6 }}>Student Platform · Project Builder</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Build your project</h1>
        <p style={{ color: 'var(--color-text-light)', maxWidth: 640, marginBottom: 0 }}>Turn your idea into a requirements document and a task list. Your GitHub pushes flip requirements to <strong>Verified</strong> automatically.</p>
      </div>
      <div className="row g-4 align-items-start">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            {step !== DONE && StepperBar}
            <div style={{ padding: '24px 26px' }}>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-light)', fontSize: 14, marginBottom: 16 }}>
                  <div className="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true" />
                  {loading}
                </div>
              )}
              {err && <div className="alert alert-danger py-2 small mb-3"><i className="ri-error-warning-line me-2" />{err}</div>}
              {!loading && renderScreen()}
            </div>
            {step !== DONE && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 26px 22px' }}>
                <button className="btn btn-outline-secondary btn-sm" style={{ borderRadius: 'var(--r-pill)', visibility: step === 0 ? 'hidden' : 'visible' }} onClick={goPrev} disabled={!!loading}>
                  <i className="ri-arrow-left-line me-1" /> {step === 2 && currentQ > 0 ? 'Previous question' : 'Previous'}
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--cherry)', borderColor: 'var(--cherry)', color: '#fff', borderRadius: 'var(--r-pill)', padding: '8px 18px', fontWeight: 700 }} onClick={goNext} disabled={!!loading}>
                  {nextLabel()}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="col-lg-4 d-none d-lg-block">{Aside}</div>
      </div>
    </div>
  );
}
