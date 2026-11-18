/**
 * OH1f: the content brain behind the Open House countdown emails.
 *
 * Ali, 2026-11-18: "These AI drafts suck. If someone emailed me 5 times before an event
 * with basically the same message, I'd be pissed. You have to use all that great context
 * you have, but always center it around Open House." And: "I want email to use the same
 * brain" - the shelves Explorer Growth reads (MAYA_CONTENT_BRAIN.html): live events, the
 * course, their own progress, builder spotlights from hire.refactored.ai.
 *
 * So each countdown email is handed ONE distinct piece from the brain, and the Open House
 * is the frame around it:
 *
 *   their_progress     what THEY did on the platform, and the one next step (7 days out)
 *   builder_spotlight  a real builder and what they shipped, with the public link, plus the
 *                      next live event on the Events schedule (3 days out)
 *   day_of             no piece: when, the Join link, nothing else (the day of)
 *
 * Every piece is read live at send time (nothing static), from sources that are already
 * public or already the person's own. A piece that cannot be read degrades to nothing,
 * never to an invented fact: the step's instructions say what to do without it.
 *
 * This file also owns the two rules that keep the countdown from feeling like spam:
 * no two touches to one person within 24 hours (spacingProblems), and no draft that
 * re-says an earlier email (repetitionScore).
 *
 * OH1i (T3): the rest of the shelves, shared by the countdown and Explorer Growth:
 *
 *   live_event       the next live events on the Events schedule (not the Open House), 14 days
 *   community_pulse  what the cohort posted in the last 14 days: themes and counts only, never a
 *                    quote, never a name; posts that are neither a ritual nor liked are dropped
 *                    (that is where the spam sits)
 *   ai_fact          one APPROVED fact from maya_brain_items (Claim Registry id or public source)
 *   build_prompt     one APPROVED build prompt that passed its test-build (maya_brain_items)
 *   weekly_progress  their last 7 days (lessons, points), what is next on their Today page, and
 *                    the next live event. Content only: no campaign sends it
 *
 * Every reader is injectable (BrainDeps), so each piece is tested with verified content, with
 * nothing (an empty block), and with a reader that throws (an empty block, never invented).
 */
import type { SequenceStep } from '../models/FollowUpSequence';
import type { BrainItem, BrainItemKind } from './mayaBrain/mayaBrainItems';
import { isPublicSourceUrl, isServable } from './mayaBrain/mayaBrainItems';

export type BrainPiece =
  | 'their_progress' | 'builder_spotlight' | 'day_of'
  | 'live_event' | 'community_pulse' | 'ai_fact' | 'build_prompt' | 'weekly_progress'
  | 'week_ahead';

export const BRAIN_PIECES: readonly BrainPiece[] = [
  'their_progress', 'builder_spotlight', 'day_of',
  'live_event', 'community_pulse', 'ai_fact', 'build_prompt', 'weekly_progress',
  'week_ahead',
];

export const PORTAL_EVENTS_URL = 'https://enterprise.colaberry.ai/portal/events';
export const HIRE_BASE_URL = 'https://hire.refactored.ai';

/** What the AI is handed for one email, and the extra links that email may carry. */
export interface BrainPieceResult {
  piece: BrainPiece;
  /** Labelled prompt block. Empty when there is nothing verified to say. */
  block: string;
  /** Links this email may carry beyond the Join link (the copy screen allows exactly these). */
  allowedLinks: string[];
  /**
   * The item used, so a caller never sends it to the same person twice: the maya_brain_items row
   * (ai_fact / build_prompt), and OH1o `builder:<case study>`, `event:<title>@<date>`,
   * `community:<theme>:<week>`, `week_ahead:<week>`.
   */
  itemId?: string;
}

/** The minimum time between two touches to one person (Ali: "we can't contact the same person within 24 hours"). */
export const MIN_HOURS_BETWEEN_TOUCHES = 24;

/**
 * Every pair of countdown steps must be at least 24 hours apart. Returns the offending
 * pairs in plain words; empty means the cadence is legal. Pinned by a test, so a future
 * "one more reminder" cannot quietly put two touches inside a day.
 */
export function spacingProblems(steps: Pick<SequenceStep, 'minutes_before_event' | 'channel'>[]): string[] {
  const at = steps
    .map((s) => s.minutes_before_event)
    .filter((m): m is number => typeof m === 'number')
    .sort((a, b) => b - a);
  const problems: string[] = [];
  for (let i = 1; i < at.length; i++) {
    const gapH = (at[i - 1] - at[i]) / 60;
    if (gapH < MIN_HOURS_BETWEEN_TOUCHES) problems.push(`T-${at[i - 1]}min and T-${at[i]}min are ${gapH}h apart`);
  }
  return problems;
}

/**
 * The Open House takes precedence over every other message (Ali, 2026-11-18). Given the
 * person's countdown touches within 24 hours of now (sent or due), another campaign's
 * message waits until 24 hours after the latest of them. Null = nothing near, send.
 */
export function countdownYieldUntil(nearCountdownTouches: Date[]): Date | null {
  const valid = nearCountdownTouches.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  if (valid.length === 0) return null;
  const latest = Math.max(...valid.map((d) => d.getTime()));
  return new Date(latest + MIN_HOURS_BETWEEN_TOUCHES * 3600 * 1000);
}

/** Plain words of a body: tags, links and the greeting line stripped. */
function words(text: string): string[] {
  return (text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(text: string, n = 4): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/**
 * How much of a new draft re-says an earlier email: the share of the draft's 4-word
 * phrases that already appeared in any earlier body (0 = all new, 1 = a copy). The
 * countdown's three emails share a subject (the Open House), so a little overlap is
 * expected ("the Open House on Thursday"); a draft above REPETITION_LIMIT is rejected
 * and the step's own fallback goes instead.
 */
export function repetitionScore(draft: string, earlier: string[]): number {
  const mine = shingles(draft);
  if (mine.size === 0 || earlier.length === 0) return 0;
  const seen = new Set<string>();
  for (const e of earlier) for (const s of shingles(e)) seen.add(s);
  let hit = 0;
  for (const s of mine) if (seen.has(s)) hit++;
  return hit / mine.size;
}

export const REPETITION_LIMIT = 0.3;

/** Stable small hash, so one person always meets the same builder (and two people often meet different ones). */
export function seedIndex(seed: string, size: number): number {
  if (size <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % size;
}

export interface SpotlightFacts {
  /** OH1o: `builder:<case study slug>`, the item id that keeps one person from meeting the same builder twice. */
  id?: string;
  name: string;
  role: string | null;
  title: string;
  industry: string | null;
  metric: string | null;
  url: string;
}

export interface LiveEventFacts {
  title: string;
  when: string;
}

/** The builder block (pure). */
export function renderSpotlight(s: SpotlightFacts | null, ev: LiveEventFacts | null): BrainPieceResult {
  const lines: string[] = [];
  const allowedLinks: string[] = [];
  if (s) {
    lines.push('A REAL BUILDER (public on hire.refactored.ai; use their first name and what they built)');
    lines.push(`- ${s.name}${s.role ? `, ${s.role}` : ''}`);
    lines.push(`- What they built: "${s.title}"${s.industry ? ` (${s.industry})` : ''}`);
    if (s.metric) lines.push(`- The result, in their case study: ${s.metric}`);
    lines.push(`- Their story, public: ${s.url}`);
    allowedLinks.push(s.url);
  }
  if (ev) {
    lines.push('THE NEXT LIVE EVENT ON THE EVENTS SCHEDULE (besides the Open House)');
    lines.push(`- ${ev.title}, ${ev.when}`);
    lines.push(`- The Events schedule: ${PORTAL_EVENTS_URL}`);
    allowedLinks.push(PORTAL_EVENTS_URL);
  }
  return { piece: 'builder_spotlight', block: lines.join('\n'), allowedLinks, ...(s?.id ? { itemId: s.id } : {}) };
}

const isOpenHouse = (title: string) => /open\s*house/i.test(title || '');

function whenLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d) + ' CT';
}

/** OH1o: every builder with a public case study on hire.refactored.ai (the whole shelf, for the Brain tab too). */
export async function readSpotlightPool(): Promise<SpotlightFacts[]> {
  const { parseHireTalentQuery } = await import('./hire/hireTalentQuery');
  const { getHireTalentDirectory } = await import('./hire/hireTalentDirectory');
  const parsed = parseHireTalentQuery({});
  if (!parsed.ok) return [];
  const dir = await getHireTalentDirectory(parsed.query);
  const pool = [...dir.spotlight, ...dir.talent].filter((c, i, all) =>
    c.signature && all.findIndex((x) => x.slug === c.slug) === i);
  return pool.map((c) => {
    const sig = c.signature!;
    return {
      id: `builder:${sig.slug}`,
      name: c.name,
      role: c.role,
      title: sig.title,
      industry: sig.industry,
      metric: sig.heroMetric ? `${sig.heroMetric.value} ${sig.heroMetric.label}`.trim() : null,
      url: `${HIRE_BASE_URL}/case-studies/${sig.slug}`,
    };
  });
}

/**
 * One builder for this seed. OH1o: a builder this person already met (excludeIds) is never offered
 * again, so the rotation walks the whole directory instead of the seed always landing on one profile.
 */
export function pickSpotlight(pool: readonly SpotlightFacts[], seed: string, excludeIds: readonly string[] = []): SpotlightFacts | null {
  const open = pool.filter((s) => !s.id || !excludeIds.includes(s.id));
  if (open.length === 0) return null;
  return open[seedIndex(seed, open.length)];
}

async function readSpotlight(seed: string, excludeIds: string[] = []): Promise<SpotlightFacts | null> {
  try {
    return pickSpotlight(await readSpotlightPool(), seed, excludeIds);
  } catch (err: any) {
    console.warn(`[OpenHouseBrain] spotlight unavailable: ${err?.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* OH1i (T3): the other shelves                                         */
/* ------------------------------------------------------------------ */

/** One event on the Events schedule, as the brain reads it. */
export interface UpcomingEvent {
  title: string;
  starts_at: Date;
  description: string | null;
}

/** OH1o: the item id of one event, so a person is not touted the same event twice. */
export function eventItemId(e: Pick<UpcomingEvent, 'title' | 'starts_at'>): string {
  return `event:${String(e.title).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80)}@${new Date(e.starts_at).toISOString().slice(0, 10)}`;
}

/**
 * Next live events (not the Open House), up to three, the first one touted (pure). OH1o: an event
 * this person was already touted (excludeIds) is not touted again; if every upcoming event was, the
 * shelf is empty for them.
 */
export function renderLiveEvents(events: UpcomingEvent[], now: Date = new Date(), excludeIds: readonly string[] = []): BrainPieceResult {
  const live = (events || [])
    .filter((e) => e && e.title && !isOpenHouse(e.title))
    .filter((e) => { const t = new Date(e.starts_at).getTime(); return Number.isFinite(t) && t > now.getTime(); })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const fresh = live.filter((e) => !excludeIds.includes(eventItemId(e)));
  if (fresh.length === 0) return { piece: 'live_event', block: '', allowedLinks: [] };
  const shown = [fresh[0], ...live.filter((e) => e !== fresh[0])].slice(0, 3);
  const lines = ['LIVE EVENTS ON THE EVENTS SCHEDULE (learning is self-paced; these are the live moments - tout the first one)'];
  for (const e of shown) {
    const desc = String(e.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    lines.push(`- ${e.title}, ${whenLabel(new Date(e.starts_at))}${desc ? `: ${desc}` : ''}`);
  }
  lines.push(`- They add it to their calendar from the Events schedule: ${PORTAL_EVENTS_URL}`);
  return { piece: 'live_event', block: lines.join('\n'), allowedLinks: [PORTAL_EVENTS_URL], itemId: eventItemId(fresh[0]) };
}

/** End of the current week (next Monday 00:00 in Central), as an instant. */
export function endOfWeekCentral(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const daysLeft = 7 - Math.max(0, dow);
  // Noon UTC on the Central calendar date, then forward: safely inside the same Central day.
  const base = Date.parse(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  const monday = new Date(base + daysLeft * 86_400_000);
  // Central midnight is 05:00 or 06:00 UTC; 06:00 errs on including Sunday evening events.
  return new Date(`${monday.toISOString().slice(0, 10)}T06:00:00Z`);
}

/** The Monday-based week key (YYYY-MM-DD of that Monday) of a Central calendar date. */
export function centralWeekKey(now: Date = new Date()): string {
  const end = endOfWeekCentral(now);
  return new Date(end.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * OH1o (Ali, F): "plan your week". Everything on the real schedule from now to the end of this
 * week (Open Houses included, since they are part of the week), with the Events link, and an ask to
 * suggest one plan from THEIR progress. Empty week = empty block, so the shelf is skipped (pure).
 */
export function renderWeekAhead(events: UpcomingEvent[], todayUrl: string, now: Date = new Date()): BrainPieceResult {
  const end = endOfWeekCentral(now).getTime();
  const week = (events || [])
    .filter((e) => e && e.title)
    .filter((e) => { const t = new Date(e.starts_at).getTime(); return Number.isFinite(t) && t > now.getTime() && t < end; })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 6);
  if (week.length === 0) return { piece: 'week_ahead', block: '', allowedLinks: [] };
  const lines = [
    'PLAN YOUR WEEK (the first email of their week: an outlook on what is live THIS week, from the real',
    'Events schedule, then ONE suggested plan for their week built from their own progress in WHO THEY ARE.',
    'List only these events, exactly as written; never add one)',
  ];
  for (const e of week) {
    const desc = String(e.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    lines.push(`- ${e.title}, ${whenLabel(new Date(e.starts_at))}${desc ? `: ${desc}` : ''}`);
  }
  lines.push(`- Every event, with its Join link on the day: ${PORTAL_EVENTS_URL}`);
  lines.push(`- Their own next step lives on their Today page: ${todayUrl}`);
  return { piece: 'week_ahead', block: lines.join('\n'), allowedLinks: [PORTAL_EVENTS_URL, todayUrl], itemId: `week_ahead:${centralWeekKey(now)}` };
}

/** A community post as the brain may see it: no body, no author, by construction. */
export interface PulsePost {
  category: string | null;
  ritual: string | null;
  week: number | null;
  like_count: number;
}

export const RITUAL_LABELS: Record<string, string> = {
  roll_call: 'Roll Call', show_and_tell: 'Show & Tell', skill_drop: 'Skill Drop',
  steal_this_prompt: 'Steal This Prompt', cohort_wins: 'Cohort Wins',
};

/** Posts that are neither a guided ritual nor liked by anyone are not counted: that is where the spam sits. */
export const PULSE_MIN_LIKES = 1;

function ritualLabel(key: string): string {
  return RITUAL_LABELS[key] || key.split(/[_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** OH1o: the community themes of the last 14 days, largest first (the shelf's inventory too). */
export function communityThemes(posts: PulsePost[], minLikes = PULSE_MIN_LIKES): Array<{ label: string; count: number }> {
  const kept = (posts || []).filter((p) => p && (p.ritual || Number(p.like_count) >= minLikes));
  const counts = new Map<string, number>();
  for (const p of kept) {
    const label = p.ritual ? ritualLabel(p.ritual) : `${p.category || 'General'} posts`;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}

/** The item id of one featured theme in one week. */
export function communityItemId(label: string, now: Date = new Date()): string {
  return `community:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${centralWeekKey(now)}`;
}

/**
 * Themes and counts from the cohort's last 14 days; never a quote, never a name (pure). OH1o: ONE
 * theme is featured per email, the largest this person was not already featured this week
 * (excludeIds), so two community emails to one person talk about different things.
 */
export function renderCommunityPulse(posts: PulsePost[], minLikes = PULSE_MIN_LIKES, excludeIds: readonly string[] = [], now: Date = new Date()): BrainPieceResult {
  const kept = (posts || []).filter((p) => p && (p.ritual || Number(p.like_count) >= minLikes));
  if (kept.length === 0) return { piece: 'community_pulse', block: '', allowedLinks: [] };
  const themeList = communityThemes(posts, minLikes);
  const featured = themeList.find((t) => !excludeIds.includes(communityItemId(t.label, now)));
  if (!featured) return { piece: 'community_pulse', block: '', allowedLinks: [] };
  const themes = themeList.map((t) => [t.label, t.count] as [string, number]);
  const top = [...kept].filter((p) => Number(p.like_count) > 0).sort((a, b) => b.like_count - a.like_count).slice(0, 3);
  const lines = [
    'WHAT THE COHORT IS POSTING (private community, last 14 days: speak only in themes and counts;',
    'never quote a post, never name or describe a person)',
    `- ${kept.length} post${kept.length === 1 ? '' : 's'} in the last two weeks`,
    ...themes.map(([label, n]) => `- ${label}: ${n}`),
  ];
  if (top.length) {
    lines.push('- Most liked: ' + top.map((p) =>
      `${p.ritual ? ritualLabel(p.ritual) : p.category || 'a post'}${p.week != null ? ` (week ${p.week})` : ''}`).join('; '));
  }
  lines.push(`- FEATURE THIS THEME IN THIS EMAIL (and only this one): ${featured.label} (${featured.count})`);
  return { piece: 'community_pulse', block: lines.join('\n'), allowedLinks: [], itemId: communityItemId(featured.label, now) };
}

/** One approved AI fact, with its source (pure). */
export function renderAiFact(item: BrainItem | null): BrainPieceResult {
  if (!item) return { piece: 'ai_fact', block: '', allowedLinks: [] };
  const url = isPublicSourceUrl(item.source_url) ? String(item.source_url) : null;
  const lines = [
    'ONE AI FACT (approved; state it exactly as written, and say where it comes from)',
    `- ${item.title}`,
    `- ${String(item.body).trim()}`,
    item.source_label ? `- Source: ${item.source_label}` : null,
    url ? `- Public source link: ${url}` : null,
  ].filter((l): l is string => !!l);
  return { piece: 'ai_fact', block: lines.join('\n'), allowedLinks: url ? [url] : [], itemId: item.id };
}

/** One approved, test-built build prompt, with credit to the builder who inspired it (pure). */
export function renderBuildPrompt(item: BrainItem | null): BrainPieceResult {
  if (!item) return { piece: 'build_prompt', block: '', allowedLinks: [] };
  const url = isPublicSourceUrl(item.source_url) ? String(item.source_url) : null;
  const lines = [
    'BUILD OF THE WEEK (a prompt that was test-built and approved; include the prompt EXACTLY as written,',
    'say it works pasted into Claude or ChatGPT, and credit what inspired it)',
    `- Title: ${item.title}`,
    item.source_label ? `- Inspired by: ${item.source_label}` : null,
    url ? `- Link to what inspired it: ${url}` : null,
    'THE PROMPT:',
    String(item.body).trim(),
  ].filter((l): l is string => !!l);
  return { piece: 'build_prompt', block: lines.join('\n'), allowedLinks: url ? [url] : [], itemId: item.id };
}

export interface WeeklyProgressFacts {
  /** Lessons completed in the last 7 days, newest first. */
  lessonsDone: string[];
  /** Points earned in the last 7 days. */
  points: number;
  /** What is next on their Today page (not completed). */
  nextLessons: string[];
  /** The next live event this week, any kind. */
  nextEvent: LiveEventFacts | null;
}

/** Their week: done, points, next, live this week. Empty when there is nothing true to say (pure). */
export function renderWeeklyProgress(f: WeeklyProgressFacts | null, todayUrl: string): BrainPieceResult {
  if (!f) return { piece: 'weekly_progress', block: '', allowedLinks: [] };
  const done = (f.lessonsDone || []).filter(Boolean);
  const next = (f.nextLessons || []).filter(Boolean).slice(0, 3);
  const pts = Number.isFinite(f.points) && f.points > 0 ? f.points : 0;
  if (!done.length && !next.length && !pts && !f.nextEvent) return { piece: 'weekly_progress', block: '', allowedLinks: [] };
  const lines = ['THEIR WEEK (from the platform, last 7 days; say only what is here)'];
  lines.push(done.length
    ? `- Lessons finished this week (${done.length}): ${done.slice(0, 5).map((t) => `"${t}"`).join(', ')}`
    : '- Lessons finished this week: none');
  if (pts) lines.push(`- Points earned this week: ${pts}`);
  if (next.length) lines.push(`- Up next on their Today page: ${next.map((t) => `"${t}"`).join(', ')}`);
  const allowedLinks: string[] = [];
  if (done.length || next.length) { lines.push(`- Their Today page: ${todayUrl}`); allowedLinks.push(todayUrl); }
  if (f.nextEvent) {
    lines.push(`- Live this week: ${f.nextEvent.title}, ${f.nextEvent.when} (Events schedule: ${PORTAL_EVENTS_URL})`);
    allowedLinks.push(PORTAL_EVENTS_URL);
  }
  return { piece: 'weekly_progress', block: lines.join('\n'), allowedLinks };
}

/** Who the piece is for. Only weekly_progress and the item shelves use it. */
export interface BrainPerson {
  email?: string | null;
  leadId?: number | null;
  enrollmentId?: string | null;
  /** maya_brain_items ids already sent to this person: never served again. */
  excludeItemIds?: string[];
}

/** Every live reader, injectable. Each must resolve (degrade to empty) rather than throw; gatherBrainPiece guards anyway. */
export interface BrainDeps {
  spotlight: (seed: string, excludeIds?: string[]) => Promise<SpotlightFacts | null>;
  upcomingEvents: (days: number) => Promise<UpcomingEvent[]>;
  communityPosts: (days: number) => Promise<PulsePost[]>;
  servableItems: (kind: BrainItemKind, excludeIds: string[]) => Promise<BrainItem[]>;
  weeklyFacts: (person: BrainPerson) => Promise<Omit<WeeklyProgressFacts, 'nextEvent'> | null>;
  todayUrl: () => Promise<string>;
}

async function readUpcomingEvents(days: number): Promise<UpcomingEvent[]> {
  const { getUpcomingPublicEvents } = await import('./publicEventsService');
  const events = await getUpcomingPublicEvents(days);
  return events.map((e) => ({ title: e.title, starts_at: new Date(e.starts_at), description: e.description ?? null }));
}

async function brainQuery<T extends object>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
  const { sequelize } = await import('../config/database');
  const { QueryTypes } = await import('sequelize');
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
}

/** Only the four columns a pulse may use are selected: the body and the author never leave the database. */
async function readCommunityPosts(days: number): Promise<PulsePost[]> {
  const rows = await brainQuery<{ category: string | null; ritual: string | null; week: number | null; like_count: number }>(
    `SELECT category, ritual_meta->>'ritual' AS ritual, week, like_count
       FROM community_posts
      WHERE status = 'visible' AND created_at > NOW() - make_interval(days => CAST(:days AS int))`,
    { days });
  return rows.map((r) => ({ category: r.category, ritual: r.ritual, week: r.week == null ? null : Number(r.week), like_count: Number(r.like_count) || 0 }));
}

async function readServable(kind: BrainItemKind, excludeIds: string[]): Promise<BrainItem[]> {
  const { readServableItems } = await import('./mayaBrain/mayaBrainItems');
  return readServableItems(kind, { excludeIds });
}

/** Lessons and points of the last 7 days and the Today page's next items, each section on its own. */
async function readWeeklyFacts(person: BrainPerson): Promise<Omit<WeeklyProgressFacts, 'nextEvent'> | null> {
  let en = person.enrollmentId || null;
  const email = String(person.email || '').trim().toLowerCase();
  if (!en && email) {
    const [row] = await brainQuery<{ id: string }>(
      `SELECT id FROM enrollments WHERE LOWER(email) = :e ORDER BY created_at DESC LIMIT 1`, { e: email });
    en = row?.id ?? null;
  }
  if (!en) return null;
  const out = { lessonsDone: [] as string[], points: 0, nextLessons: [] as string[] };
  try {
    const done = await brainQuery<{ title: string }>(
      `SELECT c.title FROM timeline_card_progress p JOIN timeline_cards c ON c.id = p.card_id
        WHERE p.enrollment_id = :en AND p.status = 'completed' AND p.completed_at > NOW() - INTERVAL '7 days'
        ORDER BY p.completed_at DESC`, { en });
    out.lessonsDone = done.map((d) => d.title).filter(Boolean);
  } catch (err: any) { console.warn(`[OpenHouseBrain] weekly lessons unavailable: ${err?.message}`); }
  try {
    const [p] = await brainQuery<{ pts: string }>(
      `SELECT COALESCE(SUM(points), 0)::text AS pts FROM student_points_events
        WHERE enrollment_id = :en AND created_at > NOW() - INTERVAL '7 days'`, { en });
    out.points = Number(p?.pts || 0);
  } catch (err: any) { console.warn(`[OpenHouseBrain] weekly points unavailable: ${err?.message}`); }
  try {
    const { getTodayPage } = await import('./timeline/todayFeedComposer');
    const page = await getTodayPage(en, 0, 8, { readOnly: true });
    out.nextLessons = (page?.items ?? [])
      .filter((it: any) => it?.title && String(it.status ?? '') !== 'completed')
      .map((it: any) => String(it.title))
      .slice(0, 3);
  } catch (err: any) { console.warn(`[OpenHouseBrain] today page unavailable: ${err?.message}`); }
  return out;
}

const DEFAULT_DEPS: BrainDeps = {
  spotlight: readSpotlight,
  upcomingEvents: readUpcomingEvents,
  communityPosts: readCommunityPosts,
  servableItems: readServable,
  weeklyFacts: readWeeklyFacts,
  todayUrl: async () => (await import('./openHouseCountdown')).PORTAL_TODAY_URL,
};

/** Run one reader; a throw is logged and becomes the fallback, never an invented value. */
async function safe<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (err: any) {
    console.warn(`[OpenHouseBrain] ${name} unavailable: ${err?.message}`);
    return fallback;
  }
}

/** The next live event besides the Open House, within `days`. */
async function nextLiveEvent(deps: BrainDeps, days: number, includeOpenHouse = false): Promise<LiveEventFacts | null> {
  const events = await safe('events', () => deps.upcomingEvents(days), [] as UpcomingEvent[]);
  const now = Date.now();
  const next = events
    .filter((e) => (includeOpenHouse || !isOpenHouse(e.title)) && new Date(e.starts_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  return next ? { title: next.title, when: whenLabel(new Date(next.starts_at)) } : null;
}

/**
 * The piece for one email, read live. `their_progress` adds no block of its own: the
 * person's 360 profile is already in the prompt, and the step instructions point at it;
 * it only allows the Today page link.
 *
 * `person` is needed only by weekly_progress (who) and the item shelves (what they have
 * already been sent). `deps` replaces any live reader (tests, previews).
 */
export async function gatherBrainPiece(
  piece: BrainPiece | undefined | null,
  seed: string,
  person: BrainPerson = {},
  depsIn: Partial<BrainDeps> = {},
): Promise<BrainPieceResult | null> {
  if (!piece) return null;
  const deps: BrainDeps = { ...DEFAULT_DEPS, ...depsIn };
  if (piece === 'their_progress') {
    return { piece, block: '', allowedLinks: [await deps.todayUrl()] };
  }
  const exclude = person.excludeItemIds ?? [];
  if (piece === 'builder_spotlight') {
    const [s, ev] = await Promise.all([safe('spotlight', () => deps.spotlight(seed, exclude), null), nextLiveEvent(deps, 14)]);
    // Re-checked whatever the reader returned: a builder this person already met is never offered.
    if (s?.id && exclude.includes(s.id)) return renderSpotlight(null, ev);
    return renderSpotlight(s, ev);
  }
  if (piece === 'live_event') {
    return renderLiveEvents(await safe('events', () => deps.upcomingEvents(14), [] as UpcomingEvent[]), new Date(), exclude);
  }
  if (piece === 'community_pulse') {
    return renderCommunityPulse(await safe('community', () => deps.communityPosts(14), [] as PulsePost[]), PULSE_MIN_LIKES, exclude);
  }
  if (piece === 'week_ahead') {
    const [events, todayUrl] = await Promise.all([safe('events', () => deps.upcomingEvents(8), [] as UpcomingEvent[]), deps.todayUrl()]);
    const res = renderWeekAhead(events, todayUrl);
    if (res.itemId && exclude.includes(res.itemId)) return { piece, block: '', allowedLinks: [] };
    return res;
  }
  if (piece === 'ai_fact' || piece === 'build_prompt') {
    // Re-gated here, whatever the reader returned: approved, unexpired, sourced / test-built.
    const items = (await safe(piece, () => deps.servableItems(piece, exclude), [] as BrainItem[]))
      .filter((i) => i && i.kind === piece && !exclude.includes(i.id) && isServable(i));
    if (piece === 'ai_fact') return renderAiFact(items.length ? items[seedIndex(seed, items.length)] : null);
    // Build of the week: the most viral approved prompt they have not had.
    return renderBuildPrompt(items[0] ?? null);
  }
  if (piece === 'weekly_progress') {
    const [facts, ev, todayUrl] = await Promise.all([
      safe('weekly progress', () => deps.weeklyFacts(person), null),
      nextLiveEvent(deps, 7, true),
      deps.todayUrl(),
    ]);
    if (!facts) return renderWeeklyProgress(null, todayUrl);
    return renderWeeklyProgress({ ...facts, nextEvent: ev }, todayUrl);
  }
  return { piece, block: '', allowedLinks: [] };
}

/* ------------------------------------------------------------------ */
/* OH1o (G): the inventory - everything each shelf can choose from     */
/* ------------------------------------------------------------------ */

export interface BrainInventory {
  builders: SpotlightFacts[];
  events: Array<{ id: string; title: string; when: string; openHouse: boolean }>;
  communityThemes: Array<{ id: string; label: string; count: number }>;
  aiFacts: Array<{ id: string; title: string; source: string | null; expires_at: Date | string | null }>;
  buildPrompts: Array<{ id: string; title: string; source: string | null; expires_at: Date | string | null }>;
  weekAhead: { id: string | null; block: string };
  /** Which readers failed (shown as such, never as an empty shelf). */
  unavailable: string[];
}

/**
 * Read every shelf in full, for the Brain tab: "I need a place to control the brain and see what all
 * it has to choose from" (Ali, 2026-11-18). Each reader fails on its own and is named in `unavailable`.
 */
export async function readBrainInventory(depsIn: Partial<BrainDeps> & { spotlightPool?: () => Promise<SpotlightFacts[]> } = {}): Promise<BrainInventory> {
  const deps: BrainDeps = { ...DEFAULT_DEPS, ...depsIn };
  const unavailable: string[] = [];
  const guard = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { unavailable.push(name); return fallback; }
  };
  const [builders, events, posts, facts, prompts, todayUrl] = await Promise.all([
    guard('builders', () => (depsIn.spotlightPool ?? readSpotlightPool)(), [] as SpotlightFacts[]),
    guard('events', () => deps.upcomingEvents(14), [] as UpcomingEvent[]),
    guard('community', () => deps.communityPosts(14), [] as PulsePost[]),
    guard('ai_facts', () => deps.servableItems('ai_fact', []), [] as BrainItem[]),
    guard('build_prompts', () => deps.servableItems('build_prompt', []), [] as BrainItem[]),
    guard('today_url', () => deps.todayUrl(), PORTAL_EVENTS_URL),
  ]);
  const now = new Date();
  const week = renderWeekAhead(events, todayUrl, now);
  const item = (i: BrainItem) => ({ id: i.id, title: i.title, source: i.source_label || i.source_url || null, expires_at: i.expires_at ?? null });
  return {
    builders,
    events: events
      .filter((e) => new Date(e.starts_at).getTime() > now.getTime())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .map((e) => ({ id: eventItemId(e), title: e.title, when: whenLabel(new Date(e.starts_at)), openHouse: isOpenHouse(e.title) })),
    communityThemes: communityThemes(posts).map((t) => ({ ...t, id: communityItemId(t.label, now) })),
    aiFacts: facts.filter((i) => isServable(i)).map(item),
    buildPrompts: prompts.filter((i) => isServable(i)).map(item),
    weekAhead: { id: week.itemId ?? null, block: week.block },
    unavailable,
  };
}
