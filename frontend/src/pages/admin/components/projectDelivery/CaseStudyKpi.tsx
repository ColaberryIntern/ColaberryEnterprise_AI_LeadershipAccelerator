import React from 'react';

/**
 * CaseStudyKpi — how close this build is to becoming a Case Study.
 *
 * REPLACES A BARE NUMBER. The score previously rendered as an unlabelled integer in
 * a pill, and the operator's first question on seeing it was "what is the number all
 * the way to the right?" A score nobody can name is not a KPI, it is noise.
 *
 * Named for the goal rather than the metric: converting a build into a Case Study is
 * the point, and that Case Study then joins the student's portfolio. The breakdown is
 * exposed on hover so the number can always be traced to the five things that produce
 * it, rather than being taken on faith.
 */

export interface ReadinessComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  gap?: string;
}

export interface Readiness {
  score: number;
  ready: boolean;
  components: ReadinessComponent[];
  gaps: string[];
}

interface Props {
  readiness: Readiness;
  /** Published case studies are no longer candidates and say so instead of scoring. */
  alreadyCaseStudy?: boolean;
  compact?: boolean;
  /** When given, the pill becomes a button that opens the readiness breakdown. The
   *  tooltip stays either way — hovering is still the fastest read, and the click is
   *  for when you want to copy the gaps into a message. */
  onOpen?: () => void;
}

function tone(score: number): { bg: string; fg: string; border: string } {
  if (score >= 70) return { bg: '#dcfce7', fg: '#15803d', border: '#86efac' };
  if (score >= 35) return { bg: '#fef3c7', fg: '#b45309', border: '#fcd34d' };
  if (score > 0) return { bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5' };
  return { bg: '#f1f5f9', fg: '#64748b', border: '#e2e8f0' };
}

/** Plain-text breakdown for the title attribute — every component, its contribution
 *  in points, and what is missing. Native tooltip rather than a popover library: no
 *  new dependency, and it works on the row without stealing the click. */
export function readinessBreakdown(r: Readiness): string {
  const lines = r.components.map((c) => {
    const pts = Math.round(c.score * c.weight * 100);
    const of = Math.round(c.weight * 100);
    return `${c.label}: ${pts}/${of}${c.gap ? ` — ${c.gap}` : ' ✓'}`;
  });
  return [
    `Case Study Readiness ${r.score}/100`,
    '',
    ...lines,
    '',
    r.ready ? 'Ready to convert.' : `Still needed: ${r.gaps.join('; ')}`,
  ].join('\n');
}

export default function CaseStudyKpi({
  readiness, alreadyCaseStudy = false, compact = false, onOpen,
}: Props) {
  if (alreadyCaseStudy) {
    return (
      <span
        className="badge rounded-pill d-inline-flex align-items-center gap-1"
        style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontWeight: 600 }}
        title="This project has already been converted into a Case Study."
      >
        <i className="ri-award-line" aria-hidden="true" /> Case Study
      </span>
    );
  }

  const t = tone(readiness.score);
  const breakdown = readinessBreakdown(readiness);
  const inner = (
    <>
      <i className="ri-award-line" aria-hidden="true" />
      {!compact && <span style={{ fontSize: 11, fontWeight: 600 }}>Case Study</span>}
      <span style={{ fontWeight: 700 }}>{readiness.score}</span>
      <span style={{ fontSize: 11, opacity: 0.75 }}>/100</span>
    </>
  );
  const skin: React.CSSProperties = {
    background: t.bg, color: t.fg, border: `1px solid ${t.border}`, whiteSpace: 'nowrap',
  };

  // A real <button> when it does something, so it is keyboard-reachable and announced as
  // actionable. `stopPropagation` keeps the click off the row's expand toggle underneath.
  if (onOpen) {
    return (
      <button
        type="button"
        className="d-inline-flex align-items-center gap-1 rounded-pill px-2 py-1 border-0"
        style={{ ...skin, cursor: 'pointer' }}
        title={`${breakdown}\n\nClick for the full breakdown and a message to send.`}
        aria-label={`Case Study readiness ${readiness.score} out of 100 — open the breakdown`}
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
      >
        {inner}
      </button>
    );
  }

  return (
    <span
      className="d-inline-flex align-items-center gap-1 rounded-pill px-2 py-1"
      style={skin}
      title={breakdown}
      aria-label={`Case Study readiness ${readiness.score} out of 100`}
    >
      {inner}
    </span>
  );
}
