import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchNextCohort, OpenCohort } from '../../services/cohortApi';

/**
 * CohortUrgency
 * Drives real urgency for the next 12-week cohort: a bold start-date line,
 * a LIVE countdown (days/hours/min/sec to the start), a founding-seats
 * scarcity bar, and a "Claim your seat" CTA. Two-column on desktop (copy +
 * scarcity on the left, the countdown on the right) over a subtle photo
 * watermark so the card fills its width rather than bunching on the left.
 *
 * SSR-safe: no Date is read at module load. The target timestamp is parsed
 * inside the component, and the live "now" is only computed in a browser-only
 * effect. The first render uses a deterministic snapshot so markup agrees.
 */
export interface CohortUrgencyProps {
  /** ISO date (or datetime) the cohort starts. @default '2026-07-23' */
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

/** "Thu, Jul 23" — formatted deterministically (no locale variance / SSR drift). */
function formatStartLine(target: Date | null): string {
  if (!target || Number.isNaN(target.getTime())) return 'soon';
  return `${WEEKDAYS[target.getDay()]}, ${MONTHS[target.getMonth()]} ${target.getDate()}`;
}

/**
 * Parse the start date WITHOUT the UTC-midnight off-by-one. A bare "YYYY-MM-DD"
 * handed to `new Date()` is parsed as UTC midnight, which renders as the PRIOR
 * day in timezones behind UTC (US Central etc.) — that is why "2026-07-23"
 * displayed as "Wed, Jul 22". Build date-only values at LOCAL midnight instead;
 * full datetimes (with a time/offset) are parsed as-is.
 */
function parseStartDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const CohortUrgency: React.FC<CohortUrgencyProps> = ({
  startDateISO = '2026-07-23',
  seatsTotal = 40,
  seatsLeft = 7,
}) => {
  // Connect the start date to the admin cohort calendar (/admin/accelerator):
  // fetch the next open cohort's start date and prefer it over the prop, falling
  // back to the prop on any failure. Browser-only (effect), so first paint uses
  // the prop and SSR stays deterministic.
  const [liveCohort, setLiveCohort] = useState<OpenCohort | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchNextCohort(controller.signal).then((c) => {
      if (c) setLiveCohort(c);
    });
    return () => controller.abort();
  }, []);

  const effectiveStartISO = liveCohort?.start_date ?? startDateISO;

  // Live-session cadence — admin-driven from the cohort record, with a truthful
  // fallback so the line never goes blank if the fetch fails.
  const scheduleLine =
    liveCohort && liveCohort.core_day && liveCohort.core_time
      ? `${liveCohort.core_day} · ${liveCohort.core_time}`
      : 'Monday and Thursday · 6:30 PM - 8:30 PM CST';

  const target = useMemo<Date | null>(
    () => parseStartDate(effectiveStartISO),
    [effectiveStartISO],
  );

  const targetMs = target ? target.getTime() : null;

  const [remaining, setRemaining] = useState<Remaining>(() => splitRemaining(0));
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetMs == null) {
      setRemaining(splitRemaining(0));
      return;
    }
    const tick = () => setRemaining(splitRemaining(targetMs - Date.now()));
    tick();
    intervalRef.current = window.setInterval(tick, MS_PER_SEC);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [targetMs]);

  const total = Math.max(0, Math.floor(seatsTotal));
  const left = Math.min(Math.max(0, Math.floor(seatsLeft)), total || Number.MAX_SAFE_INTEGER);
  const taken = Math.max(0, total - left);
  const filledPct = total > 0 ? Math.round((taken / total) * 100) : 0;

  const startLine = formatStartLine(target);

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
          --cu-pad: var(--space-10);
          position: relative;
          overflow: hidden;
          color: var(--text-on-inverse);
          background: var(--surface-inverse);
          border-radius: var(--radius-2xl);
          padding: var(--cu-pad);
          box-shadow: var(--shadow-xl);
          font-family: var(--font-body);
        }
        /* Photo watermark + brand glow (decorative, behind content) */
        .cu__bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          background-image:
            radial-gradient(120% 140% at 100% 0%,
              color-mix(in srgb, var(--brand-accent) 44%, transparent) 0%, transparent 55%),
            radial-gradient(120% 120% at 0% 100%,
              color-mix(in srgb, var(--brand-tertiary) 30%, transparent) 0%, transparent 52%),
            linear-gradient(180deg,
              color-mix(in srgb, var(--surface-inverse) 70%, transparent),
              color-mix(in srgb, var(--surface-inverse) 90%, transparent)),
            url('/img/workshop.jpg');
          background-size: cover;
          background-position: center;
        }
        .cu__grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: var(--space-10);
          align-items: center;
        }
        .cu__left { min-width: 0; }
        .cu__right {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          padding: var(--space-6);
          background: color-mix(in srgb, var(--neutral-0) 6%, transparent);
          border: var(--border-1) solid color-mix(in srgb, var(--neutral-0) 14%, transparent);
          border-radius: var(--radius-xl);
        }
        .cu__right-label {
          font-size: var(--fs-overline);
          font-weight: var(--fw-bold);
          letter-spacing: var(--ls-overline);
          text-transform: uppercase;
          color: color-mix(in srgb, var(--neutral-0) 74%, transparent);
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
          width: 8px; height: 8px; border-radius: var(--radius-circle);
          background: var(--neutral-0);
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
          max-width: 18ch;
        }
        .cu__heading b { color: var(--neutral-0); font-weight: var(--fw-black); white-space: nowrap; }
        .cu__date { color: color-mix(in srgb, var(--brand-secondary) 70%, var(--neutral-0)); white-space: nowrap; }
        .cu__schedule {
          display: flex; align-items: center; gap: var(--space-2);
          margin: calc(var(--space-5) * -1) 0 var(--space-6);
          font-size: var(--fs-caption); font-weight: var(--fw-medium);
          color: color-mix(in srgb, var(--neutral-0) 80%, transparent);
        }
        .cu__schedule-dot {
          width: 6px; height: 6px; border-radius: var(--radius-circle);
          background: var(--brand-secondary); flex: none;
        }

        .cu__countdown {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--space-3);
          margin: 0;
        }
        .cu__seg {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-4) var(--space-2);
          background: color-mix(in srgb, var(--neutral-0) 9%, transparent);
          border: var(--border-1) solid color-mix(in srgb, var(--neutral-0) 16%, transparent);
          border-radius: var(--radius-lg);
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
        .cu__started { margin: 0; font-size: var(--fs-body-lg); font-weight: var(--fw-bold); }

        .cu__scarcity { margin: 0 0 var(--space-6); }
        .cu__scarcity-top {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: var(--space-3); margin-bottom: var(--space-3);
        }
        .cu__scarcity-lead { font-size: var(--fs-body); font-weight: var(--fw-bold); }
        .cu__scarcity-lead .cu__left-n { color: color-mix(in srgb, var(--brand-secondary) 65%, var(--neutral-0)); }
        .cu__scarcity-pct {
          font-size: var(--fs-caption); font-weight: var(--fw-medium);
          color: color-mix(in srgb, var(--neutral-0) 80%, transparent);
          font-variant-numeric: tabular-nums;
        }
        .cu__bar {
          position: relative; height: 14px; border-radius: var(--radius-pill);
          background: color-mix(in srgb, var(--neutral-0) 14%, transparent); overflow: hidden;
        }
        .cu__bar-fill {
          position: absolute; inset: 0 auto 0 0; border-radius: var(--radius-pill);
          background: linear-gradient(90deg, var(--brand-accent), color-mix(in srgb, var(--brand-accent) 60%, var(--amber-500)));
          transition: width var(--dur-slow) var(--ease-out);
        }
        .cu__cta {
          display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
          min-height: var(--target-min); padding: var(--space-4) var(--space-8);
          font-family: var(--font-display); font-size: var(--fs-body-lg); font-weight: var(--fw-bold);
          text-decoration: none; color: var(--action-fg); background: var(--action-bg);
          border-radius: var(--radius-pill); box-shadow: var(--shadow-brand);
          transition: transform var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
        }
        .cu__cta:hover { background: var(--action-bg-hover); transform: translateY(-2px); }
        .cu__cta:active { background: var(--action-bg-press); transform: translateY(0); }
        .cu__cta:focus-visible { outline: none; box-shadow: var(--shadow-brand), var(--focus-ring); }
        .cu__arrow { transition: transform var(--dur-fast) var(--ease-out); }
        .cu__cta:hover .cu__arrow { transform: translateX(3px); }

        @media (max-width: 760px) {
          .cu__grid { grid-template-columns: 1fr; gap: var(--space-8); }
        }
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

      <div className="cu__bg" aria-hidden="true" />

      <div className="cu__grid">
        <div className="cu__left">
          <span className="cu__eyebrow">
            <span className="cu__dot" aria-hidden="true" />
            Founding Cohort · Filling fast
          </span>

          <h2 id="cu-heading" className="cu__heading">
            Next <b>12-week cohort</b> starts <span className="cu__date">{startLine}</span>
          </h2>

          <p className="cu__schedule">
            <span className="cu__schedule-dot" aria-hidden="true" />
            Live sessions · {scheduleLine}
          </p>

          <div className="cu__scarcity">
            <div className="cu__scarcity-top">
              <span className="cu__scarcity-lead">
                Only <span className="cu__left-n">{left}</span> of {total} founding seats left
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
            Claim your seat
            <span className="cu__arrow" aria-hidden="true">&rarr;</span>
          </a>
        </div>

        <div className="cu__right">
          {remaining.done ? (
            <p className="cu__started">Doors are open — the cohort is underway.</p>
          ) : (
            <>
              <div className="cu__right-label">Enrollment closes in</div>
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
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default CohortUrgency;
