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
 */
import type { SequenceStep } from '../models/FollowUpSequence';

export type BrainPiece = 'their_progress' | 'builder_spotlight' | 'day_of';

export const PORTAL_EVENTS_URL = 'https://enterprise.colaberry.ai/portal/events';
export const HIRE_BASE_URL = 'https://hire.refactored.ai';

/** What the AI is handed for one email, and the extra links that email may carry. */
export interface BrainPieceResult {
  piece: BrainPiece;
  /** Labelled prompt block. Empty when there is nothing verified to say. */
  block: string;
  /** Links this email may carry beyond the Join link (the copy screen allows exactly these). */
  allowedLinks: string[];
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
  return { piece: 'builder_spotlight', block: lines.join('\n'), allowedLinks };
}

const isOpenHouse = (title: string) => /open\s*house/i.test(title || '');

function whenLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d) + ' CT';
}

async function readSpotlight(seed: string): Promise<SpotlightFacts | null> {
  try {
    const { parseHireTalentQuery } = await import('./hire/hireTalentQuery');
    const { getHireTalentDirectory } = await import('./hire/hireTalentDirectory');
    const parsed = parseHireTalentQuery({});
    if (!parsed.ok) return null;
    const dir = await getHireTalentDirectory(parsed.query);
    const pool = [...dir.spotlight, ...dir.talent].filter((c, i, all) =>
      c.signature && all.findIndex((x) => x.slug === c.slug) === i);
    if (pool.length === 0) return null;
    const c = pool[seedIndex(seed, pool.length)];
    const sig = c.signature!;
    return {
      name: c.name,
      role: c.role,
      title: sig.title,
      industry: sig.industry,
      metric: sig.heroMetric ? `${sig.heroMetric.value} ${sig.heroMetric.label}`.trim() : null,
      url: `${HIRE_BASE_URL}/case-studies/${sig.slug}`,
    };
  } catch (err: any) {
    console.warn(`[OpenHouseBrain] spotlight unavailable: ${err?.message}`);
    return null;
  }
}

async function readNextLiveEvent(): Promise<LiveEventFacts | null> {
  try {
    const { getUpcomingPublicEvents } = await import('./publicEventsService');
    const events = await getUpcomingPublicEvents(14);
    const next = events.find((e) => !isOpenHouse(e.title) && new Date(e.starts_at).getTime() > Date.now());
    return next ? { title: next.title, when: whenLabel(new Date(next.starts_at)) } : null;
  } catch (err: any) {
    console.warn(`[OpenHouseBrain] events unavailable: ${err?.message}`);
    return null;
  }
}

/**
 * The piece for one email, read live. `their_progress` adds no block of its own: the
 * person's 360 profile is already in the prompt, and the step instructions point at it;
 * it only allows the Today page link.
 */
export async function gatherBrainPiece(piece: BrainPiece | undefined | null, seed: string): Promise<BrainPieceResult | null> {
  if (!piece) return null;
  if (piece === 'their_progress') {
    const { PORTAL_TODAY_URL } = await import('./openHouseCountdown');
    return { piece, block: '', allowedLinks: [PORTAL_TODAY_URL] };
  }
  if (piece === 'builder_spotlight') {
    const [s, ev] = await Promise.all([readSpotlight(seed), readNextLiveEvent()]);
    return renderSpotlight(s, ev);
  }
  return { piece, block: '', allowedLinks: [] };
}
