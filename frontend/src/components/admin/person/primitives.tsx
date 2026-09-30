import React from 'react';

/**
 * The small shared pieces every 360 tab uses.
 *
 * Extracted so the new programme tabs render fields identically to the
 * acquisition tab. Two components that both draw a labelled value will drift
 * apart on spacing and on the empty case, and the empty case is the one that
 * matters here.
 */

/** Absent, stated. Never an empty cell, and never a zero standing in for unknown. */
export const Unknown = () => <span className="text-muted small">Not recorded</span>;

export function Field({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={wide ? 'col-12 mb-3' : 'col-6 col-lg-4 mb-3'}>
      <div className="text-muted text-uppercase mb-1" style={{ letterSpacing: '.05em', fontSize: '.7rem' }}>
        {label}
      </div>
      <div className={empty ? '' : 'fw-medium'}>{empty ? <Unknown /> : value}</div>
    </div>
  );
}

export const fmtDate = (v: string | null | undefined) =>
  (v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null);

export const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : null);

export const fmtMoney = (cents: number | null | undefined) =>
  (cents === null || cents === undefined ? null : `$${(cents / 100).toFixed(2)}`);

/**
 * A count with its label.
 *
 * `null` renders as "Not recorded", not as 0 — the distinction the metric
 * registry enforces on the server, kept in the UI so a missing signal cannot
 * read as a measured zero.
 */
export function Stat({ label, value, tone, hint }: {
  label: string; value: number | string | null; tone?: string; hint?: string;
}) {
  return (
    <div className="col-6 col-md-3 mb-3">
      <div className="border rounded p-3 h-100">
        <div className="text-muted text-uppercase mb-1" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
          {label}
        </div>
        <div className={`fs-4 fw-semibold ${tone ? `text-${tone}` : ''}`}>
          {value === null || value === undefined ? <Unknown /> : value}
        </div>
        {hint && <div className="text-muted" style={{ fontSize: '.72rem' }}>{hint}</div>}
      </div>
    </div>
  );
}

/** An empty panel that says WHY it is empty, rather than showing nothing. */
export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="text-muted small py-4 text-center">{children}</div>;
}

/** A horizontal bar of statuses and their counts, for register and progress. */
export function StatusBars({ rows, total }: { rows: Array<{ status: string; count: number }>; total: number }) {
  const tone: Record<string, string> = {
    present: 'success', completed: 'success', late: 'warning',
    in_progress: 'info', available: 'secondary', absent: 'danger',
    excused: 'secondary', locked: 'dark',
  };
  if (total === 0) return <EmptyPanel>Nothing recorded.</EmptyPanel>;
  return (
    <div className="d-flex flex-wrap gap-2">
      {rows.map((r) => (
        <span key={r.status} className={`badge bg-${tone[r.status] ?? 'secondary'}-subtle text-${tone[r.status] ?? 'secondary'}-emphasis border border-${tone[r.status] ?? 'secondary'}-subtle`}>
          {r.status.replace(/_/g, ' ')}: <strong>{r.count.toLocaleString()}</strong>
        </span>
      ))}
    </div>
  );
}
