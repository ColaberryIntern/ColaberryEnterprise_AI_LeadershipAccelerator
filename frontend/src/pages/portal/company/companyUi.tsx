import React from 'react';

/**
 * Shared presentational bits for the real "Your company" manager page — the same
 * design-system styles the `/try` preview (ManagementPreviewPage) uses, lifted so
 * the live page and the sample demo look identical. All tokens come from the
 * global design system (styles/tokens.css).
 */

export const card: React.CSSProperties = { background: 'var(--surface-card)', border: 'var(--border-1) solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' };
export const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-h4)', color: 'var(--text-strong)', margin: '0 0 var(--space-1)' };
export const muted: React.CSSProperties = { fontSize: 'var(--fs-body-sm)', color: 'var(--text-muted)', margin: 0 };
export const inputStyle: React.CSSProperties = { padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--fs-body)', border: 'var(--border-1) solid var(--border-default)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', color: 'var(--text-body)', background: 'var(--surface-card)' };
export const pillBtn: React.CSSProperties = { border: 'none', cursor: 'pointer', padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-pill)', fontWeight: 700, fontSize: 'var(--fs-body-sm)', background: 'var(--brand-accent)', color: '#fff' };
export const sub: React.CSSProperties = { fontSize: 'var(--fs-overline)', fontWeight: 700, letterSpacing: 'var(--ls-overline)', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' };

/** Two initials from a display name (falls back to "?"). */
export const initials = (n: string): string => (n || '?').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

/** Ladder tone from a 0..8 rank: teal (low) → green (mid) → amber (near Architect). */
export const lvlTone = (rank: number): string => (rank >= 7 ? '#E8920C' : rank >= 3 ? '#5BA63C' : '#367895');

/** Turn a level_slug ("sr_dev") into a display label ("Sr Dev"). */
export const prettyLevel = (slug: string): string => (slug || 'builder').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** A labelled progress bar (label left, value right, filled track below). */
export function Bar({ label, pct, color, right }: { label: string; pct: number; color: string; right?: string }) {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-caption)', color: 'var(--text-body)' }}><span>{label}</span><span style={{ fontWeight: 700 }}>{right ?? `${pct}%`}</span></div>
      <div style={{ height: 7, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden' }}><div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 'var(--radius-pill)' }} /></div>
    </div>
  );
}

/** A tiny actual→projected velocity sparkline. Renders nothing meaningful with
 *  fewer than 2 points, so callers should guard on data length. */
export function Spark({ actual, projected }: { actual: number[]; projected: number[] }) {
  const W = 340, H = 96, pad = 8;
  const all = [...actual, ...projected.slice(1)];
  const min = Math.min(...all) - 3, max = Math.max(...all) + 3;
  const n = all.length;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1 || 1);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - 2 * pad);
  const a = actual.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ps = actual.length - 1;
  const p = projected.map((v, i) => `${i ? 'L' : 'M'} ${x(ps + i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Velocity with projection">
      <path d={p} fill="none" stroke="#E8920C" strokeWidth="3" strokeDasharray="4 5" strokeLinecap="round" />
      <path d={a} fill="none" stroke="#5BA63C" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(actual.length - 1)} cy={y(actual[actual.length - 1])} r="5" fill="#5BA63C" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

/** Prettify an evidence source_type / event slug for display. */
export const prettySlug = (s: string): string => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
