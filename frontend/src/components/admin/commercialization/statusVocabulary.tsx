import React from 'react';

/**
 * The five-state provenance vocabulary, shared by every board that reports what it can
 * and cannot prove.
 *
 * WHY THIS IS ONE MODULE AND NOT A COPY PER PAGE. C8.2 introduced these five states on
 * the Commercialization Command Center; R1's Revenue Room reports the same distinction
 * about different rows. Two pages that each own a private copy of "what proxy looks
 * like" will drift, and the first anyone notices is a meeting where the same status
 * reads as two different things on two screens. The vocabulary is the doctrine, so it
 * gets one definition.
 *
 * Color is never the only carrier. Each state has a glyph AND words, so the distinction
 * survives a colorblind reader, a grayscale print and a screenshot pasted into chat.
 */
export type TileStatus =
  | 'live'            // a source exists, holds data, and is the metric asked for
  | 'measured_zero'   // a correctly shaped source exists and is empty; the answer is 0
  | 'undefined_rate'  // a ratio whose denominator is empty; not 0, not knowable
  | 'proxy'           // a near neighbor exists; it is NOT the metric and over- or under-counts
  | 'unmeasurable';   // nothing of the right shape exists anywhere

export const STATUS: Record<TileStatus, {
  label: string; glyph: string; color: string; bg: string; showsNumber: boolean;
}> = {
  live: {
    label: 'Measured', glyph: '●',
    color: 'var(--status-success)', bg: 'var(--status-success-bg)', showsNumber: true,
  },
  measured_zero: {
    label: 'Measured zero', glyph: '○',
    color: 'var(--status-info)', bg: 'var(--status-info-bg)', showsNumber: true,
  },
  undefined_rate: {
    label: 'Undefined', glyph: '—',
    color: 'var(--text-muted)', bg: 'var(--surface-subtle)', showsNumber: false,
  },
  proxy: {
    label: 'Proxy only', glyph: '◐',
    color: 'var(--status-warning)', bg: 'var(--status-warning-bg)', showsNumber: true,
  },
  unmeasurable: {
    label: 'Not yet measurable', glyph: '✕',
    color: 'var(--text-muted)', bg: 'var(--surface-subtle)', showsNumber: false,
  },
};

/** Most-provable first, so a reader meets the evidence before the gaps. */
export const ORDER: TileStatus[] = [
  'live', 'proxy', 'measured_zero', 'undefined_rate', 'unmeasurable',
];

export function StatusChip({ status }: { status: TileStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill small fw-semibold"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}` }}
      data-testid={`status-chip-${status}`}
    >
      <span aria-hidden="true">{s.glyph}</span>
      {s.label}
    </span>
  );
}
