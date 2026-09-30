import React from 'react';

/**
 * The rubric score as a coloured badge, shared by every surface that shows it.
 *
 * ONE COMPONENT, ON PURPOSE. The score appears in the review queue, the question
 * bank, and anywhere else a question is listed. Three copies of "what colour is
 * a 4?" drift apart, and a score that is amber on one screen and green on
 * another stops meaning anything.
 *
 * THE BANDS. Green only at the top: the rubric has six dimensions and the
 * reference meets all six, so "close" is not the same as "matches". Amber is the
 * working middle. Red is a question that does not resemble the published exam
 * — a definitional stem with label options scores 1 or 2, which is the state the
 * whole bank was in before the 2026-09-08 rewrite.
 *
 * IT IS ADVISORY EVERYWHERE. The colour is a prompt to look, never a verdict on
 * whether the question is correct or fair, and no surface may use it to gate an
 * action. `title` carries that in the tooltip so the meaning travels with the
 * badge rather than depending on whichever page it landed on.
 */
export type RubricTone = 'success' | 'warning' | 'danger';

/** Exported so a test can assert the bands rather than re-deriving them. */
export function rubricTone(met: number, of: number): RubricTone {
  if (of <= 0) return 'danger';
  if (met >= of) return 'success';
  if (met >= Math.ceil(of * 0.66)) return 'warning';
  return 'danger';
}

export function RubricBadge({ met, of, className }: { met: number; of: number; className?: string }) {
  const tone = rubricTone(met, of);
  const label = met >= of ? 'matches the published shape' : `${of - met} dimension${of - met === 1 ? '' : 's'} to fix`;
  return (
    <span
      className={`badge text-bg-${tone} ${className ?? ''}`}
      title={`Rubric ${met} of ${of} — ${label}. Advisory: it measures whether this looks like a real exam item, not whether the answer is right.`}
    >
      Rubric {met}/{of}
    </span>
  );
}

export default RubricBadge;
