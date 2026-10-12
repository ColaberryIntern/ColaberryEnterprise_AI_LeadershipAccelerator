/**
 * govGanttLayout — PURE, total layout math for the gov build-plan Gantt.
 *
 * "A Gantt is a date scale and two divs": given each release's [startDate, endDate], compute a shared
 * date axis and, per release, a {leftPct, widthPct} so a plain positioned div renders a proportional bar.
 * No React, no DOM, no I/O — every number here is reproducible in a test.
 */

export interface GanttReleaseInput { key: string; startDate: string; endDate: string }
export interface GanttBar { key: string; leftPct: number; widthPct: number }
export interface GanttAxis { minDate: string; maxDate: string; totalDays: number }
export interface GanttLayout { axis: GanttAxis | null; bars: GanttBar[] }

const DAY_MS = 24 * 60 * 60 * 1000;
const dayMs = (iso: string): number => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NaN : Math.floor(d.getTime() / DAY_MS) * DAY_MS;
};
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Lay releases out across a shared axis spanning the earliest start to the latest end. Bars are returned
 * left-to-right by start date. `minWidthPct` keeps a zero/one-day release visible. Degenerate input (all
 * the same date) yields minimum-width bars at the left, never NaN.
 */
export function layoutGantt(releases: GanttReleaseInput[], opts?: { minWidthPct?: number }): GanttLayout {
  const minWidth = opts?.minWidthPct ?? 2;
  const valid = (Array.isArray(releases) ? releases : []).filter(
    (r) => Number.isFinite(dayMs(r.startDate)) && Number.isFinite(dayMs(r.endDate)),
  );
  if (valid.length === 0) return { axis: null, bars: [] };

  const starts = valid.map((r) => dayMs(r.startDate));
  const ends = valid.map((r) => Math.max(dayMs(r.endDate), dayMs(r.startDate))); // end never before start
  const minMs = Math.min(...starts);
  const maxMs = Math.max(...ends);
  const spanMs = Math.max(DAY_MS, maxMs - minMs); // avoid /0 on a single-day axis

  const ordered = [...valid].sort((a, b) => dayMs(a.startDate) - dayMs(b.startDate));
  const bars: GanttBar[] = ordered.map((r) => {
    const s = dayMs(r.startDate);
    const e = Math.max(dayMs(r.endDate), s);
    let leftPct = clamp(((s - minMs) / spanMs) * 100, 0, 100);
    let widthPct = clamp(((e - s) / spanMs) * 100, minWidth, 100);
    if (leftPct + widthPct > 100) leftPct = Math.max(0, 100 - widthPct);
    return { key: r.key, leftPct, widthPct };
  });

  return {
    axis: { minDate: isoDay(minMs), maxDate: isoDay(maxMs), totalDays: Math.round((maxMs - minMs) / DAY_MS) },
    bars,
  };
}
