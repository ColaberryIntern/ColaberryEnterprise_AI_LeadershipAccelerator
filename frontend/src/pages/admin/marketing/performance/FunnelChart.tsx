import React, { useEffect, useRef, useState } from 'react';
import type { FunnelStage } from '../acquisitionFunnelApi';
import {
  STAGE, barWidthPct, formatCount, formatPct, funnelSteps, widestCount, worstDropKey,
} from './performanceMetrics';

/**
 * The eight stages, as horizontal bars from a shared left edge.
 *
 * ── WHY THIS IS NOT A FUNNEL SHAPE ──
 *
 * A tapering funnel graphic asserts that each stage is a subset of the one above it. Here that is
 * false by construction: the stages are measured independently, an untracked page contributes
 * signups with no recorded visitors, and "Pressed a button" has legitimately run ABOVE "Read it"
 * on live data (345 against 174). Bars from a common left edge, each scaled against the widest
 * stage, let a later stage be longer than an earlier one and show it rather than clamp it.
 *
 * ── WHAT THE COLOURS MEAN ──
 *
 *   series 1   the ordinary case
 *   danger     the single largest ABSOLUTE fall, and "Came back later" which is the known weak
 *              point of this funnel
 *   warning    a stage that exceeds the one above it - a measurement finding, not a failure
 *
 * Colour is never the only carrier: every row prints its count and its share of the stage above,
 * and the amber case is explained in words under the chart.
 */

const DANGER_STAGES = new Set<string>([STAGE.returned]);

export default function FunnelChart({
  stages, loading, error,
}: {
  stages: FunnelStage[];
  loading?: boolean;
  error?: boolean;
}) {
  const steps = funnelSteps(stages);
  const widest = widestCount(steps);
  const worstKey = worstDropKey(steps);
  const grewStep = steps.find((s) => s.grew) ?? null;

  // Bars animate on first paint only. Re-running it on every data refresh would redraw a chart
  // the reader is mid-sentence on.
  const [animate, setAnimate] = useState(false);
  const hasAnimated = useRef(false);
  useEffect(() => {
    if (hasAnimated.current || loading || error || steps.length === 0) return;
    hasAnimated.current = true;
    setAnimate(true);
    const timer = setTimeout(() => setAnimate(false), 1500);
    return () => clearTimeout(timer);
  }, [loading, error, steps.length]);

  if (error) {
    return <div className="mp-fail" data-testid="funnel-error">Failed to load</div>;
  }

  // Eight placeholder rows, because eight is what the backend always returns - so the card is the
  // same height before and after the data lands. Rendered as its OWN branch rather than as a
  // union inside the row map: mixing placeholder and real shapes in one array costs the real rows
  // their type, and every field access below then has to be re-proved to the compiler.
  if (loading && steps.length === 0) {
    return (
      <div>
        <div className="mp-fn__head" aria-hidden="true">
          <span>Stage</span><span /><span>Count</span><span>vs prior</span>
        </div>
        <div className="mp-fn" role="img" aria-label="Acquisition funnel, loading">
          {Array.from({ length: 8 }, (unused, i) => (
            <div className="mp-fn__row" key={`skeleton-${i}`}>
              <span className="mp-fn__label"><span className="mp-skeleton">Stage name</span></span>
              <div className="mp-fn__track" />
              <span className="mp-fn__count"><span className="mp-skeleton">000</span></span>
              <span className="mp-fn__delta" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mp-fn__head" aria-hidden="true">
        <span>Stage</span>
        <span />
        <span>Count</span>
        <span>vs prior</span>
      </div>
      <div
        className={`mp-fn${animate ? ' mp-fn--anim' : ''}`}
        role="img"
        aria-label={
          steps.length === 0
            ? 'Acquisition funnel, no data'
            : `Acquisition funnel: ${steps.map((s) => `${s.label} ${s.count} ${s.unit}`).join(', ')}`
        }
      >
        {steps.map((step, i) => {
          const isWorst = worstKey !== null && step.key === worstKey;
          const isDanger = DANGER_STAGES.has(step.key);
          const barClass = isWorst || isDanger
            ? 'mp-fn__bar mp-fn__bar--worst'
            : step.grew ? 'mp-fn__bar mp-fn__bar--grew' : 'mp-fn__bar';

          const deltaClass = step.grew
            ? 'mp-fn__delta mp-fn__delta--grew'
            : (step.vsPrior != null && step.vsPrior < 0.5)
              ? 'mp-fn__delta mp-fn__delta--down'
              : 'mp-fn__delta';

          // The stage's own prose note from the backend, plus the derived shares, as the native
          // tooltip. A hand-built popover would need its own focus and dismissal behaviour to be
          // reachable without a mouse; `title` is announced by screen readers already.
          const tip = [
            step.label,
            `${step.unit === 'sessions' ? 'Sessions' : 'People'}: ${formatCount(step.count)}`,
            `Share of ad sessions: ${formatPct(step.ofTop)}`,
            `vs prior stage: ${formatPct(step.vsPrior)}`,
            step.note,
          ].join('\n');

          return (
            <div
              className="mp-fn__row"
              key={step.key}
              data-testid={`funnel-stage-${step.key}`}
              title={tip}
            >
              <span className="mp-fn__label">
                {step.label}
                <span className="mp-sub mp-fn__unit">{step.unit}</span>
              </span>
              <div className="mp-fn__track">
                <div
                  className={barClass}
                  style={{
                    width: `${barWidthPct(step.count, widest)}%`,
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <span className="mp-fn__count">{formatCount(step.count)}</span>
              <span className={deltaClass}>
                {step.vsPrior == null ? '—' : formatPct(step.vsPrior, 0)}
              </span>
            </div>
          );
        })}
      </div>

      {grewStep && (
        <p className="mp-fn__flag" data-testid="funnel-stage-grew">
          {'⚠ '}
          <b>{grewStep.label}</b> is higher than the stage above it. The two are measured
          independently, so one does not bound the other: somebody who presses the button without
          scrolling registers here and not there.
        </p>
      )}
    </div>
  );
}
