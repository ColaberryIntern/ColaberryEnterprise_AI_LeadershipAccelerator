import React, { useState } from 'react';
import { NewBuildAnswers, BuildSize } from './projectsStore';
import { useIsExplorer } from '../useIsExplorer';

// "Start a new build" — the questionnaire that shapes an idea into a project.
// Three steps: (1) idea + size, (2) a few sharpening questions, (3) a generated
// plan preview. On confirm it hands the answers up; the parent kicks off the
// background build and shows the AI-tool preview.

const SIZES: { key: BuildSize; title: string; time: string; desc: string }[] = [
  { key: 'workflow', title: 'A workflow', time: '~5 min', desc: 'A focused automation. Cory drafts a tailored requirements doc fast — no repo needed.' },
  { key: 'project', title: 'A full project', time: '~13 min', desc: 'The full build: requirements, an MCP server or app, reliability, and a showcase.' },
  { key: 'autonomous', title: 'Fully autonomous', time: '~21 min · deepest', desc: 'A complete agent system designed end to end, with a live preview as it builds.' },
];

const STEPS = ['Your idea', 'Sharpen it', 'Your plan'];

const ProjectWizard: React.FC<{ onCreate: (a: NewBuildAnswers) => void }> = ({ onCreate }) => {
  const demo = useIsExplorer();
  const [step, setStep] = useState(1);
  const [idea, setIdea] = useState('An AI agent that triages my support inbox and drafts replies');
  const [name, setName] = useState('');
  const [size, setSize] = useState<BuildSize>('project');
  const [users, setUsers] = useState('Support reps at a 40-person SaaS');
  const [dataSources, setDataSources] = useState('Zendesk API, internal KB');
  const [done, setDone] = useState('Drafts are queued for human approval; it never auto-sends');
  const [weeks, setWeeks] = useState(6);

  const answers: NewBuildAnswers = { idea, name, size, users, dataSources, done, weeks };
  const primary = (dataSources.split(/[,;/]+/)[0] || 'your data').trim();

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
          <p className="lead">Tell us everything — the whole idea, who it's for, what it should do, every capability and edge you can think of. Don't hold back or worry about being precise; the more you pour out here, the better we shape it. The next step sharpens it with you.</p>
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
            <button className="btn primary grow" disabled={!idea.trim()} onClick={() => setStep(2)}>Sharpen my idea
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card pjw-pane">
          <h3>A few questions to sharpen scope</h3>
          <p className="lead">These shape your requirements and tasks. Edit the examples or keep them.</p>
          <label className="pjw-label">Who uses it?</label>
          <input className="txt" value={users} onChange={(e) => setUsers(e.target.value)} />
          <label className="pjw-label">What data sources must it connect to?</label>
          <input className="txt" value={dataSources} onChange={(e) => setDataSources(e.target.value)} />
          <label className="pjw-label">What does "done" look like? (this becomes your safety guardrail)</label>
          <input className="txt" value={done} onChange={(e) => setDone(e.target.value)} />
          <div className="pjw-actions">
            <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary grow" onClick={() => setStep(3)}>Generate my plan
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card pjw-pane">
          <h3>Your generated plan</h3>
          <p className="lead">From your idea and answers. On confirm, this build is assembled in the background — you can keep moving while it's created.</p>

          <div className="section-title" style={{ margin: '4px 0 10px' }}>Requirements</div>
          <div className="pjw-req"><span className="rbadge">FUNC</span><div>Core action via a Claude {size === 'workflow' ? 'workflow' : 'agent'}, grounded in {primary}.</div></div>
          <div className="pjw-req"><span className="rbadge">FUNC</span><div>Read-only connector to {primary}.</div></div>
          <div className="pjw-req"><span className="rbadge" style={{ background: 'rgba(91,166,60,.16)', color: '#468A2E' }}>SAFE</span><div>Guardrail: {done || 'human approval before any side effect'}.</div></div>
          <div className="pjw-req"><span className="rbadge" style={{ background: 'rgba(232,146,12,.16)', color: '#B5710A' }}>REL</span><div>Timeout + capped retries on the upstream call.</div></div>

          <div className="section-title" style={{ margin: '18px 0 10px' }}>Tasks &amp; timeline</div>
          <div className="pjw-tf">
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="pjw-label" style={{ marginTop: 0 }}>Finish this build in</label>
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {[4, 6, 8, 10].map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </div>
            <div className="small" style={{ flex: 1, minWidth: 160 }}>Due dates back-schedule from your target, around the fixed 12-week training. A new branch appears on your Path.</div>
          </div>
          <div className="pjw-gentask"><span className="chip" style={{ background: 'rgba(251,40,50,.12)', color: '#E5121D' }}><span className="sw" style={{ background: '#FB2832' }} />Task</span><div><b>Scaffold the {size === 'workflow' ? 'workflow' : 'MCP server'}</b></div></div>
          <div className="pjw-gentask"><span className="chip" style={{ background: 'rgba(251,40,50,.12)', color: '#E5121D' }}><span className="sw" style={{ background: '#FB2832' }} />Task</span><div><b>Implement the {primary} read tool</b></div></div>
          <div className="pjw-gentask"><span className="chip" style={{ background: 'rgba(251,40,50,.12)', color: '#E5121D' }}><span className="sw" style={{ background: '#FB2832' }} />Task</span><div><b>Add the safety guardrail + reliability</b></div></div>

          {demo && <div className="small" style={{ margin: '4px 0 -2px', color: '#B5710A' }}>This is a demo — you can shape the whole build, but enroll to actually create it.</div>}
          <div className="pjw-actions">
            <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn primary grow" onClick={() => onCreate(answers)} disabled={demo} title={demo ? 'Demo — enroll to build for real' : undefined}>
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg> {demo ? 'Enroll to build for real' : 'Confirm & build in background'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectWizard;
