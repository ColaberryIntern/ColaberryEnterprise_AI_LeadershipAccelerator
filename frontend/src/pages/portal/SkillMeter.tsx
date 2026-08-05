import React from 'react';
import { LearnerSkillProfile } from '../../services/capeApi';

/**
 * SkillMeter — the AI-Architecture capability radar. Backend-owned (CAPE Phase
 * 0-1): renders whatever `profile` the caller fetched from
 * `GET /api/portal/cape/skill-profile`, no in-browser scoring math. Two
 * polygons per the design doc (§2 "Important current-state correction", §4,
 * §11):
 *   - dotted/translucent = placement (resume + diagnostic; always 0 in Phase
 *     0-1 — Phase 2 has not shipped resume placement yet. Zero placement is the
 *     CORRECT, expected state here, not an error.)
 *   - solid = verified proficiency, recomputed server-side from the append-only
 *     skill-evidence ledger.
 * Pure/presentational, SVG only (no deps) — same visual language as before, new
 * data source.
 */

interface Props {
  /** null while the profile is loading; the caller (TodayShell) owns the fetch. */
  profile: LearnerSkillProfile | null;
  /** CAPE Phase 5 (design doc §11 "AI Architecture Skills radar" click-
   * through, §16 Phase 5). OPTIONAL — when omitted (every other caller, and
   * this same caller when CAPE_TODAY_PLAN_ENABLED is off), the radar renders
   * byte-identical to pre-Phase-5: no click handlers, no `role`/`tabIndex`
   * attributes added anywhere. When provided, each axis's vertex + label
   * become a real keyboard-accessible click target opening the skill-detail
   * drawer. */
  onSkillClick?: (skillId: string) => void;
}

const CX = 180;
const CY = 150;
const R = 96; // outer radius
const RINGS = [0.25, 0.5, 0.75, 1];

function polygonPoints(n: number, valueFor: (i: number) => number): string {
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  return Array.from({ length: n }, (_, i) => {
    const r = R * Math.max(0.02, Math.min(1, valueFor(i) / 100));
    const x = CX + r * Math.cos(ang(i));
    const y = CY + r * Math.sin(ang(i));
    return `${x},${y}`;
  }).join(' ');
}
function ringPoints(n: number, r: number): string {
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  return Array.from({ length: n }, (_, i) => `${CX + r * Math.cos(ang(i))},${CY + r * Math.sin(ang(i))}`).join(' ');
}
function axisPoint(n: number, i: number, r: number): [number, number] {
  const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)];
}

const SkillMeter: React.FC<Props> = ({ profile, onSkillClick }) => {
  const skills = profile?.skills ?? [];
  const n = skills.length;
  const overall = profile ? Math.round(profile.overall_proficiency) : 0;
  const allPlacementZero = skills.every((s) => s.placement <= 0);

  if (n === 0) {
    // Loading state — no crash, no stale in-browser math. Keep the card shell
    // visible so layout doesn't jump once data arrives.
    return (
      <div className="tl-card skill-radar" style={{ padding: '14px 16px 8px', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, letterSpacing: '.02em' }}>AI Architecture skills</h3>
        <div className="tl-small" style={{ textAlign: 'center', marginTop: 8, opacity: 0.7 }}>
          Loading your skill profile…
        </div>
      </div>
    );
  }

  const proficiencyPts = polygonPoints(n, (i) => skills[i].proficiency);
  const placementPts = polygonPoints(n, (i) => skills[i].placement);

  return (
    <div className="tl-card skill-radar" style={{ padding: '14px 16px 8px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
        <h3 style={{ margin: 0, fontSize: 15, letterSpacing: '.02em' }}>AI Architecture skills</h3>
        <span className="tl-small" style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>
          {overall}% verified
        </span>
      </div>

      <svg viewBox="0 0 360 300" width="100%" style={{ display: 'block', maxHeight: 300 }} role="img" aria-label={`AI Architecture skill radar, ${overall}% verified proficiency`}>
        <defs>
          {/* Colaberry design-system data-viz palette: berry blue -> teal -> leaf green. */}
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
          <polygon key={lvl} points={ringPoints(n, R * lvl)} fill="none" stroke="currentColor" strokeOpacity={lvl === 1 ? 0.28 : 0.12} strokeWidth={lvl === 1 ? 1.1 : 1} />
        ))}
        {/* axis spokes */}
        {skills.map((_, i) => { const [x, y] = axisPoint(n, i, R); return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />; })}

        {/* placement — dotted/translucent (Phase 2 not shipped: expect an all-zero, near-center ring, not an error) */}
        <polygon points={placementPts} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.4} strokeDasharray="3 3" />

        {/* verified proficiency — solid */}
        <polygon points={proficiencyPts} fill="url(#sr-fill)" stroke="#367895" strokeWidth={2} strokeLinejoin="round" filter="url(#sr-glow)" style={{ transition: 'all .6s ease' }} />
        {/* vertex nodes — cherry accent once a skill has real evidence.
            CAPE Phase 5: clickable only when onSkillClick is supplied — every
            attribute below is spread conditionally so the flag-off/no-prop
            render stays byte-identical to before this task. */}
        {skills.map((s, i) => {
          const [x, y] = axisPoint(n, i, R * Math.max(0.02, Math.min(1, s.proficiency / 100)));
          const hasEvidence = s.confidence > 0;
          const clickable = onSkillClick ? {
            role: 'button' as const, tabIndex: 0, style: { cursor: 'pointer' },
            onClick: () => onSkillClick(s.skill_id),
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSkillClick(s.skill_id); } },
            'aria-label': `View ${s.name} skill details`,
          } : undefined;
          return <circle key={i} cx={x} cy={y} r={hasEvidence ? 3.4 : 2} fill={hasEvidence ? '#FB2832' : 'currentColor'} fillOpacity={hasEvidence ? 1 : 0.35} {...clickable} />;
        })}
        <circle cx={CX} cy={CY} r={2.4} fill="currentColor" fillOpacity={0.4} />

        {/* labels + per-KPI value — same conditional-click pattern as the
            vertex nodes above. */}
        {skills.map((s, i) => {
          const [lx, ly] = axisPoint(n, i, R + 20);
          const c = Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n);
          const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
          const dx = c > 0.3 ? 2 : c < -0.3 ? -2 : 0;
          const hasEvidence = s.confidence > 0;
          const clickable = onSkillClick ? {
            role: 'button' as const, tabIndex: 0,
            onClick: () => onSkillClick(s.skill_id),
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSkillClick(s.skill_id); } },
            'aria-label': `View ${s.name} skill details`,
          } : undefined;
          const textStyle = onSkillClick ? { letterSpacing: '.03em', cursor: 'pointer' } : { letterSpacing: '.03em' };
          return (
            <text key={i} x={lx + dx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={9.2} style={textStyle} {...clickable}>
              <tspan fill="currentColor" fillOpacity={0.72} fontWeight={600}>{s.name}</tspan>
              <tspan fill={hasEvidence ? '#2E6A86' : 'currentColor'} fillOpacity={hasEvidence ? 1 : 0.5} fontWeight={800} dx={5}>{Math.round(s.proficiency)}%</tspan>
            </text>
          );
        })}
      </svg>

      <div className="tl-small" style={{ textAlign: 'center', marginTop: 2, opacity: 0.8 }}>
        {allPlacementZero
          ? 'Solid = what you’ve verified here. Complete cards to grow it — placement scoring arrives in a future release.'
          : 'Dotted = resume-indicated placement · solid = verified here.'}
      </div>
    </div>
  );
};

export default SkillMeter;
