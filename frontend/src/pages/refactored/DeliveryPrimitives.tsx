import React from 'react';

/**
 * DeliveryPrimitives — the small pieces both halves render.
 *
 * Two of these exist because of decisions the backend already enforces, and rendering
 * them any other way would quietly contradict it:
 *
 * `Measure` renders an absent reading as **“not measured”**, never as a zero or an empty
 * bar. Gate 14's operate signals model `not_observed` as a first-class state precisely
 * because a nullable number invites `value ?? 0`, and a zero that means “no data” is
 * indistinguishable from one that means “nothing broke”. A UI that drew 0% would undo
 * that at the last step.
 *
 * `Outcome` distinguishes `not_run` from `fail`. Gate 9's quality gate treats both as
 * blocking but they are different facts, and a reviewer needs to tell “we looked and it
 * failed” from “nobody looked”.
 */

export const Kpi: React.FC<{ value: React.ReactNode; label: string; muted?: boolean }> = ({
  value,
  label,
  muted,
}) => (
  <div className="col">
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body text-center p-3">
        <div
          className="fs-4 fw-bold"
          style={{ color: muted ? 'var(--color-muted)' : 'var(--cherry-deep)' }}
        >
          {value}
        </div>
        <div className="text-muted small text-uppercase" style={{ letterSpacing: '.05em' }}>
          {label}
        </div>
      </div>
    </div>
  </div>
);

export const Panel: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className,
}) => (
  <div className={`card border-0 shadow-sm ${className ?? ''}`}>
    {title && <div className="card-header bg-white fw-semibold small">{title}</div>}
    <div className="card-body">{children}</div>
  </div>
);

/** A short explanation aimed at the reader, not a warning. */
export const Note: React.FC<{ tone?: 'brand' | 'safe'; children: React.ReactNode }> = ({
  tone = 'brand',
  children,
}) => (
  <div
    className="p-3 rounded-end small"
    style={{
      borderLeft: `3px solid ${tone === 'safe' ? 'var(--color-success)' : 'var(--color-primary)'}`,
      background: tone === 'safe' ? 'rgba(16,185,129,.06)' : 'var(--cherry-bg)',
    }}
  >
    {children}
  </div>
);

export type OutcomeValue = 'pass' | 'fail' | 'partial' | 'not_run' | 'stale';

const OUTCOME_STYLE: Record<OutcomeValue, { cls: string; label: string }> = {
  pass: { cls: 'text-bg-success', label: 'Pass' },
  fail: { cls: 'text-bg-danger', label: 'Fail' },
  partial: { cls: 'text-bg-warning', label: 'Partial' },
  // Deliberately distinct from `fail`. "Nobody looked" and "we looked and it failed" are
  // different facts, and Gate 9 blocks on both without conflating them.
  not_run: { cls: 'text-bg-secondary', label: 'Not run' },
  stale: { cls: 'text-bg-danger', label: 'Stale — earlier commit' },
};

export const Outcome: React.FC<{ value: OutcomeValue }> = ({ value }) => {
  const style = OUTCOME_STYLE[value];
  return <span className={`badge ${style.cls}`}>{style.label}</span>;
};

/**
 * A measured value, or an explicit absence.
 *
 * `value === null` renders "not measured" rather than a zero-width bar. See the header.
 */
export const Measure: React.FC<{
  label: string;
  value: number | null;
  display?: string;
  /** 0–100 for the bar. Ignored when value is null. */
  percent?: number;
  danger?: boolean;
}> = ({ label, value, display, percent, danger }) => (
  <div className="d-flex align-items-center gap-3 mb-3">
    <span className="text-muted small flex-shrink-0" style={{ width: 150 }}>
      {label}
    </span>
    {value === null ? (
      <span className="small fst-italic text-muted flex-grow-1">not measured</span>
    ) : (
      <>
        <div
          className="progress flex-grow-1"
          style={{ height: 7 }}
          role="img"
          aria-label={`${label}: ${display ?? value}`}
        >
          <div
            className="progress-bar"
            style={{
              width: `${percent ?? 0}%`,
              background: danger ? 'var(--color-primary)' : 'var(--leaf)',
            }}
          />
        </div>
        <span className="small fw-bold text-end flex-shrink-0" style={{ width: 52 }}>
          {display ?? value}
        </span>
      </>
    )}
  </div>
);

export const Timeline: React.FC<{
  items: Array<{ title: React.ReactNode; at: string }>;
}> = ({ items }) => (
  <ul className="list-unstyled mb-0">
    {items.map((item, i) => (
      <li
        key={i}
        className="ps-3 pb-3 position-relative small"
        style={{
          borderLeft: i === items.length - 1 ? '2px solid transparent' : '2px solid var(--color-border)',
        }}
      >
        <span
          className="position-absolute rounded-circle"
          style={{
            left: -6,
            top: 6,
            width: 10,
            height: 10,
            background: 'var(--color-primary)',
          }}
          aria-hidden="true"
        />
        <div>{item.title}</div>
        <div className="text-muted" style={{ fontSize: '.6875rem' }}>
          {item.at}
        </div>
      </li>
    ))}
  </ul>
);

/** A stand-in frame for a preview or a design reference. */
export const Frame: React.FC<{ caption?: string; children?: React.ReactNode }> = ({
  caption,
  children,
}) => (
  <div className="border rounded overflow-hidden bg-white">
    <div className="d-flex gap-1 px-3 py-2 bg-light border-bottom align-items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-circle d-inline-block"
          style={{ width: 9, height: 9, background: 'var(--color-border)' }}
          aria-hidden="true"
        />
      ))}
      {caption && <span className="small text-muted ms-2">{caption}</span>}
    </div>
    <div className="p-4 text-center text-muted small">{children}</div>
  </div>
);
