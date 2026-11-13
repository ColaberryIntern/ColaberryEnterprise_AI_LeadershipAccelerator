import React, { useMemo, useState } from 'react';
import { MARK, paintFor } from './flowTokens';

/**
 * R16 Phase 2 — one stream's recent history as a row of day columns.
 *
 * Ali: "Everything should have a timeline that looks like the one in the timeline." The
 * reference is the internship report's per-person sparkline: a fixed run of day columns,
 * each a stack of colour bands for what happened that day, today outlined, and a tooltip
 * naming the day's events. That grammar is reused rather than reinvented, because Ali
 * already reads it fluently every morning and a second visual language for the same idea
 * costs him the fluency.
 *
 * ── WHAT A COLUMN MEANS, AND WHAT IT DELIBERATELY DOES NOT ───────────────────────────────
 *
 * A column is a DAY, and its bands are the DISTINCT CLASSIFICATIONS that occurred that day —
 * not a count and not a magnitude. Three cancellations and one cancellation both render as
 * one `member_canceled` band.
 *
 * That is deliberate. Height here would have to encode either count or dollars, and both
 * mislead on this data: the membership stream's biggest "value" days are the ones where
 * unbillable signups arrived, so a dollar-scaled bar would make the worst days look like the
 * best. Magnitude belongs in the funnel and the headline, where it is labelled. The
 * sparkline answers "when did things happen, and of what kind" — identity over time.
 *
 * The exact count is one hover away and is in the table view, so nothing is hidden; it is
 * just not encoded in a channel that would lie.
 *
 * ── WHY NO AXIS ──────────────────────────────────────────────────────────────────────────
 *
 * A sparkline is a glance, and a 21-column strip with a labelled axis stops being one. The
 * ends are labelled in words underneath ("today" / the start date), which is what the
 * internship report does and is enough to place any column.
 */

export interface SparkEvent {
  at: string;
  classification: string;
  label: string;
}

export interface SparkClassification {
  key: string;
  label: string;
  tone: string;
  glyph: string;
}

interface Props {
  events: SparkEvent[];
  classifications: Record<string, SparkClassification>;
  /** How many day columns to draw. 21 matches the internship report. */
  days?: number;
  /** Injectable so tests are deterministic rather than dependent on the wall clock. */
  today?: Date;
  'data-testid'?: string;
}

/** ISO day strings sort in date order, so no Date parsing is needed per comparison. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDay(iso: string): string {
  const [, m, d] = iso.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
  return `${month} ${Number(d)}`;
}

export default function FlowSparkline({
  events,
  classifications,
  days = 21,
  today = new Date(),
  'data-testid': testId = 'flow-sparkline',
}: Props) {
  const [hover, setHover] = useState<{ iso: string; x: number } | null>(null);

  // Newest column on the LEFT, matching the internship report: the reader's eye lands on
  // today first, which is the column they came to see.
  const columns = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(today.getTime() - i * 86_400_000);
      out.push(isoDay(d));
    }
    return out;
  }, [days, today]);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of events) {
      const list = map.get(e.at) ?? [];
      // Distinct classifications per day; see the header for why this is not a count.
      if (!list.includes(e.classification)) list.push(e.classification);
      map.set(e.at, list);
    }
    return map;
  }, [events]);

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) map.set(e.at, (map.get(e.at) ?? 0) + 1);
    return map;
  }, [events]);

  const todayIso = isoDay(today);

  function describe(iso: string): string {
    const kinds = byDay.get(iso) ?? [];
    if (!kinds.length) return `${shortDay(iso)}: nothing`;
    const names = kinds.map((k) => classifications[k]?.label ?? k).join(', ');
    const n = countsByDay.get(iso) ?? 0;
    return `${shortDay(iso)}: ${names}${n > kinds.length ? ` (${n} events)` : ''}`;
  }

  return (
    <div style={{ position: 'relative' }} data-testid={testId}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0 }}>
        {columns.map((iso, idx) => {
          const kinds = byDay.get(iso) ?? [];
          const isToday = iso === todayIso;
          // Bands share the column height, each separated by a surface gap so two adjacent
          // bands never read as one. With no events the column is a flat empty track rather
          // than absent, so the day still occupies its place on the timeline.
          const n = Math.max(kinds.length, 1);
          const bandH = Math.max(
            3,
            Math.floor((MARK.COLUMN_H - (n - 1) * MARK.SEGMENT_GAP) / n),
          );
          return (
            <div
              key={iso}
              title={describe(iso)}
              onMouseEnter={(e) => setHover({ iso, x: e.currentTarget.offsetLeft })}
              onMouseLeave={() => setHover(null)}
              onFocus={(e) => setHover({ iso, x: e.currentTarget.offsetLeft })}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={describe(iso)}
              style={{
                width: MARK.COLUMN_W,
                // A hit target wider than the mark, per the interaction spec: 9px of mark is
                // not a thing anyone can reliably point at.
                padding: '4px 1px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                cursor: 'default',
                outline: isToday ? '2px solid var(--text-strong)' : 'none',
                outlineOffset: -1,
                background: idx % 2 === 1 ? 'transparent' : 'transparent',
              }}
            >
              {kinds.length === 0 ? (
                <div
                  style={{
                    height: MARK.COLUMN_H,
                    background: 'var(--surface-sunken)',
                    borderRadius: MARK.RADIUS,
                  }}
                />
              ) : (
                kinds.map((k, i) => (
                  <div
                    key={k}
                    style={{
                      height: bandH,
                      background: paintFor(classifications[k]?.tone ?? 'muted').fg,
                      borderRadius: MARK.RADIUS,
                      marginBottom: i === kinds.length - 1 ? 0 : MARK.SEGMENT_GAP,
                    }}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <div
        className="d-flex justify-content-between"
        style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}
      >
        <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>today</span>
        <span>{shortDay(columns[columns.length - 1])}</span>
      </div>

      {hover && (
        <div
          role="tooltip"
          data-testid={`${testId}-tooltip`}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: Math.max(0, hover.x - 60),
            marginBottom: 4,
            background: 'var(--surface-inverse)',
            color: 'var(--text-on-inverse)',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {describe(hover.iso)}
        </div>
      )}
    </div>
  );
}
