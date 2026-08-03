import React from 'react';
import { TimelineFeedCard } from '../../components/timeline/TimelineCard';

/**
 * SkillMeter — the Free Preview's AI-Architecture capability radar. Ten KPIs (the
 * skills that matter most for an AI Architect) rendered as one compact, futuristic
 * radar that fills as you complete preview activities. Ten meters in the footprint
 * of the old six bars.
 *
 * The activity-type → skill map lives here (not on `card.competencies`, which drives
 * the separate architect readiness engine). Every activity resolves to ≥1 skill, so
 * completing anything moves the shape. Pure/presentational, SVG only (no deps).
 */

// The 10 KPIs — the top AI-Architecture skills, in radar order.
const SKILLS: Array<{ key: string; label: string }> = [
  { key: 'llm',          label: 'LLM Core' },
  { key: 'prompting',    label: 'Prompting' },
  { key: 'rag',          label: 'RAG' },
  { key: 'vectors',      label: 'Vectors' },
  { key: 'agents',       label: 'Agents & MCP' },
  { key: 'evaluation',   label: 'Eval & Guardrails' },
  { key: 'architecture', label: 'System Design' },
  { key: 'context',      label: 'Context Eng.' },
  { key: 'governance',   label: 'Governance' },
  { key: 'deployment',   label: 'Deploy & Ops' },
];

// Activity type → the AI-Architecture skills it builds. Every type resolves to ≥1.
const TYPE_SKILLS: Record<string, string[]> = {
  announcement: ['llm'],
  architect_mindset: ['architecture', 'agents', 'governance'],
  deep_dive: ['llm', 'rag', 'context'],
  knowledge_check: ['llm', 'vectors', 'evaluation'],
  quiz: ['llm', 'vectors', 'evaluation'],
  evaluation: ['evaluation', 'governance'],
  warmup: ['prompting', 'context'],
  reflection: ['evaluation', 'governance'],
  video: ['llm'],
  ai_video_stream: ['llm', 'architecture'],
  testimonial: ['llm'],
  blog: ['rag', 'context'],
  podcast: ['llm', 'agents'],
  setup_lab: ['agents', 'deployment'],
  prompt_lab: ['prompting'],
  prompt_challenge: ['prompting', 'evaluation'],
  survey: ['evaluation'],
  deep_dive_field_guide: ['rag', 'architecture'],
};
function skillsForCard(card: TimelineFeedCard): string[] {
  return TYPE_SKILLS[card.type] || ['llm'];
}

const N = SKILLS.length;
const CX = 180;
const CY = 150;
const R = 96;                                  // outer radius
const RINGS = [0.25, 0.5, 0.75, 1];
const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / N;
const pt = (i: number, r: number): [number, number] => [CX + r * Math.cos(ang(i)), CY + r * Math.sin(ang(i))];
const poly = (r: number) => SKILLS.map((_, i) => pt(i, r).join(',')).join(' ');

const SkillMeter: React.FC<{ cards: TimelineFeedCard[] }> = ({ cards }) => {
  // Roll activities up per skill (completed / total mapped).
  const agg = new Map<string, { total: number; done: number }>();
  for (const card of cards) {
    const isDone = card.status === 'completed';
    for (const s of skillsForCard(card)) {
      const cur = agg.get(s) || { total: 0, done: 0 };
      cur.total += 1;
      if (isDone) cur.done += 1;
      agg.set(s, cur);
    }
  }
  const vals = SKILLS.map((s) => {
    const a = agg.get(s.key) || { total: 0, done: 0 };
    return { ...s, ...a, v: a.total ? a.done / a.total : 0 };
  });
  const totalDone = vals.reduce((s, r) => s + r.done, 0);
  const totalAll = vals.reduce((s, r) => s + r.total, 0);
  const overall = Math.round((vals.reduce((s, r) => s + r.v, 0) / N) * 100);

  const dataPts = vals.map((r, i) => pt(i, R * Math.max(0.02, r.v)).join(',')).join(' ');

  return (
    <div className="tl-card skill-radar" style={{ padding: '14px 16px 8px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
        <h3 style={{ margin: 0, fontSize: 15, letterSpacing: '.02em' }}>AI Architecture skills</h3>
        <span className="tl-small" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>
          {overall}% · {totalDone}/{totalAll} builds
        </span>
      </div>

      <svg viewBox="0 0 360 300" width="100%" style={{ display: 'block', maxHeight: 300 }} role="img" aria-label={`AI Architecture skill radar, ${overall}% overall`}>
        <defs>
          {/* Colaberry design-system data-viz palette: berry blue → teal → leaf green. */}
          <radialGradient id="sr-bg" cx="50%" cy="46%" r="60%">
            <stop offset="0%" stopColor="#367895" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#367895" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sr-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#367895" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#2BA39A" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#5BA63C" stopOpacity="0.30" />
          </linearGradient>
          <filter id="sr-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ambient glow field */}
        <circle cx={CX} cy={CY} r={R + 8} fill="url(#sr-bg)" />

        {/* concentric grid rings */}
        {RINGS.map((lvl) => (
          <polygon key={lvl} points={poly(R * lvl)} fill="none" stroke="currentColor" strokeOpacity={lvl === 1 ? 0.28 : 0.12} strokeWidth={lvl === 1 ? 1.1 : 1} />
        ))}
        {/* axis spokes */}
        {SKILLS.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />; })}

        {/* data shape */}
        <polygon points={dataPts} fill="url(#sr-fill)" stroke="#367895" strokeWidth={2} strokeLinejoin="round" filter="url(#sr-glow)" style={{ transition: 'all .6s ease' }} />
        {/* vertex nodes — cherry accent on a completed skill */}
        {vals.map((r, i) => { const [x, y] = pt(i, R * Math.max(0.02, r.v)); return <circle key={i} cx={x} cy={y} r={r.done ? 3.4 : 2} fill={r.done ? '#FB2832' : 'currentColor'} fillOpacity={r.done ? 1 : 0.35} />; })}
        <circle cx={CX} cy={CY} r={2.4} fill="currentColor" fillOpacity={0.4} />

        {/* labels + per-KPI value */}
        {vals.map((r, i) => {
          const [lx, ly] = pt(i, R + 20);
          const c = Math.cos(ang(i));
          const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
          const dx = c > 0.3 ? 2 : c < -0.3 ? -2 : 0;
          return (
            <text key={i} x={lx + dx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={9.2} style={{ letterSpacing: '.03em' }}>
              <tspan fill="currentColor" fillOpacity={0.72} fontWeight={600}>{r.label}</tspan>
              <tspan fill={r.done ? '#2E6A86' : 'currentColor'} fillOpacity={r.done ? 1 : 0.5} fontWeight={800} dx={5}>{Math.round(r.v * 100)}%</tspan>
            </text>
          );
        })}
      </svg>

      <div className="tl-small" style={{ textAlign: 'center', marginTop: 2, opacity: 0.8 }}>
        Complete preview activities to grow each skill — watch the shape fill out.
      </div>
    </div>
  );
};

export default SkillMeter;
