/**
 * TodayPlan — CAPE Phase 5 finite Today Plan (design doc §10, §16 Phase 5).
 * Rendered by TodayShell ONLY when `flags?.cape_today_plan` is true (the
 * caller's job, not this component's — see TodayShell.tsx's `planRefs` gate).
 *
 * `onRefs` is REQUIRED and fires exactly once per mount: with the plan's
 * real consumed refs on success, or an empty `Set()` on any failure/404 — so
 * the caller's `TodayFeedV2` mount-gate always eventually unblocks, even if
 * this fetch fails (bounded further by TodayShell's own ~1500ms timeout as a
 * second, independent safety net).
 */
import React, { useEffect, useState } from 'react';
import { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import TodayPlanCard from './TodayPlanCard';
import { fetchTodayPlan, submitTodayPlanFeedback, startTestOut, type TodayPlanResponse, type TodayPlanFeedbackAction } from '../../../services/capeApi';

interface Props {
  onRefs: (refs: Set<string>) => void;
  onOpen: (card: TimelineFeedCard) => void;
  onWorkspace: (card: TimelineFeedCard) => void;
  onComplete?: (card: TimelineFeedCard) => Promise<void> | void;
}

const TodayPlan: React.FC<Props> = ({ onRefs, onOpen, onWorkspace, onComplete }) => {
  const [plan, setPlan] = useState<TodayPlanResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTodayPlan()
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        onRefs(new Set((p?.items ?? []).map((i) => i.ref)));
      })
      .catch(() => {
        if (!alive) return;
        setPlan(null);
        onRefs(new Set());
      })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // Mount-once fetch by design (`onRefs` is the caller's stable setState
    // reference — TodayShell.tsx's react-hooks lint plugin isn't configured
    // in this repo's production eslint, per frontend/CLAUDE.md, so no
    // suppression comment is needed here).
  }, []);

  const handleFeedback = async (ref: string, action: TodayPlanFeedbackAction) => {
    await submitTodayPlanFeedback(ref, action);
  };
  const handleTestOut = async (ref: string) => {
    await startTestOut(ref);
  };

  if (!loaded || !plan || plan.items.length === 0) return null;

  const minutesLabel = plan.estimated_total_minutes > 0 ? `~${plan.estimated_total_minutes} min` : null;

  // `.tl-de` is the CSS scope wrapper every other <TimelineCard> call site in
  // this repo mounts under (TodayFeedV2.tsx, TimelineEditorTab.tsx x2,
  // CardDetailDrawer.tsx, TimelineFeed.tsx) — every sizing/color rule for a
  // card's icon badge and media tile in components/timeline/timeline.css is
  // written as a `.tl-de <selector>` descendant rule. TodayPlanCard nests a
  // real <TimelineCard> (see TodayPlanCard.tsx), so without this wrapper here
  // it rendered completely unstyled: the icon badge's SVG fell back to the
  // browser's unconstrained default size with default black text/stroke
  // color, and the media tile lost its 100%-width/16:9-aspect/block layout —
  // the "huge black rectangular and circular blocks" reported in production
  // when CAPE_TODAY_PLAN_ENABLED was flipped on (2026-08-04/05 incident).
  // `data-theme="light"` matches TodayFeedV2's wrapper so Today's plan always
  // renders in the same light card theme regardless of the ambient portal
  // theme. See TodayPlan.cssScope.test.tsx for the regression proof.
  return (
    <div className="tl-de" data-theme="light">
      <div className="today-plan tl-card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div className="d-flex justify-content-between align-items-baseline flex-wrap mb-2" style={{ gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, letterSpacing: '.02em' }}>Today's plan</h3>
          {minutesLabel && <span className="tl-small" style={{ opacity: 0.75 }}>{minutesLabel}</span>}
        </div>
        {plan.items.map((item) => (
          <TodayPlanCard
            key={item.ref}
            item={item}
            onOpen={onOpen}
            onWorkspace={onWorkspace}
            onComplete={onComplete}
            onFeedback={handleFeedback}
            onTestOut={handleTestOut}
          />
        ))}
      </div>
    </div>
  );
};

export default TodayPlan;
