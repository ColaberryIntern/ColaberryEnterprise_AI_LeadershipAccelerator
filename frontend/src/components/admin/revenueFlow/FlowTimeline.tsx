import React, { useMemo } from 'react';
import { dollars, paintFor, streamPaint } from './flowTokens';

/**
 * R16 Phase 2 — every dated revenue event, newest day first.
 *
 * The internship report's "Everyone on one timeline" section, pointed at money instead of
 * interns: a date gutter on the left, and for each day the things that happened, each one a
 * pill wearing its classification's tone, glyph and label.
 *
 * ── WHY A GAP IS DRAWN RATHER THAN SKIPPED ───────────────────────────────────────────────
 *
 * When a run of days holds nothing, the report draws the gap and says how long it was
 * ("4 days, no build work") instead of silently closing it up. That is the single most
 * valuable thing the grammar does, and it carries over exactly: a revenue timeline that
 * quietly concatenates active days makes a quiet fortnight look like continuous activity.
 * Here the gap says "N days, nothing recorded", which on this data is frequently the honest
 * headline.
 *
 * ── THE VALUE ON A PILL IS NOT ALWAYS REVENUE, AND THE PILL SAYS SO ──────────────────────
 *
 * `never_paid` carries the amount the plan WOULD have been worth. Showing that figure
 * unqualified next to a real payment would be the exact error this surface exists to
 * prevent, so a non-revenue amount is prefixed "would have been" and wears the warn tone.
 * The decision of which is which is not made here: the backend's `direction` field carries
 * it, and this only renders what it is told.
 */

export interface TimelineEvent {
  at: string;
  classification: string;
  stream: string;
  label: string;
  entityKey: string | null;
  valueCents: number | null;
}

export interface TimelineClassification {
  key: string;
  label: string;
  tone: string;
  glyph: string;
  direction: string;
}

interface Props {
  events: TimelineEvent[];
  classifications: Record<string, TimelineClassification>;
  /** Render at most this many days, so a 180-day window does not produce a mile of DOM. */
  maxDays?: number;
  onPickEntity?: (streamKey: string, entityKey: string) => void;
  'data-testid'?: string;
}

function prettyDay(iso: string): { d: string; w: string } {
  const dt = new Date(`${iso}T12:00:00Z`);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()];
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  return { d: `${month} ${dt.getUTCDate()}`, w: weekday };
}

function daysBetween(laterIso: string, earlierIso: string): number {
  const a = Date.parse(`${laterIso}T00:00:00Z`);
  const b = Date.parse(`${earlierIso}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

export default function FlowTimeline({
  events,
  classifications,
  maxDays = 40,
  onPickEntity,
  'data-testid': testId = 'flow-timeline',
}: Props) {
  const days = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      const list = map.get(e.at) ?? [];
      list.push(e);
      map.set(e.at, list);
    }
    // Newest first. The payload is already sorted, but a component that depends on its
    // caller's ordering breaks silently the first time someone reuses it.
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, maxDays);
  }, [events, maxDays]);

  if (!days.length) {
    return (
      <div className="text-muted small" data-testid={`${testId}-empty`}>
        No dated revenue event falls inside this window. That is a statement about the
        window, not about the business.
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      {days.map(([iso, list], idx) => {
        const prev = days[idx - 1];
        const gap = prev ? daysBetween(prev[0], iso) - 1 : 0;
        const { d, w } = prettyDay(iso);
        return (
          <React.Fragment key={iso}>
            {gap > 0 && (
              <div
                className="d-flex"
                data-testid={`${testId}-gap`}
                style={{ fontSize: 11, color: 'var(--text-muted)' }}
              >
                <div style={{ width: 70 }} />
                <div
                  style={{
                    borderLeft: '3px dashed var(--border-subtle, #e2e8f0)',
                    padding: '4px 0 4px 10px',
                    marginLeft: 8,
                  }}
                >
                  {gap} day{gap === 1 ? '' : 's'}, nothing recorded
                </div>
              </div>
            )}

            <div className="d-flex" style={{ borderTop: '1px solid var(--border-subtle, #f1f5f9)' }}>
              <div style={{ width: 70, textAlign: 'right', paddingTop: 8, paddingRight: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>{d}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{w}</div>
              </div>
              <div style={{ flex: 1, padding: '6px 0 6px 10px', borderLeft: '3px solid var(--surface-sunken)' }}>
                {list.map((e, i) => {
                  const c = classifications[e.classification];
                  const paint = paintFor(c?.tone ?? 'muted');
                  const sp = streamPaint(e.stream);
                  const clickable = Boolean(onPickEntity && e.entityKey);
                  // "would have been" is the whole point: an amount on a non-revenue event
                  // is a counterfactual, and an unqualified figure reads as money.
                  const isCounterfactual = c?.direction === 'none' && e.classification === 'never_paid';
                  return (
                    <div
                      key={`${e.classification}-${e.entityKey ?? i}-${i}`}
                      style={{ margin: '3px 0' }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: sp.fg,
                          marginRight: 6,
                        }}
                        aria-hidden="true"
                      />
                      <span
                        role={clickable ? 'button' : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? () => onPickEntity!(e.stream, e.entityKey as string) : undefined}
                        onKeyDown={
                          clickable
                            ? (ev) => {
                              if (ev.key === 'Enter' || ev.key === ' ') {
                                ev.preventDefault();
                                onPickEntity!(e.stream, e.entityKey as string);
                              }
                            }
                            : undefined
                        }
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: 12,
                          lineHeight: 1.35,
                          background: paint.bg,
                          color: paint.fg,
                          border: `1px solid ${paint.fg}`,
                          cursor: clickable ? 'pointer' : 'default',
                        }}
                      >
                        <strong aria-hidden="true">{c?.glyph ?? '•'}</strong>{' '}
                        <strong>{c?.label ?? e.classification}</strong>
                        {': '}
                        <span style={{ color: 'var(--text-body)' }}>{e.label}</span>
                        {e.valueCents !== null && (
                          <span style={{ color: 'var(--text-body)', fontWeight: 700 }}>
                            {' '}
                            {isCounterfactual ? 'would have been ' : ''}
                            {dollars(e.valueCents)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
