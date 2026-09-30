import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TimelineEvent } from '../../../adminOs/personTypes';

/**
 * The activity timeline as one picture.
 *
 * Every event the table lists is here, in the same order and with the same
 * data, but laid out on a shared time axis: one lane per domain, one dot per
 * event, and a per-day count on top so the rhythm of the whole period reads
 * before any single row does. Clicking a dot opens the same raw-record modal
 * the table row opens, so nothing is reachable in one view and not the other.
 *
 * Deliberately not a charting library: the lanes, the day grid and the
 * tooltip are a few hundred lines of SVG, and a library would fight the
 * lane/dot layout at every step.
 */

interface Props {
  events: TimelineEvent[];
  /** Lanes, in the order the API listed them. Every domain gets a lane, even if empty. */
  domains: string[];
  /** 'all' or a single domain. Other lanes are dimmed, never removed. */
  domainFilter: string;
  onSelect: (e: TimelineEvent) => void;
}

type RangeKey = '7d' | '14d' | '30d' | '90d' | 'all';
const RANGES: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '14d', label: '14 days', days: 14 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'Everything', days: null },
];

/** Same tones the table badges use, so a lane and a badge are the same colour. */
const DOMAIN_COLOR: Record<string, string> = {
  acquisition: 'var(--bs-info)',
  sales: 'var(--bs-primary)',
  communication: 'var(--bs-secondary)',
  commerce: 'var(--bs-success)',
  learning: 'var(--bs-warning)',
  community: 'var(--bs-dark)',
};
const DEFAULT_COLOR = 'var(--bs-secondary)';

const LANE_H = 38;
const DENSITY_H = 64;
const AXIS_H = 26;
const GAP = 10;
const MIN_DAY_PX = 16;
const PAD_RIGHT = 12;
const LABEL_W = 176;
const DAY_MS = 86_400_000;

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (t: number) => startOfDay(t);

/** "+25" inside a summary is the points the event awarded; drawn as dot size. */
const pointsOf = (e: TimelineEvent): number => {
  const m = e.summary?.match(/\(\+(\d+)\)/);
  return m ? Number(m[1]) : 0;
};

const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

interface Dot {
  event: TimelineEvent;
  t: number;
  domain: string;
  points: number;
  x: number;
  y: number;
  r: number;
}

export default function PersonActivityChart({ events, domains, domainFilter, onSelect }: Props) {
  const [range, setRange] = useState<RangeKey>('30d');
  const [hover, setHover] = useState<Dot | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(900);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setViewW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const parsed = useMemo(
    () => events
      .map((e) => ({ e, t: new Date(e.occurredAt).getTime() }))
      .filter((p) => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t),
    [events],
  );

  // Window: ends today (so a quiet recent stretch is visible as empty space,
  // not hidden by an axis that stops at the last event) and starts either N
  // days back or at the first event.
  const lanes = domains.length ? domains : Array.from(new Set(parsed.map((p) => p.e.domain)));
  const todayStart = startOfDay(Date.now());
  const firstT = parsed.length ? parsed[0].t : todayStart;
  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? null;
  const windowStart = rangeDays ? Math.min(todayStart - (rangeDays - 1) * DAY_MS, todayStart) : startOfDay(firstT);
  const windowEnd = todayStart + DAY_MS;
  const dayCount = Math.max(1, Math.round((windowEnd - windowStart) / DAY_MS));

  const plotW = Math.max(viewW - PAD_RIGHT, dayCount * MIN_DAY_PX);
  const dayPx = plotW / dayCount;
  // Memoised so it can be a declared dependency of the dot layout below.
  // Every dependency stays listed, and no eslint-disable is needed: that
  // comment for react-hooks/exhaustive-deps is itself a build error under this
  // project's CRA config, and has broken a production build before.
  const xOf = useCallback(
    (t: number) => ((t - windowStart) / (windowEnd - windowStart)) * plotW,
    [windowStart, windowEnd, plotW],
  );

  const inWindow = useMemo(
    () => parsed.filter((p) => p.t >= windowStart && p.t < windowEnd),
    [parsed, windowStart, windowEnd],
  );
  const hiddenBefore = parsed.length - inWindow.length;

  // Per-day, per-lane counts for the density strip (occurrences, not rows, so
  // a collapsed x8 weighs as eight).
  const density = useMemo(() => {
    const byDay = new Map<number, Record<string, number>>();
    for (const p of inWindow) {
      const k = dayKey(p.t);
      const row = byDay.get(k) ?? {};
      row[p.e.domain] = (row[p.e.domain] ?? 0) + Math.max(1, p.e.occurrences || 1);
      byDay.set(k, row);
    }
    let max = 0;
    byDay.forEach((row) => { max = Math.max(max, Object.values(row).reduce((a, b) => a + b, 0)); });
    return { byDay, max };
  }, [inWindow]);

  // Dots: same lane, same day are spread vertically so they do not stack
  // into one indistinguishable blob at 6:29 PM.
  const dots = useMemo<Dot[]>(() => {
    const groups = new Map<string, Array<{ e: TimelineEvent; t: number }>>();
    for (const p of inWindow) {
      const k = `${p.e.domain}|${dayKey(p.t)}`;
      const g = groups.get(k) ?? [];
      g.push(p);
      groups.set(k, g);
    }
    const out: Dot[] = [];
    groups.forEach((g) => {
      g.forEach((p, i) => {
        const laneIdx = Math.max(0, lanes.indexOf(p.e.domain));
        const laneTop = AXIS_H + DENSITY_H + GAP + laneIdx * LANE_H;
        const spread = g.length > 1 ? (i / (g.length - 1)) - 0.5 : 0;
        const points = pointsOf(p.e);
        out.push({
          event: p.e, t: p.t, domain: p.e.domain, points,
          x: xOf(p.t),
          y: laneTop + LANE_H / 2 + spread * (LANE_H * 0.5),
          r: 4.5 + Math.min(4, Math.sqrt(points) * 0.5),
        });
      });
    });
    return out;
  }, [inWindow, lanes, xOf]);

  const totalH = AXIS_H + DENSITY_H + GAP + lanes.length * LANE_H;

  // Headline facts for the window, from the same rows the chart draws.
  const activeDays = density.byDay.size;
  const eventCount = inWindow.reduce((a, p) => a + Math.max(1, p.e.occurrences || 1), 0);
  const pointsEarned = inWindow.reduce((a, p) => a + pointsOf(p.e), 0);
  const busiest = Array.from(density.byDay.entries())
    .map(([day, row]) => ({ day, n: Object.values(row).reduce((a, b) => a + b, 0) }))
    .reduce<{ day: number; n: number } | null>((best, cur) => (!best || cur.n > best.n ? cur : best), null);

  // Axis labels: every day when there is room, otherwise every Monday.
  const tickDays: number[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const d = windowStart + i * DAY_MS;
    const dow = new Date(d).getDay();
    if (dayPx >= 44 || dow === 1) tickDays.push(d);
  }

  const laneDim = (d: string) => (domainFilter !== 'all' && d !== domainFilter ? 0.18 : 1);

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`btn ${range === r.key ? 'btn-dark' : 'btn-outline-secondary'}`}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="d-flex flex-wrap gap-4 small text-muted ms-auto" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <span><strong className="text-body">{activeDays}</strong> of {dayCount} days active</span>
          <span><strong className="text-body">{eventCount}</strong> events</span>
          {pointsEarned > 0 && <span><strong className="text-body">+{pointsEarned}</strong> points</span>}
          {busiest && <span>busiest <strong className="text-body">{fmtDay(busiest.day)}</strong> ({busiest.n})</span>}
          {hiddenBefore > 0 && <span>{hiddenBefore} earlier, outside this window</span>}
        </div>
      </div>

      {parsed.length === 0 ? (
        <p className="text-muted small text-center mb-0 py-4">No recorded activity in the areas you can see.</p>
      ) : (
        <div className="d-flex" style={{ position: 'relative' }}>
          {/* Fixed lane labels, outside the scroll region so they stay put. */}
          <div style={{ flex: `0 0 ${LABEL_W}px`, paddingTop: AXIS_H }}>
            <div style={{ height: DENSITY_H + GAP }} className="d-flex align-items-end pb-1 small text-muted">
              events / day
            </div>
            {lanes.map((d) => {
              const n = inWindow.filter((p) => p.e.domain === d).length;
              return (
                <div
                  key={d}
                  className="d-flex align-items-center justify-content-between pe-3 small"
                  style={{ height: LANE_H, opacity: laneDim(d) }}
                >
                  <span className="d-flex align-items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: DOMAIN_COLOR[d] ?? DEFAULT_COLOR, display: 'inline-block' }} />
                    <span className="fw-medium text-truncate" style={{ maxWidth: 124 }}>{d}</span>
                  </span>
                  <span className="text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{n || ''}</span>
                </div>
              );
            })}
          </div>

          <div ref={scrollRef} style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
            <svg
              width={plotW + PAD_RIGHT}
              height={totalH}
              style={{ display: 'block', fontFamily: 'inherit' }}
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label="Activity by domain over time"
            >
              {/* Day columns: weekend tint, hairline grid. */}
              {Array.from({ length: dayCount }, (_, i) => {
                const d = windowStart + i * DAY_MS;
                const dow = new Date(d).getDay();
                const x = i * dayPx;
                return (
                  <g key={d}>
                    {(dow === 0 || dow === 6) && (
                      <rect x={x} y={AXIS_H} width={dayPx} height={totalH - AXIS_H} fill="var(--bs-tertiary-bg)" />
                    )}
                    <line x1={x} x2={x} y1={AXIS_H} y2={totalH} stroke="var(--bs-border-color)" strokeWidth={0.5} />
                  </g>
                );
              })}

              {/* Axis. */}
              {tickDays.map((d) => (
                <text
                  key={d}
                  x={xOf(d) + 4}
                  y={AXIS_H - 9}
                  fontSize={11}
                  fill="var(--bs-secondary-color)"
                >
                  {fmtDay(d)}
                </text>
              ))}

              {/* Density strip: one stacked column per day, coloured by lane. */}
              {Array.from(density.byDay.entries()).map(([day, row]) => {
                const x = xOf(day) + Math.max(1, dayPx * 0.15);
                const w = Math.max(3, dayPx * 0.7);
                let yCursor = AXIS_H + DENSITY_H;
                return (
                  <g key={day}>
                    {lanes.filter((d) => row[d]).map((d) => {
                      const h = (row[d] / Math.max(1, density.max)) * (DENSITY_H - 4);
                      yCursor -= h;
                      return (
                        <rect
                          key={d}
                          x={x}
                          y={yCursor}
                          width={w}
                          height={h}
                          fill={DOMAIN_COLOR[d] ?? DEFAULT_COLOR}
                          opacity={laneDim(d) * 0.9}
                        />
                      );
                    })}
                  </g>
                );
              })}
              <line
                x1={0} x2={plotW} y1={AXIS_H + DENSITY_H} y2={AXIS_H + DENSITY_H}
                stroke="var(--bs-border-color)" strokeWidth={1}
              />

              {/* Lane separators. */}
              {lanes.map((d, i) => {
                const y = AXIS_H + DENSITY_H + GAP + (i + 1) * LANE_H;
                return <line key={d} x1={0} x2={plotW} y1={y} y2={y} stroke="var(--bs-border-color)" strokeWidth={0.75} />;
              })}

              {/* Today. */}
              <line
                x1={xOf(todayStart)} x2={xOf(todayStart)} y1={AXIS_H} y2={totalH}
                stroke="var(--bs-danger)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7}
              />

              {/* Events. */}
              {dots.map((dot, i) => {
                const collapsed = (dot.event.occurrences || 1) > 1;
                return (
                  <g
                    key={`${dot.event.source}-${dot.event.occurredAt}-${i}`}
                    style={{ cursor: 'pointer' }}
                    opacity={laneDim(dot.domain)}
                    onMouseEnter={() => setHover(dot)}
                    onClick={() => onSelect(dot.event)}
                  >
                    {/* Wider invisible target than the dot itself. */}
                    <circle cx={dot.x} cy={dot.y} r={Math.max(9, dot.r + 3)} fill="transparent" />
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={dot.r}
                      fill={DOMAIN_COLOR[dot.domain] ?? DEFAULT_COLOR}
                      stroke="var(--bs-body-bg)"
                      strokeWidth={1.5}
                    />
                    {collapsed && (
                      <circle
                        cx={dot.x} cy={dot.y} r={dot.r + 3}
                        fill="none" stroke={DOMAIN_COLOR[dot.domain] ?? DEFAULT_COLOR} strokeWidth={1}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {hover && (
            <div
              className="shadow-sm border rounded bg-body px-2 py-1 small"
              style={{
                position: 'absolute',
                left: LABEL_W + Math.min(hover.x - (scrollRef.current?.scrollLeft ?? 0), Math.max(0, viewW - 300)),
                top: hover.y + 14,
                pointerEvents: 'none',
                zIndex: 2,
                maxWidth: 300,
                whiteSpace: 'nowrap',
              }}
            >
              <div className="fw-medium">
                {hover.event.type}
                {(hover.event.occurrences || 1) > 1 && (
                  <span className="text-muted ms-1">×{hover.event.occurrences}</span>
                )}
              </div>
              {hover.event.summary && <div className="text-muted text-truncate">{hover.event.summary}</div>}
              <div className="text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtDay(hover.t)}, {fmtTime(hover.t)}
              </div>
              <div className="text-muted" style={{ fontSize: '.75rem' }}>
                {hover.event.source}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
