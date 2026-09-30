import React, { useId } from 'react';
import type { OrgOverview } from '../../services/orgApi';

/**
 * CompanyMomentumDashboard — company view, shaped to the REAL metric schema the
 * platform captures: team Architect Readiness (student_level.architect_readiness),
 * Builder-XP velocity (xp_events, builder stream), evidence/projects shipped
 * (evidence_records / runtime_portfolio_artifacts), attendance (attendance_records),
 * evaluations passed (runtime_assessment_attempts), and the 9-level Builder ladder
 * distribution (builder_levels).
 *
 * Two modes, ONE visual:
 *   • No `overview` prop → illustrative sample constants (marketing pages, unchanged).
 *   • `overview` prop     → rendered from live `/api/portal/org/overview` data.
 * Both paths feed the same layout via a single `DashModel`, so the chart, tiles,
 * and ladder look identical regardless of source.
 */

// ── Sample constants (the default, marketing visual) ─────────────────────────
const XP_ACTUAL = [820, 910, 1040, 1180, 1290, 1420, 1510, 1640];
const XP_PROJECTED = [1640, 1780, 1920, 2080];

// 9-level Builder ladder (rank 0..8). Names are constant; counts vary by source.
const LADDER = ['Builder', 'Jr Builder', 'Practitioner', 'Developer', 'Sr Dev', 'Engineer', 'Sr Eng', 'Candidate', 'Architect'];
const LADDER_COUNTS = [1, 1, 1, 1, 1, 0, 0, 1, 1];
const LADDER_COLOR = (i: number): string => (i <= 2 ? '#367895' : i <= 5 ? '#5BA63C' : '#E8920C');

type Tile = { v: string; l: string; delta?: string; up?: boolean };

const SAMPLE_TILES: Tile[] = [
  { v: '63%', l: 'Avg Architect Readiness', delta: '+18 in 8 wks', up: true },
  { v: '1,640', l: 'Builder XP / week (velocity)', delta: '▲ 9% vs prior', up: true },
  { v: '12', l: 'Evidence shipped this week', delta: '▲ 4', up: true },
  { v: '17', l: 'Projects & artifacts shipped', delta: '+5 this week', up: true },
  { v: '86%', l: 'Live-session attendance', delta: '▲ 11 pts', up: true },
  { v: '9', l: 'Evaluations passed this month', delta: '▲ 4', up: true },
];

// ── The render model both modes produce ──────────────────────────────────────
interface DashModel {
  xpActual: number[];
  xpProjected: number[];        // [0] must equal xpActual's last value (line connects)
  ladderCounts: number[];       // length 9, indexed by rank 0..8
  score: string;                // big readiness number, e.g. "63%"
  scoreSub: string;
  badge: string;
  tiles: Tile[];
  yMin: number; yMax: number; gridlines: number[];
  nowLabel: string;             // annotation at the "now" point
  leftLabel: string;            // x-axis left label
  forecast: React.ReactNode;
}

function sampleModel(): DashModel {
  return {
    xpActual: XP_ACTUAL,
    xpProjected: XP_PROJECTED,
    ladderCounts: LADDER_COUNTS,
    score: '63%',
    scoreSub: '▲ +18 pts avg readiness in 8 weeks',
    badge: '▲ Accelerating · top 12% by velocity',
    tiles: SAMPLE_TILES,
    yMin: 600, yMax: 2200, gridlines: [800, 1400, 2000],
    nowLabel: 'now · 1,640',
    leftLabel: '8 wks ago',
    forecast: (
      <>
        <strong>Forecast:</strong> at your current Builder-XP velocity, <strong>3 members</strong> clear their
        next promotion gate by <strong>November 2026</strong>, adding an estimated <strong>2 new Architects</strong> and{' '}
        <strong>30+ shipped artifacts</strong>.
      </>
    ),
  };
}

function liveModel(o: OrgOverview): DashModel {
  const xpActual = o.builder_xp_by_week.length ? o.builder_xp_by_week.map((w) => Math.round(w.xp)) : [0];
  const n = xpActual.length;
  const last = xpActual[n - 1] ?? 0;
  const slope = n >= 2 ? (xpActual[n - 1] - xpActual[0]) / (n - 1) : 0;
  // 4-week straight-line projection; [0] anchored to the last actual so the dash connects.
  const xpProjected = [0, 1, 2, 3].map((k) => Math.max(0, Math.round(last + slope * k)));

  const all = [...xpActual, ...xpProjected];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi <= lo) hi = lo + 1;
  const pad = Math.max(1, (hi - lo) * 0.18);
  const yMin = Math.max(0, Math.floor(lo - pad));
  const yMax = Math.ceil(hi + pad);
  const gridlines = [0.25, 0.5, 0.75].map((f) => Math.round(yMin + f * (yMax - yMin)));

  const ladderCounts = Array.from({ length: 9 }, () => 0);
  for (const b of o.level_distribution) {
    if (b.rank >= 0 && b.rank < 9) ladderCounts[b.rank] = Number(b.count) || 0;
  }

  const members = o.member_count;
  const memberWord = members === 1 ? 'member' : 'members';
  const tiles: Tile[] = [
    { v: `${o.avg_readiness}%`, l: 'Avg Architect Readiness' },
    { v: last.toLocaleString(), l: 'Builder XP / week (velocity)' },
    { v: `${o.evidence_this_week}`, l: 'Evidence shipped this week' },
    { v: `${Math.round(o.attendance_rate * 100)}%`, l: 'Live-session attendance' },
    { v: `${o.evaluations_passed_this_month}`, l: 'Evaluations passed this month' },
    { v: `${o.level_ups_last_30d}`, l: 'Level-ups in last 30 days' },
  ];

  return {
    xpActual,
    xpProjected,
    ladderCounts,
    score: `${o.avg_readiness}%`,
    scoreSub: `Average across ${members} ${memberWord}`,
    badge: `${members} ${memberWord} · live data`,
    tiles,
    yMin, yMax, gridlines,
    nowLabel: `now · ${last.toLocaleString()}`,
    leftLabel: `${n} wk${n === 1 ? '' : 's'} ago`,
    forecast: (
      <>
        <strong>Forecast:</strong> {members} {memberWord} on your roster with{' '}
        <strong>{o.level_ups_last_30d} level-up{o.level_ups_last_30d === 1 ? '' : 's'}</strong> in the last 30 days.
        Keep the Builder-XP velocity climbing to move more of your team up the ladder to Architect.
      </>
    ),
  };
}

export default function CompanyMomentumDashboard({ overview }: { overview?: OrgOverview }) {
  const uid = useId().replace(/:/g, '');
  const m = overview ? liveModel(overview) : sampleModel();

  const VB_W = 720, VB_H = 250, padL = 48, padR = 90, padT = 20, padB = 34;
  const N = m.xpActual.length + m.xpProjected.length - 1;
  const yMin = m.yMin, yMax = m.yMax;
  const x = (i: number) => padL + (i * (VB_W - padL - padR)) / (N - 1 || 1);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (VB_H - padT - padB);
  const line = (pts: number[], s: number) => pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(s + i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const actualLine = line(m.xpActual, 0);
  const projLine = line(m.xpProjected, m.xpActual.length - 1);
  const areaPath = `${actualLine} L ${x(m.xpActual.length - 1).toFixed(1)} ${y(yMin).toFixed(1)} L ${x(0).toFixed(1)} ${y(yMin).toFixed(1)} Z`;
  const nowX = x(m.xpActual.length - 1), nowY = y(m.xpActual[m.xpActual.length - 1]);
  // Ladder timeline geometry
  const LW = 720, LH = 120, lpad = 45;
  const lx = (i: number) => lpad + (i * (LW - 2 * lpad)) / (LADDER.length - 1);

  return (
    <div className="cmd-root">
      <style>{`
        .cmd-root { background: var(--surface-card); border: var(--border-1) solid var(--border-subtle); border-radius: var(--radius-2xl); box-shadow: var(--shadow-lg); padding: var(--space-6); font-family: var(--font-body); }
        .cmd-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-5); }
        .cmd-eyebrow { font-size: var(--fs-overline); font-weight: 700; letter-spacing: var(--ls-overline); text-transform: uppercase; color: var(--brand-accent); }
        .cmd-title { font-family: var(--font-display); font-weight: 900; font-size: var(--fs-h4); color: var(--text-strong); margin: 0; }
        .cmd-badge { font-size: var(--fs-caption); font-weight: 700; color: #fff; background: #5BA63C; padding: 3px 12px; border-radius: var(--radius-pill); }
        .cmd-grid { display: grid; gap: var(--space-6); grid-template-columns: minmax(200px, 280px) 1fr; align-items: center; }
        .cmd-score { font-family: var(--font-display); font-weight: 900; font-size: 64px; line-height: 1; color: var(--text-strong); }
        .cmd-up { color: #5BA63C; font-weight: 800; font-size: var(--fs-body); }
        .cmd-svg { display: block; width: 100%; height: auto; min-width: 460px; }
        .cmd-scroll { overflow-x: auto; }
        .cmd-tiles { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-top: var(--space-6); }
        .cmd-tile { background: var(--surface-subtle); border: var(--border-1) solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-4); }
        .cmd-tv { font-family: var(--font-display); font-weight: 900; font-size: var(--fs-h4); color: var(--text-strong); line-height: 1.1; }
        .cmd-tl { font-size: var(--fs-caption); color: var(--text-muted); }
        .cmd-td { font-size: var(--fs-caption); font-weight: 700; margin-top: 2px; }
        .cmd-ladder { display: grid; grid-template-columns: repeat(9, 1fr); gap: 6px; align-items: end; margin-top: var(--space-6); }
        .cmd-lcol { text-align: center; }
        .cmd-lbar { background: var(--surface-sunken); border-radius: var(--radius-sm); display: flex; align-items: flex-end; justify-content: center; height: 60px; }
        .cmd-lfill { width: 100%; border-radius: var(--radius-sm); background: linear-gradient(180deg, #367895, #5BA63C); }
        .cmd-llabel { font-size: 9px; color: var(--text-subtle); margin-top: 4px; line-height: 1.1; }
        .cmd-lcount { font-size: var(--fs-caption); font-weight: 800; color: var(--text-strong); }
        @media (max-width: 720px) { .cmd-grid { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: no-preference) {
          .cmd-actual { stroke-dasharray: var(--cmd-len); stroke-dashoffset: var(--cmd-len); animation: cmdDraw 1300ms var(--ease-emphasized, cubic-bezier(0.16,1,0.3,1)) forwards; }
          .cmd-area { opacity: 0; animation: cmdFade 900ms ease 500ms forwards; }
        }
        @keyframes cmdDraw { to { stroke-dashoffset: 0; } }
        @keyframes cmdFade { to { opacity: 1; } }
      `}</style>

      <div className="cmd-head">
        <div>
          <div className="cmd-eyebrow">Architect Readiness trajectory</div>
          <h3 className="cmd-title">Your company, on the rise in AI</h3>
        </div>
        <span className="cmd-badge">{m.badge}</span>
      </div>

      <div className="cmd-grid">
        <div>
          <div className="cmd-score">{m.score}</div>
          <div className="cmd-up">{m.scoreSub}</div>
          <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', margin: 'var(--space-3) 0 0' }}>
            Average Architect Readiness across your team, from validated evidence, evaluations passed, and competency confidence. The line tracks Builder XP shipped per week.
          </p>
        </div>
        <div className="cmd-scroll">
          <svg className="cmd-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Team Builder XP per week rising, with a 4-week projection.">
            <defs>
              <linearGradient id={`cmdArea-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5BA63C" stopOpacity="0.28" /><stop offset="100%" stopColor="#5BA63C" stopOpacity="0" /></linearGradient>
              <linearGradient id={`cmdLine-${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#367895" /><stop offset="100%" stopColor="#5BA63C" /></linearGradient>
            </defs>
            {m.gridlines.map((g) => (<g key={g}><line x1={padL} y1={y(g)} x2={VB_W - padR} y2={y(g)} stroke="var(--border-subtle)" strokeWidth="1" /><text x={padL - 8} y={y(g) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--text-subtle)' }}>{g.toLocaleString()}</text></g>))}
            <path className="cmd-area" d={areaPath} fill={`url(#cmdArea-${uid})`} />
            <path d={projLine} fill="none" stroke="#E8920C" strokeWidth="3" strokeDasharray="4 6" strokeLinecap="round" />
            <path className="cmd-actual" d={actualLine} fill="none" stroke={`url(#cmdLine-${uid})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" ref={(el) => { if (el) el.style.setProperty('--cmd-len', `${el.getTotalLength()}`); }} />
            <circle cx={nowX} cy={nowY} r="6" fill="#5BA63C" stroke="var(--surface-card)" strokeWidth="3" />
            <text x={nowX} y={nowY - 12} textAnchor="middle" style={{ fontSize: 11, fontWeight: 800, fill: 'var(--text-strong)' }}>{m.nowLabel}</text>
            <text x={x(N - 1)} y={y(m.xpProjected[m.xpProjected.length - 1]) - 12} textAnchor="end" style={{ fontSize: 11, fontWeight: 800, fill: '#E8920C' }}>projected</text>
            <text x={padL} y={VB_H - 8} style={{ fontSize: 11, fill: 'var(--text-subtle)' }}>{m.leftLabel}</text>
            <text x={nowX} y={VB_H - 8} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-subtle)' }}>this week</text>
            <text x={x(N - 1)} y={VB_H - 8} textAnchor="end" style={{ fontSize: 11, fill: 'var(--text-subtle)' }}>Builder XP / wk</text>
          </svg>
        </div>
      </div>

      <div className="cmd-tiles">
        {m.tiles.map((t) => (<div key={t.l} className="cmd-tile"><div className="cmd-tv">{t.v}</div><div className="cmd-tl">{t.l}</div>{t.delta && <div className="cmd-td" style={{ color: t.up ? '#5BA63C' : 'var(--text-muted)' }}>{t.delta}</div>}</div>))}
      </div>

      {/* Ladder as a horizontal "climb to Architect" timeline */}
      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-muted)', marginTop: 'var(--space-6)' }}>Where your team sits on the climb to Architect</div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${LW} ${LH}`} style={{ width: '100%', minWidth: 520, height: 'auto' }} role="img" aria-label="Distribution across the nine-level ladder from Builder to Architect, with a member count at each stage.">
          <defs><linearGradient id={`cmdLad-${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#367895" /><stop offset="55%" stopColor="#5BA63C" /><stop offset="100%" stopColor="#E8920C" /></linearGradient></defs>
          <line x1={lx(0)} y1={54} x2={lx(LADDER.length - 1)} y2={54} stroke={`url(#cmdLad-${uid})`} strokeWidth="4" strokeLinecap="round" opacity="0.5" />
          {LADDER.map((lv, i) => {
            const cx = lx(i); const c = m.ladderCounts[i] ?? 0; const col = LADDER_COLOR(i);
            return (
              <g key={lv}>
                {i === LADDER.length - 1 && c > 0 && (<>
                  <circle cx={cx} cy={54} r={22} fill="none" stroke="#E8920C" strokeWidth="2" opacity="0.5" />
                  <path transform={`translate(${cx} 20)`} d="M0,-7 L2,-2 L7,-2 L3,1.5 L4.5,6.5 L0,3.5 L-4.5,6.5 L-3,1.5 L-7,-2 L-2,-2 Z" fill="#E8920C" />
                </>)}
                <circle cx={cx} cy={54} r={16} fill={c ? col : 'var(--surface-sunken)'} stroke="var(--surface-card)" strokeWidth="3" />
                <text x={cx} y={55} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, fill: c ? '#fff' : 'var(--text-subtle)' }}>{c}</text>
                <text x={cx} y={98} textAnchor="middle" style={{ fontSize: 9.5, fontWeight: 700, fill: 'var(--text-muted)' }}>{lv}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-body)', margin: 'var(--space-5) 0 0', padding: 'var(--space-4)', background: 'var(--surface-brand-subtle)', borderRadius: 'var(--radius-md)' }}>
        {m.forecast}
      </p>
    </div>
  );
}
