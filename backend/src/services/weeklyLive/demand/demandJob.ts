import { Op } from 'sequelize';
import { WeeklyLiveDemand } from '../../../models/WeeklyLive';
import { classifyError } from '../../../utils/errorClassifier';
import { centralDate } from '../curriculumMap';
import { shiftDays } from '../signals/signalsJob';
import { youtubeGet } from '../../composer/youtubeClient';
import { channelUploads, median, searchIds, videosById, type ApiGet, type Video } from './youtubeApi';

/**
 * YouTube demand by curriculum week (WL3.2): the best video on the week's angle in the last 90 days,
 * as a multiple of its channel's usual views. The usual is the median of the channel's 10 latest
 * uploads at least 14 days old (newer ones are still gaining views); fewer than 10 sets thin_median.
 *
 * Score, deterministic: 5 = 3x or more on the exact angle; 4 = 3x or more near it; 3 = beat the
 * median; 1 = did not; no median caps at 2; nothing found in 90 days is 1.
 *
 * Cached 7 days per week, requests spaced, so a full run is about 2,500 API units a week. A week that fails is stored with its error
 * and no score, never guessed, and is retried on the next run; the other weeks still complete.
 */
export interface Angle { queries: readonly string[]; exact: RegExp; }
/** `exact` is the week's own subject in a title: week 2 is the Skills feature (plural), not one template; week 10 governs agents. */
export const ANGLES: Readonly<Record<number, Angle>> = {
  1: { queries: ['claude code tutorial', 'claude code for beginners'], exact: /claude code.*(tutorial|course|beginner|learn)|(tutorial|course|beginner|learn).*claude code/i },
  2: { queries: ['claude skills', 'claude agent skills'], exact: /\bskills\b/i },
  3: { queries: ['build ai agent claude', 'claude api assistant'], exact: /\bagents?\b|assistant|workflow/i },
  4: { queries: ['claude prompt engineering', 'stop prompting claude'], exact: /prompt/i },
  5: { queries: ['mcp explained', 'model context protocol'], exact: /\bmcp\b/i },
  6: { queries: ['mcp integration', 'mcp server tutorial'], exact: /\bmcp\b.*(server|integrat|connect|build)|(server|integrat|connect|build).*\bmcp\b/i },
  7: { queries: ['claude subagents', 'multi agent team'], exact: /sub-?agents?|multi-?agent/i },
  8: { queries: ['automate with claude code', 'claude code workflow automation'], exact: /automat|workflow/i },
  9: { queries: ['ai evals', 'ai agent reliability testing'], exact: /\bevals?\b|evaluation|reliab/i },
  10: { queries: ['ai governance', 'ai agent human in the loop'], exact: /agent.*(governance|guardrail)|(governance|guardrail).*agent|humans?.in.the.loop/i },
  11: { queries: ['agentic ai system design', 'ai agent architecture'], exact: /system design|architecture/i },
  12: { queries: ['ai software factory', 'build app end to end claude code'], exact: /factory|end.to.end/i },
};
export const CACHE_DAYS = 7;
const MAX_AGE_DAYS = 90;
/**
 * Entertainment, not a lesson (2026-11-27: week 10 picked "Human in the Loop - Claude Opus 5.5 Music Video").
 * Lesson words are NOT required: half the owner's reference picks have none ("Stop Prompting Claude...").
 */
const NOT_A_LESSON = /\b(music video|official (music )?video|official audio|lyrics?|song|full album|trailer|reaction|reacts?|live ?stream|podcast|ep(isode)?\.? ?\d+|news recap|meme|parody|funny|comedy|prank|asmr)\b/i;
export const isLesson = (title: string): boolean => !NOT_A_LESSON.test(title);
const MIN_UPLOAD_AGE_DAYS = 14;
const UPLOADS = 10;
const TOP = 3;
const SPACING_MS = 250;

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
  const old = uploads.filter((v) => v.ageDays >= MIN_UPLOAD_AGE_DAYS && v.views !== null).slice(0, UPLOADS);
  return { value: median(old.map((v) => v.views)), thin: old.length < UPLOADS };
}

/** `taken`: videos other weeks already use. One video is evidence for one week. */
export async function measureWeek(week: number, get: ApiGet, now = Date.now(), taken: ReadonlySet<string> = new Set()): Promise<DemandRow> {
  const angle = ANGLES[week];
  const ids = await searchIds(angle.queries, MAX_AGE_DAYS, get, now);
  const recent = (ids.length ? await videosById(ids, get, now) : []).filter((v) => v.ageDays <= MAX_AGE_DAYS && v.views !== null && v.english && isLesson(v.title) && !taken.has(v.id))
    .sort((a, b) => (b.views || 0) - (a.views || 0));
  // The week's own angle comes first: a bigger video about something else is not demand for this week.
  const exact = recent.filter((v) => angle.exact.test(v.title));
  const top = (exact.length ? exact : recent).slice(0, TOP);
  const none: DemandRow = { week, video_url: null, video_title: null, channel: null, views: null, channel_median: null, multiple: null, score: 1, thin_median: false, error: null };
  if (!top.length) return none;
  const rows: DemandRow[] = [];
  for (const v of top) {
    const url = `https://www.youtube.com/watch?v=${v.id}`;
    const { views } = v;
    const med = channelMedian(await channelUploads(v.channelId, get, now));
    const multiple = med.value && views !== null ? Math.round((views / med.value) * 10) / 10 : null;
    rows.push({ week, video_url: url, video_title: v.title.slice(0, 500), channel: v.channel.slice(0, 200), views,
      channel_median: med.value, multiple, score: demandScore(multiple, angle.exact.test(v.title)), thin_median: med.thin, error: null });
  }
  return rows.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.views || 0) - (a.views || 0))[0];
}

const videoId = (url: string | null): string[] => { const id = url?.split('v=')[1]; return id ? [id] : []; };

export interface DemandDeps { get?: ApiGet; today?: string; pause?: (ms: number) => Promise<void>; }
export interface DemandResult { measured: number[]; cached: number[]; failed: number[]; }

export async function runDemand(deps: DemandDeps = {}): Promise<DemandResult> {
  const { get = youtubeGet, today = centralDate(), pause = (ms) => new Promise<void>((r) => { setTimeout(r, ms); }) } = deps;
  const spaced: ApiGet = async (path, params) => { await pause(SPACING_MS); return get(path, params); };
  const fresh = await WeeklyLiveDemand.findAll({ where: { measured_at: { [Op.gt]: shiftDays(today, -CACHE_DAYS) }, error: null } });
  const cached = [...new Set(fresh.map((r) => r.week))].sort((a, b) => a - b);
  const taken = new Set(fresh.flatMap((r) => videoId(r.video_url)));
  const result: DemandResult = { measured: [], cached, failed: [] };
  for (const week of Object.keys(ANGLES).map(Number).filter((w) => !cached.includes(w))) {
    let row: DemandRow;
    try { row = await measureWeek(week, spaced, Date.now(), taken); videoId(row.video_url).forEach((id) => taken.add(id)); result.measured.push(week); } catch (e) {
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
