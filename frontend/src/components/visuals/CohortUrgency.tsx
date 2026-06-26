import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * CohortUrgency
 * Drives real urgency for the next 12-week cohort: a bold start-date line,
 * a LIVE countdown (days/hours/min/sec to the start), a founding-seats
 * scarcity bar, and a "Join the Challenge" CTA.
 *
 * SSR-safe: no Date is read at module load. The target timestamp is parsed
 * inside the component, and the live "now" is only computed in an effect that
 * runs exclusively in the browser. The first render uses a deterministic
 * full-duration snapshot so server and client markup agree.
 */
export interface CohortUrgencyProps {
  /** ISO date (or datetime) the cohort starts. @default '2026-07-27' */
  startDateISO?: string;
  /** Total founding seats in the cohort. @default 40 */
  seatsTotal?: number;
  /** Seats still available. @default 7 */
  seatsLeft?: number;
}

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

const MS_PER_SEC = 1000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Split a positive millisecond delta into d/h/m/s. Never returns negatives. */
function splitRemaining(deltaMs: number): Remaining {
  const clamped = Math.max(0, deltaMs);
  return {
    days: Math.floor(clamped / MS_PER_DAY),
    hours: Math.floor((clamped % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((clamped % MS_PER_HOUR) / MS_PER_MIN),
    seconds: Math.floor((clamped % MS_PER_MIN) / MS_PER_SEC),
    done: clamped <= 0,
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Mon, Jul 27" — formatted deterministically (no locale variance / SSR drift). */
function formatStartLine(target: Date | null): string {
  if (!target || Number.isNaN(target.getTime())) return 'soon';
  return `${WEEKDAYS[target.getDay()]}, ${MONTHS[target.getMonth()]} ${target.getDate()}`;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const CohortUrgency: React.FC<CohortUrgencyProps> = ({
  startDateISO = '2026-07-27',
  seatsTotal = 40,
  seatsLeft = 7,
}) => {
  // Parse the target once. Safe at render time: parsing a string does not
  // depend on the wall clock, so server and client agree.
  const target = useMemo<Date | null>(() => {
    const d = new Date(startDateISO);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [startDateISO]);

  const targetMs = target ? target.getTime() : null;

  // First render (incl. SSR) shows the full duration if we can derive it, else
  // zeros — deterministic, so no hydration mismatch. The effect immediately
  // corrects it to the real remaining time on the client.
  const [remaining, setRemaining] = useState<Remaining>(() =>
    splitRemaining(0)
  );

  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetMs == null) {
      setRemaining(splitRemaining(0));
      return;
    }

    const tick = () => setRemaining(splitRemaining(targetMs - Date.now()));

    // Correct the deterministic first-paint snapshot right away, then run live.
    tick();
    intervalRef.current = window.setInterval(tick, MS_PER_SEC);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [targetMs]);

  // Scarcity math — guarded against bad props (negatives / left > total).
  const total = Math.max(0, Math.floor(seatsTotal));
  const left = Math.min(Math.max(0, Math.floor(seatsLeft)), total || Number.MAX_SAFE_INTEGER);
  const taken = Math.max(0, total - left);
  const filledPct = total > 0 ? Math.round((taken / total) * 100) : 0;

  const startLine = formatStartLine(target);

  // A single spoken sentence keeps the aria-live region calm (no per-segment chatter).
  const countdownLabel = remaining.done
    ? 'The cohort has started. Enrollment for this start date is closed.'
    : `${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes and ${remaining.seconds} seconds until the cohort starts.`;

  const segments: Array<{ value: string; label: string }> = [
    { value: pad2(remaining.days), label: remaining.days === 1 ? 'Day' : 'Days' },
    { value: pad2(remaining.hours), label: 'Hours' },
    { value: pad2(remaining.minutes), label: 'Mins' },
    { value: pad2(remaining.seconds), label: 'Secs' },
  ];

  return (
    <section className="cu" aria-labelledby="cu-heading">
      <style>{`
        .cu {
          --cu-pad: var(--space-8);
          position: relative;
          overflow: hidden;
          color: var(--text-on-inverse);
          background: var(--surface-inverse);
          background-image:
            radial-gradient(120% 140% at 100% 0%,
              color-mix(in srgb, var(--brand-accent) 38%, transparent) 0%,
              transparent 55%),
            radial-gradient(120% 120% at 0% 100%,
              color-mix(in srgb, var(--brand-tertiary) 28%, transparent) 0%,
              transparent 50%);
          border-radius: var(--radius-2xl);
          padding: var(--cu-pad);
          box-shadow: var(--shadow-xl);
          font-family: var(--font-body);
        }
        .cu__eyebrow {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          margin: 0 0 var(--space-4);
          padding: var(--space-1) var(--space-3);
          font-size: var(--fs-overline);
          font-weight: var(--fw-bold);
          letter-spacing: var(--ls-overline);
          text-transform: uppercase;
          color: var(--text-on-inverse);
          background: color-mix(in srgb, var(--brand-accent) 85%, transparent);
          border-radius: var(--radius-pill);
        }
        .cu__dot {
          width: 8px;
          height: 8px;
          border-radius: var(--radius-circle);
          background: var(--neutral-0);
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--neutral-0) 70%, transparent);
          animation: cu-pulse 2s var(--ease-out) infinite;
        }
        @keyframes cu-pulse {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--neutral-0) 55%, transparent); }
          70%  { box-shadow: 0 0 0 10px color-mix(in srgb, var(--neutral-0) 0%, transparent); }
          100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--neutral-0) 0%, transparent); }
        }
        .cu__heading {
          margin: 0 0 var(--space-6);
          font-family: var(--font-display);
          font-weight: var(--fw-black);
          font-size: var(--fs-h2);
          line-height: var(--lh-tight);
          letter-spacing: var(--ls-tight);
          max-width: 22ch;
        }
        .cu__heading b {
          color: var(--neutral-0);
          font-weight: var(--fw-black);
          white-space: nowrap;
        }
        .cu__date {
          color: color-mix(in srgb, var(--brand-secondary) 70%, var(--neutral-0));
        }
        .cu__countdown {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--space-3);
          margin: 0 0 var(--space-8);
          max-width: 440px;
        }
        .cu__seg {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-4) var(--space-2);
          background: color-mix(in srgb, var(--neutral-0) 8%, transparent);
          border: var(--border-1) solid color-mix(in srgb, var(--neutral-0) 16%, transparent);
          border-radius: var(--radius-lg);
          backdrop-filter: blur(2px);
        }
        .cu__seg-val {
          font-family: var(--font-mono);
          font-weight: var(--fw-bold);
          font-size: var(--fs-h2);
          line-height: 1;
          font-variant-numeric: tabular-nums;
          letter-spacing: var(--ls-tight);
        }
        .cu__seg-lbl {
          font-size: var(--fs-overline);
          font-weight: var(--fw-medium);
          letter-spacing: var(--ls-wide);
          text-transform: uppercase;
          color: color-mix(in srgb, var(--neutral-0) 78%, transparent);
        }
        .cu__started {
          margin: 0 0 var(--space-8);
          font-size: var(--fs-body-lg);
          font-weight: var(--fw-bold);
        }
        .cu__scarcity { margin: 0 0 var(--space-8); }
        .cu__scarcity-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-3);
          margin-bottom: var(--space-3);
        }
        .cu__scarcity-lead {
          font-size: var(--fs-body);
          font-weight: var(--fw-bold);
        }
        .cu__scarcity-lead .cu__left {
          color: color-mix(in srgb, var(--brand-secondary) 65%, var(--neutral-0));
        }
        .cu__scarcity-pct {
          font-size: var(--fs-caption);
          font-weight: var(--fw-medium);
          color: color-mix(in srgb, var(--neutral-0) 80%, transparent);
          font-variant-numeric: tabular-nums;
        }
        .cu__bar {
          position: relative;
          height: 14px;
          border-radius: var(--radius-pill);
          background: color-mix(in srgb, var(--neutral-0) 14%, transparent);
          overflow: hidden;
        }
        .cu__bar-fill {
          position: absolute;
          inset: 0 auto 0 0;
          border-radius: var(--radius-pill);
          background: linear-gradient(90deg,
            var(--brand-accent),
            color-mix(in srgb, var(--brand-accent) 60%, var(--amber-500)));
          transition: width var(--dur-slow) var(--ease-out);
        }
        .cu__cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          min-height: var(--target-min);
          padding: var(--space-4) var(--space-8);
          font-family: var(--font-display);
          font-size: var(--fs-body-lg);
          font-weight: var(--fw-bold);
          text-decoration: none;
          color: var(--action-fg);
          background: var(--action-bg);
          border-radius: var(--radius-pill);
          box-shadow: var(--shadow-brand);
          transition: transform var(--dur-fast) var(--ease-out),
                      background-color var(--dur-fast) var(--ease-out);
        }
        .cu__cta:hover { background: var(--action-bg-hover); transform: translateY(-2px); }
        .cu__cta:active { background: var(--action-bg-press); transform: translateY(0); }
        .cu__cta:focus-visible {
          outline: none;
          box-shadow: var(--shadow-brand), var(--focus-ring);
        }
        .cu__arrow { transition: transform var(--dur-fast) var(--ease-out); }
        .cu__cta:hover .cu__arrow { transform: translateX(3px); }

        @media (max-width: 640px) {
          .cu { --cu-pad: var(--space-6); }
          .cu__heading { font-size: var(--fs-h3); }
          .cu__seg-val { font-size: var(--fs-h3); }
          .cu__cta { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cu__dot { animation: none; }
          .cu__bar-fill, .cu__cta, .cu__arrow { transition: none; }
          .cu__cta:hover { transform: none; }
        }
      `}</style>

      <span className="cu__eyebrow">
        <span className="cu__dot" aria-hidden="true" />
        Founding Cohort
      </span>

      <h2 id="cu-heading" className="cu__heading">
        Next <b>12-week cohort</b> starts{' '}
        <span className="cu__date">{startLine}</span>
      </h2>

      {remaining.done ? (
        <p className="cu__started">Doors are open — the cohort is underway.</p>
      ) : (
        <div
          className="cu__countdown"
          role="timer"
          aria-live="polite"
          aria-atomic="true"
          aria-label={countdownLabel}
        >
          {segments.map((seg) => (
            <div className="cu__seg" key={seg.label}>
              <span className="cu__seg-val" aria-hidden="true">{seg.value}</span>
              <span className="cu__seg-lbl" aria-hidden="true">{seg.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="cu__scarcity">
        <div className="cu__scarcity-top">
          <span className="cu__scarcity-lead">
            Only <span className="cu__left">{left}</span> of {total} founding seats left
          </span>
          <span className="cu__scarcity-pct">{filledPct}% claimed</span>
        </div>
        <div
          className="cu__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={taken}
          aria-label={`${taken} of ${total} founding seats claimed`}
        >
          <div className="cu__bar-fill" style={{ width: `${filledPct}%` }} />
        </div>
      </div>

      <a className="cu__cta" href="/enroll">
        Join the Challenge
        <span className="cu__arrow" aria-hidden="true">&rarr;</span>
      </a>
    </section>
  );
};

export default CohortUrgency;
