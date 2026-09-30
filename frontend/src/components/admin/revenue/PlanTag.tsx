import React from 'react';
import { PLAN_COLOR, PLAN_LABEL, PlanKey } from './format';

/** A small colored dot + label so a person's subscription type reads as the
 *  same color everywhere it appears on the page (never color-alone — the
 *  label is always present as real text). */
export default function PlanTag({ plan }: { plan: PlanKey }) {
  return (
    <span className="d-inline-flex align-items-center gap-1 small text-muted">
      <span style={{ width: 8, height: 8, borderRadius: 2, background: PLAN_COLOR[plan], display: 'inline-block', flexShrink: 0 }} />
      {PLAN_LABEL[plan]}
    </span>
  );
}
