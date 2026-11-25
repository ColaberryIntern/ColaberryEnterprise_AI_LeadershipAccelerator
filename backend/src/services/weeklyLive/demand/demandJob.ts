import { Op } from 'sequelize';
import { WeeklyLiveDemand } from '../../../models/WeeklyLive';
import { classifyError } from '../../../utils/errorClassifier';
import { centralDate } from '../curriculumMap';
import { shiftDays } from '../signals/signalsJob';
import { getPage as realGet, median, parseVideos, parseWatchViews, type GetPage, type Video } from './youtubePages';

/**
 * YouTube demand by curriculum week (WL3.2): the best video on the week's angle in the last 90 days,
 * as a multiple of its channel's usual views. The usual is the median of the channel's 10 latest
 * uploads at least 14 days old (newer ones are still gaining views); fewer than 10 sets thin_median.
 *
 * Score, deterministic: 5 = 3x or more on the exact angle; 4 = 3x or more near it; 3 = beat the
 * median; 1 = did not; no median caps at 2; nothing found in 90 days is 1.
 *
 * Cached 7 days per week. Requests are spaced 1.2 s apart. A week that fails is stored with its error
 * and no score, never guessed, and is retried on the next run; the other weeks still complete.
 */
export interface Angle { queries: readonly string[]; exact: RegExp; }
export const ANGLES: Readonly<Record<number, Angle>> = {
  1: { queries: ['claude code tutorial', 'claude code for beginners'], exact: /claude code/i },
  2: { queries: ['claude skills', 'claude agent skills'], exact: /\bskills?\b/i },
  3: { queries: ['build ai agent claude', 'claude api assistant'], exact: /\bagents?\b|assistant|workflow/i },
  4: { queries: ['claude prompt engineering', 'stop prompting claude'], exact: /prompt/i },
  5: { queries: ['mcp explained', 'model context protocol'], exact: /\bmcp\b/i },
  6: { queries: ['mcp integration', 'mcp server tutorial'], exact: /\bmcp\b/i },
  7: { queries: ['claude subagents', 'multi agent team'], exact: /sub-?agents?|multi-?agent/i },
  8: { queries: ['automate with claude code', 'claude code workflow automation'], exact: /automat|workflow/i },
  9: { queries: ['ai evals', 'ai agent reliability testing'], exact: /\bevals?\b|evaluation|reliab/i },
  10: { queries: ['ai governance', 'ai agent human in the loop'], exact: /governance|guardrail|human in the loop/i },
  11: { queries: ['agentic ai system design', 'ai agent architecture'], exact: /system design|architecture/i },
  12: { queries: ['ai software factory', 'build app end to end claude code'], exact: /factory|end.to.end/i },
};
export const CACHE_DAYS = 7;
const MAX_AGE_DAYS = 90;
const MIN_UPLOAD_AGE_DAYS = 14;
const UPLOADS = 10;
const TOP = 3;
const SPACING_MS = 1200;
/** No filter, this month, this year. */
const RECENCY = ['', '&sp=EgQIBBAB', '&sp=EgQIBRAB'];

export interface DemandRow {
  week: number; video_url: string | null; video_title: string | null; channel: string | null; views: number | null;
  channel_median: number | null; multiple: number | null; score: number | null; thin_median: boolean; error: string | null;
}

export function demandScore(multiple: number | null, exact: boolean): number {
  if (multiple === null) return 2;
  if (multiple >= 3) return exact ? 5 : 4;
  return multiple >= 1 ? 3 : 1;
}

export function channelMedian(uploads: Video[]): { value: number | null; thin: boolean } {
  const old = uploads.filter((v) => v.ageDays !== null && v.ageDays >= MIN_UPLOAD_AGE_DAYS && v.views !== null).slice(0, UPLOADS);
  return { value: median(old.map((v) => v.views)), thin: old.length < UPLOADS };
}

export async function measureWeek(week: number, get: GetPage): Promise<DemandRow> {
  const angle = ANGLES[week];
  // Plain search ranks years-old videos first, so each query is also asked for this month and this year.
  const found = new Map<string, Video>();
  for (const q of angle.queries) {
    for (const sp of RECENCY) {
      for (const v of parseVideos(await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}${sp}`))) if (!found.has(v.id)) found.set(v.id, v);
    }
  }
  const recent = [...found.values()].filter((v) => v.ageDays !== null && v.ageDays <= MAX_AGE_DAYS && v.views !== null && v.handle)
    .sort((a, b) => (b.views || 0) - (a.views || 0));
  // The week's own angle comes first: a bigger video about something else is not demand for this week.
  const exact = recent.filter((v) => angle.exact.test(v.title));
  const top = (exact.length ? exact : recent).slice(0, TOP);
  const none: DemandRow = { week, video_url: null, video_title: null, channel: null, views: null, channel_median: null, multiple: null, score: 1, thin_median: false, error: null };
  if (!top.length) return none;
  const rows: DemandRow[] = [];
  for (const v of top) {
    const url = `https://www.youtube.com/watch?v=${v.id}`;
    const views = parseWatchViews(await get(url)) ?? v.views;
    const med = channelMedian(parseVideos(await get(`https://www.youtube.com/${v.handle}/videos`)));
    const multiple = med.value && views !== null ? Math.round((views / med.value) * 10) / 10 : null;
    rows.push({ week, video_url: url, video_title: v.title.slice(0, 500), channel: (v.channel || v.handle).slice(0, 200), views,
      channel_median: med.value, multiple, score: demandScore(multiple, angle.exact.test(v.title)), thin_median: med.thin, error: null });
  }
  return rows.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.views || 0) - (a.views || 0))[0];
}

export interface DemandDeps { get?: GetPage; today?: string; pause?: (ms: number) => Promise<void>; }
export interface DemandResult { measured: number[]; cached: number[]; failed: number[]; }

export async function runDemand(deps: DemandDeps = {}): Promise<DemandResult> {
  const { get = realGet, today = centralDate(), pause = (ms) => new Promise<void>((r) => { setTimeout(r, ms); }) } = deps;
  const spaced: GetPage = async (url) => { await pause(SPACING_MS); return get(url); };
  const fresh = await WeeklyLiveDemand.findAll({ where: { measured_at: { [Op.gt]: shiftDays(today, -CACHE_DAYS) }, error: null } });
  const cached = [...new Set(fresh.map((r) => r.week))].sort((a, b) => a - b);
  const result: DemandResult = { measured: [], cached, failed: [] };
  for (const week of Object.keys(ANGLES).map(Number).filter((w) => !cached.includes(w))) {
    let row: DemandRow;
    try { row = await measureWeek(week, spaced); result.measured.push(week); } catch (e) {
      const errorClass = classifyError(e);
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'weekly_live.demand_week', outcome: 'failure', error_class: errorClass, context: { week } }));
      row = { week, video_url: null, video_title: null, channel: null, views: null, channel_median: null, multiple: null, score: null, thin_median: false, error: `${errorClass}: ${e instanceof Error ? e.message : 'failed'}`.slice(0, 200) };
      result.failed.push(week);
    }
    // any: the model types DECIMAL as string on read; numbers are accepted on write.
    await WeeklyLiveDemand.upsert({ ...row, measured_at: today } as never, { conflictFields: ['week', 'measured_at'] as never });
  }
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'weekly_live.demand', outcome: result.failed.length ? 'partial' : 'success', context: result }));
  return result;
}

/** The newest good measurement of each week (or its newest error row when it has never succeeded). */
export async function latestDemand(): Promise<WeeklyLiveDemand[]> {
  const rows = await WeeklyLiveDemand.findAll({ order: [['week', 'ASC'], ['measured_at', 'DESC']] });
  const byWeek = new Map<number, WeeklyLiveDemand>();
  for (const r of rows) { const cur = byWeek.get(r.week); if (!cur || (cur.error && !r.error)) byWeek.set(r.week, r); }
  return [...byWeek.values()];
}
