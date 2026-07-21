import React, { useState } from 'react';
import './portal/today/TodayShell.css';
import CompanyMomentumDashboard from '../components/capability/CompanyMomentumDashboard';
import { registerOrg, persistParticipantSession } from '../services/orgApi';

/**
 * ManagementPreviewPage (/try) — free preview of the enterprise MANAGEMENT
 * experience, shaped to the REAL metric schema the platform captures. One extra
 * "Your company" tab above "Your day". Company view = momentum dashboard + a team
 * accomplishments feed (real event types) + roster; click a person to drill into
 * the real signals: pre->post knowledge growth (runtime_assessment_attempts),
 * competency confidence (student_competency), Architect Readiness + promotion gaps
 * (student_level / builder_levels), evidence by type (evidence_records), XP by
 * stream (xp_events), streak/attendance, and weekly AI architect eval.
 *
 * Front-end only: sample data in the real shape. Live data needs the Phase-2
 * manager/org rollup endpoints (none exist yet).
 */

const Ic = {
  company: <svg viewBox="0 0 24 24" fill="none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M12 9h.01M15 9h.01M9 13h.01M12 13h.01M15 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  today: <svg viewBox="0 0 24 24" fill="none"><path d="M3 12 12 4l9 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  path: <svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="6" r="2.4" stroke="currentColor" strokeWidth="2" /><circle cx="19" cy="18" r="2.4" stroke="currentColor" strokeWidth="2" /><path d="M5 8.4c0 5 7 2 7 7s7 0 7 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  cal: <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  proj: <svg viewBox="0 0 24 24" fill="none"><path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>,
  class: <svg viewBox="0 0 24 24" fill="none"><path d="M3 8l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
  people: <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="2" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16 7a3 3 0 0 1 0 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
};

interface Member {
  name: string; team: string; level: string; rank: number; readiness: number; streak: number; builderXpWeek: number; wkDelta: string;
  nextLevel: string; eta: string; last: string; moved: string; gh7d: number;
  gaps: string[]; xp: { learning: number; builder: number; community: number };
  evidence: { total: number; github: number; artifacts: number; implementation: number; evaluations: number };
  comps: { d: string; c: number }[]; projects: { name: string; stage: string }[];
  growth: { wk: string; pre: number; post: number }[]; evalTrend: number[];
  trend: number[]; projected: number[]; att: { present: number; total: number };
}

const TEAM: Member[] = [
  { name: 'Ava Rivera', team: 'Operations', level: 'Architect', rank: 8, readiness: 92, streak: 12, builderXpWeek: 210, wkDelta: '+34 XP',
    nextLevel: 'Architect (max)', eta: 'at max', last: 'Deployed: Ops exception router', moved: 'Promoted to Architect 2 weeks ago', gh7d: 14,
    gaps: [], xp: { learning: 320, builder: 640, community: 90 }, evidence: { total: 11, github: 5, artifacts: 3, implementation: 2, evaluations: 4 },
    comps: [{ d: 'Prompt engineering', c: 0.88 }, { d: 'Agents & tool use', c: 0.82 }, { d: 'Evaluation & testing', c: 0.79 }, { d: 'Deployment & ops', c: 0.74 }],
    projects: [{ name: 'Ops exception router', stage: 'complete' }, { name: 'Invoice triage agent', stage: 'portfolio' }],
    growth: [{ wk: 'Wk 6', pre: 68, post: 86 }, { wk: 'Wk 7', pre: 74, post: 90 }, { wk: 'Wk 8', pre: 80, post: 94 }], evalTrend: [74, 82, 88],
    trend: [70, 74, 80, 84, 88, 92], projected: [92, 94, 96], att: { present: 11, total: 12 } },
  { name: 'Kenji Ito', team: 'Finance', level: 'Architect Candidate', rank: 7, readiness: 78, streak: 9, builderXpWeek: 180, wkDelta: '+28 XP',
    nextLevel: 'Architect', eta: 'Sep 2026', last: 'Completed: Evidence pack v2', moved: 'Readiness up 18 pts this month', gh7d: 9,
    gaps: ['evidence: 2 < 3', 'ai_approval: pending'], xp: { learning: 280, builder: 520, community: 60 }, evidence: { total: 8, github: 4, artifacts: 2, implementation: 1, evaluations: 3 },
    comps: [{ d: 'Prompt engineering', c: 0.8 }, { d: 'Context engineering', c: 0.72 }, { d: 'Evaluation & testing', c: 0.68 }, { d: 'Safety & governance', c: 0.55 }],
    projects: [{ name: 'Close-process assistant', stage: 'implementation' }], growth: [{ wk: 'Wk 6', pre: 60, post: 74 }, { wk: 'Wk 7', pre: 66, post: 80 }, { wk: 'Wk 8', pre: 70, post: 84 }], evalTrend: [64, 72, 78],
    trend: [64, 68, 71, 74, 76, 78], projected: [78, 82, 86], att: { present: 9, total: 10 } },
  { name: 'Jordan Park', team: 'Finance', level: 'Developer', rank: 3, readiness: 44, streak: 6, builderXpWeek: 160, wkDelta: '+22 XP',
    nextLevel: 'Senior Developer', eta: 'Oct 2026', last: 'Completed: Multi-agent orchestration lab', moved: 'Builder XP up 34% vs last month', gh7d: 6,
    gaps: ['github: 1 < 2', 'implementation: 0 < 1', 'competency prompt_engineering: 0.36 < 0.4'], xp: { learning: 190, builder: 300, community: 40 }, evidence: { total: 4, github: 1, artifacts: 1, implementation: 0, evaluations: 2 },
    comps: [{ d: 'Prompt engineering', c: 0.36 }, { d: 'Agents & tool use', c: 0.48 }, { d: 'Evaluation & testing', c: 0.42 }, { d: 'Deployment & ops', c: 0.2 }],
    projects: [{ name: 'Reconciliation helper', stage: 'architecture' }], growth: [{ wk: 'Wk 6', pre: 40, post: 52 }, { wk: 'Wk 7', pre: 45, post: 60 }, { wk: 'Wk 8', pre: 50, post: 66 }], evalTrend: [48, 55, 61],
    trend: [30, 34, 38, 41, 43, 44], projected: [44, 52, 60], att: { present: 8, total: 10 } },
  { name: 'Maya Osei', team: 'Marketing', level: 'Developer', rank: 3, readiness: 38, streak: 5, builderXpWeek: 145, wkDelta: '+19 XP',
    nextLevel: 'Senior Developer', eta: 'Nov 2026', last: 'Shipped: Campaign-brief generator', moved: 'Shipped first project this week', gh7d: 4,
    gaps: ['evidence: 2 < 3', 'attendance: 0 < 1'], xp: { learning: 210, builder: 240, community: 55 }, evidence: { total: 2, github: 0, artifacts: 1, implementation: 1, evaluations: 1 },
    comps: [{ d: 'Prompt engineering', c: 0.5 }, { d: 'Context engineering', c: 0.44 }, { d: 'Content generation', c: 0.62 }, { d: 'Evaluation & testing', c: 0.3 }],
    projects: [{ name: 'Campaign-brief generator', stage: 'portfolio' }], growth: [{ wk: 'Wk 6', pre: 34, post: 46 }, { wk: 'Wk 7', pre: 38, post: 52 }, { wk: 'Wk 8', pre: 42, post: 58 }], evalTrend: [40, 49, 55],
    trend: [26, 29, 32, 35, 37, 38], projected: [38, 46, 55], att: { present: 7, total: 10 } },
  { name: 'Rahul Ahmed', team: 'Operations', level: 'Practitioner', rank: 2, readiness: 31, streak: 7, builderXpWeek: 130, wkDelta: '+16 XP',
    nextLevel: 'Developer', eta: 'Nov 2026', last: 'Completed: Guardrails & evals', moved: '7-day build streak', gh7d: 5,
    gaps: ['evidence: 1 < 3', 'evaluations: 1 < 2'], xp: { learning: 160, builder: 180, community: 30 }, evidence: { total: 1, github: 1, artifacts: 0, implementation: 0, evaluations: 1 },
    comps: [{ d: 'Prompt engineering', c: 0.42 }, { d: 'Automation design', c: 0.5 }, { d: 'Evaluation & testing', c: 0.28 }, { d: 'Deployment & ops', c: 0.18 }],
    projects: [{ name: 'Shift-handoff summarizer', stage: 'implementation' }], growth: [{ wk: 'Wk 6', pre: 26, post: 38 }, { wk: 'Wk 7', pre: 30, post: 44 }, { wk: 'Wk 8', pre: 33, post: 48 }], evalTrend: [34, 42, 48],
    trend: [22, 25, 27, 29, 30, 31], projected: [31, 39, 48], att: { present: 9, total: 10 } },
  { name: 'Sana Kaur', team: 'Support', level: 'Junior Builder', rank: 1, readiness: 12, streak: 3, builderXpWeek: 95, wkDelta: '+12 XP',
    nextLevel: 'Practitioner', eta: 'Sep 2026', last: 'Completed: Prompt patterns', moved: 'Most improved this week', gh7d: 2,
    gaps: ['evidence: 0 < 2', 'github: 0 < 1'], xp: { learning: 120, builder: 60, community: 25 }, evidence: { total: 0, github: 0, artifacts: 0, implementation: 0, evaluations: 1 },
    comps: [{ d: 'Prompt engineering', c: 0.34 }, { d: 'AI literacy', c: 0.5 }, { d: 'Context engineering', c: 0.2 }, { d: 'Evaluation & testing', c: 0.12 }],
    projects: [{ name: 'Starting first build', stage: 'discovery' }], growth: [{ wk: 'Wk 6', pre: 8, post: 20 }, { wk: 'Wk 7', pre: 11, post: 28 }, { wk: 'Wk 8', pre: 14, post: 34 }], evalTrend: [18, 26, 34],
    trend: [4, 6, 8, 10, 11, 12], projected: [12, 22, 34], att: { present: 8, total: 10 } },
  { name: 'Lia Gomez', team: 'Marketing', level: 'Builder', rank: 0, readiness: 4, streak: 1, builderXpWeek: 60, wkDelta: '+9 XP',
    nextLevel: 'Junior Builder', eta: 'Oct 2026', last: 'Completed: Onboarding', moved: 'Joined 3 days ago', gh7d: 0,
    gaps: ['evidence: 0 < 1', 'card completions: onboarding only'], xp: { learning: 60, builder: 0, community: 10 }, evidence: { total: 0, github: 0, artifacts: 0, implementation: 0, evaluations: 0 },
    comps: [{ d: 'AI literacy', c: 0.4 }, { d: 'Prompt engineering', c: 0.12 }, { d: 'Context engineering', c: 0.05 }, { d: 'Evaluation & testing', c: 0 }],
    projects: [{ name: 'Not started', stage: '—' }], growth: [{ wk: 'Wk 6', pre: 0, post: 0 }, { wk: 'Wk 7', pre: 0, post: 6 }, { wk: 'Wk 8', pre: 2, post: 12 }], evalTrend: [0, 6, 12],
    trend: [0, 1, 2, 3, 4, 4], projected: [4, 14, 26], att: { present: 3, total: 10 } },
];

interface Feat { who: string; kind: string; tone: string; text: string; when: string; }
const FEED: Feat[] = [
  { who: 'Ava Rivera', kind: 'Promotion', tone: '#E8920C', text: 'promoted to Architect (rank 8) — cleared the final evidence + AI-approval gate', when: 'Today' },
  { who: 'Maya Osei', kind: 'Artifact', tone: '#5BA63C', text: 'shipped a portfolio artifact: campaign-brief generator, +80 Builder XP', when: 'Today' },
  { who: 'Kenji Ito', kind: 'Evidence', tone: '#7A5AF0', text: 'logged validated evidence (github PR), 2 of 3 toward Architect', when: 'Yesterday' },
  { who: 'Jordan Park', kind: 'Evaluation', tone: '#367895', text: 'passed the Multi-agent evaluation (86%), knowledge up +16 vs pre-check', when: 'Yesterday' },
  { who: 'Rahul Ahmed', kind: 'Streak', tone: '#FB2832', text: 'hit a 7-day build streak', when: '2 days ago' },
  { who: 'Sana Kaur', kind: 'Growth', tone: '#2BA39A', text: 'most improved: pre-check 14 to evaluation 34 this week', when: '2 days ago' },
];

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const lvlTone = (rank: number): string => (rank >= 7 ? '#E8920C' : rank >= 3 ? '#5BA63C' : '#367895');

function Spark({ actual, projected }: { actual: number[]; projected: number[] }) {
  const W = 340, H = 96, pad = 8;
  const all = [...actual, ...projected.slice(1)];
  const min = Math.min(...all) - 3, max = Math.max(...all) + 3;
  const n = all.length;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - 2 * pad);
  const a = actual.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ps = actual.length - 1;
  const p = projected.map((v, i) => `${i ? 'L' : 'M'} ${x(ps + i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Velocity with projection">
      <path d={p} fill="none" stroke="#E8920C" strokeWidth="3" strokeDasharray="4 5" strokeLinecap="round" />
      <path d={a} fill="none" stroke="#5BA63C" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(actual.length - 1)} cy={y(actual[actual.length - 1])} r="5" fill="#5BA63C" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function ManagementPreviewPage() {
  const [view, setView] = useState<'company' | 'student'>('company');
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState('');
  const [invites, setInvites] = useState<{ email: string; team: string }[]>([]);

  // "Make this real" — the free-account registration modal. On success it stores
  // the returned participant JWT under the SAME key the portal uses and hands off
  // to the real, authed /portal/company page.
  const [showReg, setShowReg] = useState(false);
  const [regName, setRegName] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regBusy, setRegBusy] = useState(false);
  const [regErr, setRegErr] = useState<string | null>(null);
  const openReg = () => { setRegErr(null); setShowReg(true); };
  const submitReg = async () => {
    const name = regName.trim();
    const workEmail = regEmail.trim();
    if (!name) { setRegErr('Please enter your name.'); return; }
    if (!/\S+@\S+\.\S+/.test(workEmail)) { setRegErr('Please enter a valid work email.'); return; }
    setRegBusy(true); setRegErr(null);
    try {
      const res = await registerOrg({ name, company: regCompany.trim() || undefined, email: workEmail });
      persistParticipantSession(res.jwt);
      window.location.assign('/portal/company'); // full reload → auth context picks up the token
    } catch {
      setRegErr('We could not create your account. Please try again.');
      setRegBusy(false);
    }
  };
  const addInvite = () => {
    const e = email.trim();
    if (e && /\S+@\S+\.\S+/.test(e) && !invites.some((i) => i.email === e)) setInvites((p) => [...p, { email: e, team: team.trim() || 'Unassigned' }]);
    setEmail(''); setTeam('');
  };
  const openStudent = (name: string) => { setSelected(name); setView('company'); };
  const navBtn = (icon: React.ReactNode, label: string, target: 'company' | 'student', soon = false) => (
    <button type="button" className={`te-navbtn${view === target && !soon ? ' active' : ''}${soon ? ' is-soon' : ''}`}
      onClick={() => { if (soon) return; setSelected(null); setView(target); }} aria-disabled={soon || undefined}>
      <span className="ic">{icon}</span><span className="lb">{label}</span>{soon && <span className="te-soon">Soon</span>}
    </button>
  );

  const card: React.CSSProperties = { background: 'var(--surface-card)', border: 'var(--border-1) solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' };
  const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-h4)', color: 'var(--text-strong)', margin: '0 0 var(--space-1)' };
  const muted: React.CSSProperties = { fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', margin: 0 };
  const inputStyle: React.CSSProperties = { padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--fs-body)', border: 'var(--border-1) solid var(--border-default)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', color: 'var(--text-body)', background: 'var(--surface-card)' };
  const pillBtn: React.CSSProperties = { border: 'none', cursor: 'pointer', padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-pill)', fontWeight: 700, fontSize: 'var(--fs-body-sm)', background: 'var(--brand-accent)', color: '#fff' };
  const sub: React.CSSProperties = { fontSize: 'var(--fs-overline)', fontWeight: 700, letterSpacing: 'var(--ls-overline)', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' };

  const bar = (label: string, pct: number, color: string, right?: string) => (
    <div style={{ marginBottom: 'var(--space-3)' }} key={label + right}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-caption)', color: 'var(--text-body)' }}><span>{label}</span><span style={{ fontWeight: 700 }}>{right ?? `${pct}%`}</span></div>
      <div style={{ height: 7, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden' }}><div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 'var(--radius-pill)' }} /></div>
    </div>
  );

  const m = selected ? TEAM.find((x) => x.name === selected) ?? null : null;

  return (
    <div className="te-shell">
      <header className="te-top">
        <div className="te-brand"><img className="te-mark" src="/colaberry-icon.png" alt="Colaberry" /><div><b><span className="cc">C</span>olaberry</b><span>AI Systems Architect Accelerator</span></div></div>
        <div className="te-top-right">
          <div className="te-rail">
            <span className="te-cd class" title="Next class"><span className="ic">{Ic.class}</span><span className="tx"><span className="lbl">Next class</span><span className="when mono">3d 11h</span></span></span>
            <span className="te-cd event" title="Next event"><span className="ic">{Ic.cal}</span><span className="tx"><span className="lbl">Next event</span><span className="when mono">4d 3h</span></span></span>
          </div>
          <span className="te-avatar" title="Manager (preview)">NZ</span>
        </div>
      </header>

      <nav className="te-nav">
        <div className="grp">Your company</div>
        {navBtn(Ic.company, 'Your company', 'company')}
        <div className="grp">Your day</div>
        {navBtn(Ic.today, 'Today', 'student')}{navBtn(Ic.path, 'Path', 'student')}{navBtn(Ic.cal, 'Schedule', 'student')}
        <div className="grp">Build and learn</div>
        {navBtn(Ic.proj, 'Projects', 'student')}{navBtn(Ic.class, 'Classroom', 'student')}{navBtn(Ic.company, 'Cert Prep', 'student', true)}
        <div className="grp">Belong</div>
        {navBtn(Ic.people, 'Community', 'student')}
        <div className="te-presence"><div className="h"><span className="pdot" /> Acme Corp</div><div className="te-onrow" style={{ cursor: 'default' }}><span className="pmini">+</span> 7 members · sample data</div></div>
      </nav>

      <main className="te-main">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', background: 'var(--surface-brand-subtle)', border: 'var(--border-1) solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <span style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-body)' }}><strong>Free preview with sample data</strong>, shaped to the real metrics we capture. Your free account gives you both the learner experience and this management dashboard, no credit card. Create it to fill this with your team&rsquo;s live progress.</span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button type="button" onClick={openReg} style={{ ...pillBtn, padding: 'var(--space-2) var(--space-4)' }} data-track="try_make_real">Make this real: create your free account</button>
            <a href="#invite" style={{ ...pillBtn, padding: 'var(--space-2) var(--space-4)', textDecoration: 'none', background: 'var(--surface-subtle)', color: 'var(--text-body)' }}>Send free test invites</a>
          </div>
        </div>

        {view === 'student' ? (
          <div style={{ display: 'grid', gap: 'var(--space-6)', maxWidth: 760 }}>
            <div><div style={{ ...sub, color: 'var(--brand-accent)' }}>My learning</div><h1 style={{ ...h2, fontSize: 'var(--fs-h2)', fontWeight: 900 }}>Your own free student account</h1><p style={muted}>Your management account includes full student access, so you learn and build alongside your team. This is the experience your people get.</p></div>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}><span style={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: '50%', background: 'color-mix(in srgb, #5BA63C 16%, white)', color: 'var(--text-strong)', fontWeight: 800 }}>NZ</span><div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-h5)', color: 'var(--text-strong)' }}>Welcome back</div><span style={{ fontSize: 'var(--fs-caption)', color: '#fff', background: '#5BA63C', padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>Developer · 540 pts</span></div></div>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Architect Readiness · 44% (Evidence 1/3 · Implementation 0/1 · Attendance 1/1)</div>
              <div style={{ height: 10, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden', marginBottom: 'var(--space-5)' }}><div style={{ width: '44%', height: '100%', background: '#5BA63C', borderRadius: 'var(--radius-pill)' }} /></div>
              <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div style={{ padding: 'var(--space-4)', border: 'var(--border-1) solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}><div style={{ fontSize: 'var(--fs-caption)', color: '#367895', fontWeight: 700 }}>NEXT UP</div><div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Build a multi-agent workflow</div></div>
                <div style={{ padding: 'var(--space-4)', border: 'var(--border-1) solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}><div style={{ fontSize: 'var(--fs-caption)', color: '#FB2832', fontWeight: 700 }}>THIS WEEK</div><div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Architect office hours · Mon</div></div>
              </div>
            </div>
            <button type="button" style={{ ...pillBtn, justifySelf: 'start' }} onClick={() => setView('company')}>Back to your company view</button>
          </div>
        ) : m ? (
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            <button type="button" onClick={() => setSelected(null)} style={{ justifySelf: 'start', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-link)', fontWeight: 700, fontSize: 'var(--fs-body-sm)' }}>&larr; Back to your company</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 60, height: 60, borderRadius: '50%', background: `color-mix(in srgb, ${lvlTone(m.rank)} 16%, white)`, color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-h5)' }}>{initials(m.name)}</span>
              <div><h1 style={{ ...h2, fontSize: 'var(--fs-h2)', fontWeight: 900, margin: 0 }}>{m.name}</h1><div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}><span style={{ fontSize: 'var(--fs-caption)', color: '#fff', background: lvlTone(m.rank), padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>{m.level} · rank {m.rank}/8</span><span style={muted}>{m.team} · {m.readiness}% readiness · {m.streak}-day streak · <span style={{ color: '#5BA63C', fontWeight: 700 }}>{m.wkDelta} builder XP/wk</span></span></div></div>
            </div>

            <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }} className="try-cols">
              {/* knowledge growth (pre->post) */}
              <div style={{ ...card, borderTop: '4px solid #367895' }}>
                <div style={sub}>Knowledge growth · pre-check &rarr; evaluation</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${m.growth.length}, 1fr)`, gap: 'var(--space-4)', alignItems: 'end', height: 120 }}>
                  {m.growth.map((g) => (
                    <div key={g.wk} style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'end', justifyContent: 'center', height: 90 }}>
                        <div title={`pre ${g.pre}%`} style={{ width: 16, height: `${g.pre}%`, background: 'var(--border-strong)', borderRadius: 3 }} />
                        <div title={`post ${g.post}%`} style={{ width: 16, height: `${g.post}%`, background: '#5BA63C', borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>{g.wk} · <span style={{ color: '#5BA63C', fontWeight: 700 }}>+{g.post - g.pre}</span></div>
                    </div>
                  ))}
                </div>
                <p style={{ ...muted, marginTop: 'var(--space-2)', fontSize: 'var(--fs-caption)' }}>Grey = entry knowledge check, green = end-of-week evaluation. Growth is the real pre/post delta.</p>
              </div>

              {/* readiness + what's left */}
              <div style={{ ...card, borderTop: '4px solid #7A5AF0' }}>
                <div style={sub}>Architect readiness · {m.readiness}% → {m.nextLevel}</div>
                <div style={{ height: 10, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden', marginBottom: 'var(--space-4)' }}><div style={{ width: `${m.readiness}%`, height: '100%', background: '#7A5AF0', borderRadius: 'var(--radius-pill)' }} /></div>
                <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>What&rsquo;s left to promote ({m.eta})</div>
                {m.gaps.length ? m.gaps.map((g) => (<div key={g} style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-body)', padding: '4px 8px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: 4 }}>{g}</div>)) : <div style={{ fontSize: 'var(--fs-caption)', color: '#5BA63C', fontWeight: 700 }}>All gates cleared — top of the ladder.</div>}
                <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--fs-caption)', color: 'var(--text-body)' }}><strong>Last completed:</strong> {m.last}</div>
              </div>

              {/* competency confidence */}
              <div style={card}>
                <div style={sub}>Competency confidence</div>
                {m.comps.map((c) => bar(c.d, Math.round(c.c * 100), '#367895'))}
              </div>

              {/* building & evidence */}
              <div style={card}>
                <div style={sub}>Building &amp; evidence</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  {[['Evidence records', m.evidence.total], ['GitHub PRs/commits', m.evidence.github], ['Artifacts', m.evidence.artifacts], ['Evaluations passed', m.evidence.evaluations], ['Implementations', m.evidence.implementation], ['Commits (7d)', m.gh7d]].map(([l, v]) => (
                    <div key={l as string} style={{ background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2) var(--space-3)' }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-strong)' }}>{v as number}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l as string}</div></div>
                  ))}
                </div>
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>Projects: {m.projects.map((p) => `${p.name} (${p.stage})`).join(' · ')}</div>
              </div>

              {/* XP by stream + weekly eval */}
              <div style={card}>
                <div style={sub}>Skill XP by stream</div>
                {bar('Learning', Math.min(100, m.xp.learning / 4), '#367895', `${m.xp.learning} XP`)}
                {bar('Builder', Math.min(100, m.xp.builder / 7), '#5BA63C', `${m.xp.builder} XP`)}
                {bar('Community', Math.min(100, m.xp.community), '#2BA39A', `${m.xp.community} XP`)}
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>Weekly AI architect eval: {m.evalTrend.join(' → ')} · Attendance {m.att.present}/{m.att.total}</div>
              </div>

              {/* velocity + prediction */}
              <div style={{ ...card, borderTop: '4px solid #5BA63C' }}>
                <div style={sub}>Readiness velocity &amp; prediction</div>
                <Spark actual={m.trend} projected={m.projected} />
                <p style={{ ...muted, marginTop: 'var(--space-3)' }}><strong style={{ color: 'var(--text-strong)' }}>Trending up.</strong> {m.moved}. At this pace, on track for <strong style={{ color: '#E8920C' }}>{m.nextLevel}</strong> by <strong>{m.eta}</strong>.</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            <div><div style={{ ...sub, color: 'var(--brand-accent)' }}>Your company</div><h1 style={{ ...h2, fontSize: 'var(--fs-h2)', fontWeight: 900 }}>Acme Corp, on the rise in AI</h1><p style={muted}>Where you are, how fast you are moving, and when you reach the next level, from the real data your people earn every day. <a href="#" onClick={(e) => { e.preventDefault(); setView('student'); }} style={{ color: 'var(--text-link)', fontWeight: 600 }}>Your account also includes free student learning &rarr;</a></p></div>

            <CompanyMomentumDashboard />

            <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }} className="try-cols">
              <div style={card}>
                <h2 style={h2}>Team accomplishments</h2>
                <p style={{ ...muted, marginBottom: 'var(--space-5)' }}>Real events: promotions, validated evidence, evaluations passed, artifacts shipped, streaks. Click a name for the full picture.</p>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {FEED.map((f, i) => (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-4)', paddingBottom: i === FEED.length - 1 ? 0 : 'var(--space-5)' }}>
                      <button type="button" onClick={() => openStudent(f.who)} title={`Open ${f.who}`} style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', background: `color-mix(in srgb, ${lvlTone(TEAM.find((t) => t.name === f.who)?.rank ?? 0)} 16%, white)`, color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-caption)' }}>{initials(f.who)}</button>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => openStudent(f.who)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: 'var(--text-strong)', fontSize: 'var(--fs-body-sm)' }}>{f.who}</button>
                          <span style={{ fontSize: 'var(--fs-caption)', color: '#fff', background: f.tone, padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>{f.kind}</span>
                          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>· {f.when}</span>
                        </div>
                        <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-body)' }}>{f.text}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div style={card}>
                <h2 style={h2}>Where your team sits</h2>
                <p style={{ ...muted, marginBottom: 'var(--space-4)' }}>Builder level, Architect Readiness, and Builder-XP velocity. Click anyone to drill in.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {TEAM.map((mm) => (
                    <button key={mm.name} type="button" onClick={() => openStudent(mm.name)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'var(--space-3)', alignItems: 'center', textAlign: 'left', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', padding: 'var(--space-2)' }} onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface-subtle)'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}>
                      <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', background: `color-mix(in srgb, ${lvlTone(mm.rank)} 16%, white)`, color: 'var(--text-strong)', fontWeight: 800, fontSize: 11 }}>{initials(mm.name)}</span>
                      <div style={{ minWidth: 0 }}><div style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{mm.name}</div><div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{mm.team} · {mm.readiness}% ready · +{mm.builderXpWeek} bXP/wk</div></div>
                      <span style={{ fontSize: 'var(--fs-caption)', color: '#fff', background: lvlTone(mm.rank), padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>{mm.level}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div id="invite" style={{ ...card, borderTop: '4px solid #5BA63C' }}>
              <h2 style={h2}>Send free test invites to your employees</h2>
              <p style={{ ...muted, marginBottom: 'var(--space-4)' }}>Send free test invites so your team can try it too. Their progress appears on your dashboard as they go. Tag their team so it shows up in your reporting.</p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: invites.length ? 'var(--space-5)' : 0 }}>
                <input style={{ ...inputStyle, flex: 2, minWidth: 200 }} type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addInvite(); }} />
                <input style={{ ...inputStyle, flex: 1, minWidth: 140 }} type="text" placeholder="Team / department (optional)" value={team} onChange={(e) => setTeam(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addInvite(); }} />
                <button style={pillBtn} onClick={addInvite} data-track="try_invite_add">Send free test invite</button>
              </div>
              {invites.length > 0 && (<div><div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 'var(--space-2)' }}>{invites.length} invited · free member accounts</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>{invites.map((i) => (<span key={i.email} style={{ fontSize: 'var(--fs-caption)', background: 'var(--surface-green-subtle)', color: 'var(--status-success)', padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>{i.email} · {i.team}</span>))}</div></div>)}
              <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: 'var(--border-1) solid var(--border-subtle)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <a href="/pricing" data-track="try_activate_licenses" style={{ color: 'var(--text-link)', fontWeight: 700, fontSize: 'var(--fs-body-sm)', textDecoration: 'none' }}>Activate licenses for instant access &rarr;</a>
                <span style={{ ...muted, fontSize: 'var(--fs-caption)' }}>only when you are ready</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {showReg && (
        <div role="dialog" aria-modal="true" aria-label="Create your free account"
          onClick={() => { if (!regBusy) setShowReg(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 'var(--space-4)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(460px, 100%)', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ ...h2, fontSize: 'var(--fs-h3)' }}>Create your free account</h2>
            <p style={{ ...muted, marginBottom: 'var(--space-4)' }}>A free management account with your own student learning included. No credit card.</p>
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <input style={inputStyle} placeholder="Your name" value={regName} disabled={regBusy} autoFocus onChange={(e) => setRegName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitReg(); }} />
              <input style={inputStyle} placeholder="Company (optional)" value={regCompany} disabled={regBusy} onChange={(e) => setRegCompany(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitReg(); }} />
              <input style={inputStyle} type="email" placeholder="Work email" value={regEmail} disabled={regBusy} onChange={(e) => setRegEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitReg(); }} />
            </div>
            {regErr && <div style={{ color: 'var(--status-danger, #C20E1E)', fontSize: 'var(--fs-caption)', fontWeight: 700, marginTop: 'var(--space-3)' }}>{regErr}</div>}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)', justifyContent: 'flex-end' }}>
              <button type="button" style={{ ...pillBtn, background: 'var(--surface-subtle)', color: 'var(--text-body)' }} onClick={() => setShowReg(false)} disabled={regBusy}>Cancel</button>
              <button type="button" style={{ ...pillBtn, opacity: regBusy ? 0.7 : 1 }} onClick={submitReg} disabled={regBusy} data-track="try_register_submit">{regBusy ? 'Creating…' : 'Create free account'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@media (max-width: 860px){ .try-cols { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

export default ManagementPreviewPage;
