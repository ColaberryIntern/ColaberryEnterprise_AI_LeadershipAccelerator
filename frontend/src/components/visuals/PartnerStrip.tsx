import React from 'react';

/* ------------------------------------------------------------------ *
 * PartnerStrip — a premium trust band that positions Colaberry as an
 * Official Anthropic Partner Network member where learners train
 * hands-on with Claude Code and prep for the Certified Anthropic AI
 * Systems Architect credential.
 *
 * Built on the Colaberry design system: semantic tokens only (never
 * raw hex in layout), scoped <style> so the component is fully
 * self-contained, Roboto/tokens load globally via the DS styles.css.
 * Default export, no required props.
 *
 * The "spark" mark is an original inline SVG asterisk/spark motif —
 * deliberately NOT the Anthropic or Claude logo (no copyrighted art).
 * ------------------------------------------------------------------ */

interface TrustChip {
  /** Stable key + visible label */
  label: string;
}

const CHIPS: TrustChip[] = [
  { label: 'Claude Code partner' },
  { label: 'Anthropic-aligned curriculum' },
  { label: 'Certification prep' },
  { label: 'Real deployed projects' },
];

export interface PartnerStripProps {
  /** Optional extra class on the root <section>. */
  className?: string;
}

/**
 * SparkMark — original spark/asterisk motif evoking the Claude/Anthropic
 * aesthetic without reproducing any trademarked logo. Decorative only.
 */
function SparkMark() {
  return (
    <svg
      className="ps-spark"
      viewBox="0 0 48 48"
      width="48"
      height="48"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* eight-point spark: two crossed strokes + diagonals, weighted to center */}
      <g
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      >
        <line x1="24" y1="6" x2="24" y2="42" />
        <line x1="6" y1="24" x2="42" y2="24" />
        <line x1="11.5" y1="11.5" x2="36.5" y2="36.5" opacity="0.55" />
        <line x1="36.5" y1="11.5" x2="11.5" y2="36.5" opacity="0.55" />
      </g>
      <circle cx="24" cy="24" r="4.5" fill="currentColor" />
    </svg>
  );
}

function PartnerStrip({ className = '' }: PartnerStripProps) {
  return (
    <section
      className={`ps-strip ${className}`.trim()}
      aria-labelledby="ps-heading"
    >
      <style>{`
        .ps-strip {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background: var(--surface-inverse);
          color: var(--text-on-inverse);
          padding: var(--space-16) var(--space-6);
          border-radius: var(--radius-2xl);
          margin: var(--space-8) auto;
          max-width: var(--container-xl);
          box-shadow: var(--shadow-lg);
        }
        /* full-bleed brand-color glow moment behind the content */
        .ps-strip::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(120% 140% at 0% 0%,
              color-mix(in srgb, var(--brand-accent) 26%, transparent) 0%,
              transparent 52%),
            radial-gradient(120% 140% at 100% 100%,
              color-mix(in srgb, var(--blue-500) 22%, transparent) 0%,
              transparent 55%);
          pointer-events: none;
        }

        /* photo + brand-glow background (decorative, behind content) */
        .ps-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          background-image:
            radial-gradient(120% 140% at 0% 0%,
              color-mix(in srgb, var(--brand-accent) 26%, transparent) 0%, transparent 52%),
            radial-gradient(120% 140% at 100% 100%,
              color-mix(in srgb, var(--blue-500) 22%, transparent) 0%, transparent 55%),
            linear-gradient(180deg,
              color-mix(in srgb, var(--surface-inverse) 82%, transparent),
              color-mix(in srgb, var(--surface-inverse) 93%, transparent)),
            url('/img/ai-network.jpg');
          background-size: cover;
          background-position: center;
          pointer-events: none;
        }

        .ps-inner {
          position: relative;
          z-index: 1;
          max-width: var(--container-lg);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--space-5);
        }

        /* Colaberry x Anthropic-partner co-brand lockup */
        .ps-cobrand {
          display: inline-flex;
          align-items: center;
          gap: var(--space-3);
        }
        .ps-logo-chip {
          display: inline-flex;
          align-items: center;
          background: var(--neutral-0);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-pill);
          box-shadow: var(--shadow-sm);
        }
        .ps-logo-chip img { height: 26px; width: auto; display: block; }
        .ps-cobrand-x {
          font-family: var(--font-display);
          font-size: var(--fs-h4);
          font-weight: var(--fw-bold);
          color: color-mix(in srgb, var(--text-on-inverse) 70%, transparent);
        }
        .ps-spark-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: var(--radius-circle);
          background: color-mix(in srgb, var(--brand-accent) 18%, transparent);
          border: var(--border-1) solid
            color-mix(in srgb, var(--brand-accent) 45%, transparent);
          color: var(--brand-accent);
        }
        .ps-spark-badge .ps-spark { width: 28px; height: 28px; }

        .ps-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-pill);
          background: color-mix(in srgb, var(--brand-accent) 18%, transparent);
          border: var(--border-1) solid
            color-mix(in srgb, var(--brand-accent) 45%, transparent);
          font-family: var(--font-body);
          font-size: var(--fs-overline);
          font-weight: var(--fw-bold);
          letter-spacing: var(--ls-overline);
          text-transform: uppercase;
          color: var(--text-on-inverse);
        }
        .ps-eyebrow .ps-spark {
          color: var(--brand-accent);
          width: 18px;
          height: 18px;
          flex: none;
        }

        .ps-headmark {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-4);
          flex-wrap: wrap;
        }
        .ps-headmark > .ps-spark {
          color: var(--brand-accent);
          flex: none;
          filter: drop-shadow(
            0 0 14px color-mix(in srgb, var(--brand-accent) 55%, transparent));
          animation: ps-twinkle 4.5s var(--ease-in-out, ease) infinite;
        }
        @keyframes ps-twinkle {
          0%, 100% { transform: rotate(0deg) scale(1); opacity: 1; }
          50%      { transform: rotate(45deg) scale(1.08); opacity: 0.82; }
        }

        .ps-heading {
          margin: 0;
          font-family: var(--font-display);
          font-weight: var(--fw-black);
          font-size: var(--fs-h2);
          line-height: var(--lh-tight);
          letter-spacing: var(--ls-tight);
          color: var(--text-on-inverse);
          max-width: 18ch;
          text-wrap: balance;
        }
        .ps-heading .ps-accent { color: var(--brand-accent); }

        .ps-support {
          margin: 0;
          max-width: 58ch;
          font-family: var(--font-body);
          font-size: var(--fs-body-lg);
          line-height: var(--lh-relaxed);
          color: color-mix(in srgb, var(--text-on-inverse) 82%, transparent);
        }
        .ps-support strong {
          color: var(--text-on-inverse);
          font-weight: var(--fw-medium);
        }

        .ps-chips {
          list-style: none;
          margin: var(--space-2) 0 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--space-3);
        }
        .ps-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          min-height: var(--target-min);
          border-radius: var(--radius-pill);
          background: color-mix(in srgb, var(--text-on-inverse) 8%, transparent);
          border: var(--border-1) solid
            color-mix(in srgb, var(--text-on-inverse) 16%, transparent);
          font-family: var(--font-body);
          font-size: var(--fs-body-sm);
          font-weight: var(--fw-medium);
          color: var(--text-on-inverse);
          backdrop-filter: blur(2px);
          transition: transform var(--dur-fast) var(--ease-out, ease),
                      border-color var(--dur-fast) var(--ease-out, ease),
                      background var(--dur-fast) var(--ease-out, ease);
        }
        .ps-chip:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--brand-accent) 55%, transparent);
          background: color-mix(in srgb, var(--brand-accent) 14%, transparent);
        }
        .ps-chip .ps-dot {
          width: 7px;
          height: 7px;
          border-radius: var(--radius-circle);
          background: var(--brand-secondary);
          flex: none;
        }

        @media (max-width: 640px) {
          .ps-strip {
            padding: var(--space-10) var(--space-5);
            border-radius: var(--radius-xl);
          }
          .ps-heading { font-size: var(--fs-h3); }
          .ps-support { font-size: var(--fs-body); }
          .ps-headmark > .ps-spark { width: 36px; height: 36px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ps-headmark > .ps-spark { animation: none; }
          .ps-chip { transition: none; }
          .ps-chip:hover { transform: none; }
        }
      `}</style>

      <div className="ps-bg" aria-hidden="true" />

      <div className="ps-inner">
        <div className="ps-cobrand" role="img" aria-label="Colaberry — an Anthropic partner">
          <span className="ps-logo-chip">
            <img src="/colaberry-logo.png" alt="" />
          </span>
          <span className="ps-cobrand-x" aria-hidden="true">×</span>
          <span className="ps-spark-badge"><SparkMark /></span>
        </div>

        <span className="ps-eyebrow">
          <SparkMark />
          Official Anthropic Partner Network
        </span>

        <div className="ps-headmark">
          <SparkMark />
          <h2 id="ps-heading" className="ps-heading">
            We put your people in{' '}
            <span className="ps-accent">Anthropic-partner</span> hands
          </h2>
        </div>

        <p className="ps-support">
          Learners train <strong>hands-on with Claude Code</strong> on real,
          guided work and prepare for the{' '}
          <strong>Certified Anthropic AI Systems Architect</strong> credential
          &mdash; not slideware, but the same tools and workflows teams ship
          with in production.
        </p>

        <ul className="ps-chips" aria-label="Partnership credentials">
          {CHIPS.map((chip) => (
            <li className="ps-chip" key={chip.label}>
              <span className="ps-dot" aria-hidden="true" />
              {chip.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default PartnerStrip;
