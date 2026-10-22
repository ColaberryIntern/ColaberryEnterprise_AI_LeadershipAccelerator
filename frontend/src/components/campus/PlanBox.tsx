import React, { useState } from 'react';
import type { PlanStop } from './campusPlan';
import { canComplete, stopDetail } from './campusPlan';
import type { CompleteResult } from './campusPlanApi';

/**
 * Today's plan in the arrival panel (WP-2; the prototype's renderPlanBox D:3325): when this building holds your next unfinished
 * step, "① TODAY'S PLAN · STEP n OF N", its title, "<type> · <minutes> · +pts", Open the card, and Mark done.
 *
 * Mark done goes through Today's own collect path (campusPlanApi), so the server's gate applies: a refusal ("watch 75% first")
 * is shown here in its own words and nothing is ticked. A step the campus cannot complete itself (a project task, a community
 * post) shows Open only: it is done where it opens.
 */
export interface PlanBoxProps {
  stop: PlanStop;
  index: number;
  total: number;
  onOpen: (route: string) => void;
  onDone: (stop: PlanStop) => Promise<CompleteResult>;
}

export default function PlanBox({ stop, index, total, onOpen, onDone }: PlanBoxProps): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const done = async () => {
    setBusy(true); setWhy(null);
    const r = await onDone(stop);
    setBusy(false);
    if (!r.ok) setWhy(r.message);
  };
  const detail = stopDetail(stop, true);
  return (
    <div className="cm-plan-box" data-testid="cm-plan-box">
      <div className="cm-pb-k"><span className="cm-pl-n" aria-hidden="true">{index + 1}</span>Today&rsquo;s plan &middot; step {index + 1} of {total}</div>
      <h3>{stop.title}</h3>
      {detail && <p>{detail}</p>}
      <div className="cm-pb-acts">
        <button type="button" className="cm-pb-open" onClick={() => onOpen(stop.route)} data-testid="cm-plan-open">Open the card &rarr;</button>
        {canComplete(stop) && (
          <button type="button" className="cm-pb-done" onClick={done} disabled={busy} data-testid="cm-plan-done">{busy ? 'Marking…' : 'Mark done'}</button>
        )}
      </div>
      {why && <p className="cm-pb-why" role="alert" data-testid="cm-plan-why">{why}</p>}
    </div>
  );
}
