import type { BrainPerson, BrainPiece, BrainPieceResult } from '../openHouseBrain';
import { BRAIN_PICK_MIN_HOURS, hoursBetweenDecisionDates } from './governor/contactPolicy';

/**
 * OH1j: Explorer Growth uses the same brain as the Open House emails.
 *
 * Ali, 2026-11-18: "I want EG OS to use the same brain." So an Explorer draft is written as
 * Maya, around ONE piece from the same shelves the countdown reads (openHouseBrain.ts), at
 * most once every three days per person (BRAIN_PICK_MIN_HOURS, counted on shadow picks too).
 * The Open House still takes precedence: the Governor's open_house_countdown hard stop holds
 * a learner while their countdown is live, and the draft render checks it again.
 *
 * Which piece:
 *
 *   RECOMMEND_LESSON / RECOVER_FRICTION  their_progress (what they did, the one next step)
 *   an event decision                    live_event (the Events schedule)
 *   every other email (nurture)          rotate builder_spotlight, build_prompt, ai_fact,
 *                                        community_pulse
 *
 * Never the same kind twice in a row for one person, never a brain item (ai_fact,
 * build_prompt) the person was already given, and a shelf with nothing verified on it is
 * passed over for the next one in the rotation. If every shelf is empty the email is still
 * written, from the step's brief and the person's profile, with no piece and no extra links:
 * an empty shelf never becomes an invented fact.
 *
 * Pure apart from the injected `gather`, so the whole choice is testable without a database.
 */

/**
 * The nurture rotation, in order (the code default; Ali edits it in the Brain tab, brainRules.ts).
 * OH1o: live_event joined the rotation, because four shelves with two of them empty put 4 of 5
 * people on community_pulse in the Nov 18 sample.
 */
export const NURTURE_ROTATION: readonly BrainPiece[] = [
  'builder_spotlight', 'build_prompt', 'ai_fact', 'community_pulse', 'live_event',
];

/** OH1o: how many of the person's most recent emails a shelf may not repeat (Ali: "never the same shelf in the last 2"). */
export const SHELF_MEMORY = 2;

/** Options the brain rules (brainRules.ts) feed into the choice. Absent = the code defaults. */
export interface BrainPickOptions {
  rotation?: readonly BrainPiece[];
  minHours?: number;
  /** The Monday "plan your week" email (week_ahead shelf). Default on. */
  weekAhead?: boolean;
}

/** One earlier pick for this person, newest first, as the draft history records it. */
export interface BrainPickRecord {
  piece: BrainPiece;
  item_id: string | null;
  /** The decision date (YYYY-MM-DD) the pick was drafted for. */
  decision_date: string;
}

/** The decision fields the choice reads. */
export interface BrainPickDecision {
  enrollment_id: string;
  decision_date: string;
  selected_action: string | null;
  reason: string;
}

/** What the draft is written around, and what is recorded on the row as `metadata.brain_pick`. */
export interface BrainPick {
  piece: BrainPiece;
  block: string;
  allowedLinks: string[];
  itemId: string | null;
  /** True when no shelf had anything verified: the email is written without a piece. */
  empty: boolean;
}

export type BrainGather = (
  piece: BrainPiece,
  seed: string,
  person: BrainPerson,
) => Promise<BrainPieceResult | null>;

/** Pieces whose block is empty by design: the person's own profile is the content. */
const PROFILE_PIECES: readonly BrainPiece[] = ['their_progress'];

/** An event decision: an event action, or a campaign about an event. */
export function isEventDecision(d: Pick<BrainPickDecision, 'selected_action' | 'reason'>): boolean {
  if (d.selected_action === 'INVITE_TO_EVENT') return true;
  const campaign = /campaign=([^|\s]+)/.exec(d.reason || '')?.[1] ?? '';
  return /event|open_?house/i.test(campaign);
}

/** The piece the decision itself calls for, before rotation. Null = a nurture email (rotate). */
export function mappedPiece(d: Pick<BrainPickDecision, 'selected_action' | 'reason'>): BrainPiece | null {
  if (isEventDecision(d)) return 'live_event';
  if (d.selected_action === 'RECOMMEND_LESSON' || d.selected_action === 'RECOVER_FRICTION') return 'their_progress';
  return null;
}

/**
 * Has this person had a brain pick within BRAIN_PICK_MIN_HOURS of this decision? History is
 * the person's picks on OTHER decisions (shadow included). Unreadable dates count as recent.
 */
export function brainPickHeld(
  decisionDate: string,
  history: readonly BrainPickRecord[],
  minHours: number = BRAIN_PICK_MIN_HOURS,
): { held: boolean; hours: number | null } {
  let nearest: number | null = null;
  for (const h of history) {
    const hours = hoursBetweenDecisionDates(decisionDate, h.decision_date);
    const v = Number.isFinite(hours) ? hours : 0;
    if (nearest === null || v < nearest) nearest = v;
  }
  // The floor is 24 hours whatever a caller passes (Ali: "we can't contact the same person within 24 hours").
  const floor = Math.max(24, Number.isFinite(minHours) ? minHours : BRAIN_PICK_MIN_HOURS);
  return { held: nearest !== null && nearest < floor, hours: nearest };
}

/** Monday-based ISO-ish week key for a YYYY-MM-DD date (UTC calendar date). Null when unreadable. */
export function weekKey(date: string): string | null {
  const t = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(t - dow * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/**
 * OH1o (Ali, F): the first Explorer email of the week is a "plan your week" email. A decision dated
 * Monday or Tuesday, when the person has had no week_ahead pick in that same week, leads with it.
 */
export function isWeekAheadTouch(decisionDate: string, history: readonly BrainPickRecord[]): boolean {
  const t = Date.parse(`${String(decisionDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  const dow = new Date(t).getUTCDay(); // 1 = Monday, 2 = Tuesday
  if (dow !== 1 && dow !== 2) return false;
  const wk = weekKey(decisionDate);
  return !history.some((h) => h.piece === 'week_ahead' && weekKey(h.decision_date) === wk);
}

/**
 * The order to try pieces in: the week-ahead email first on its touch, then the mapped piece (if
 * any), then the rotation starting after the person's most recent nurture kind. OH1o: a shelf used
 * in either of the person's last two emails is never offered (SHELF_MEMORY).
 */
export function pieceOrder(
  decision: Pick<BrainPickDecision, 'enrollment_id' | 'selected_action' | 'reason'> & { decision_date?: string },
  history: readonly BrainPickRecord[],
  options: BrainPickOptions = {},
): BrainPiece[] {
  const base = (options.rotation && options.rotation.length ? options.rotation : NURTURE_ROTATION)
    .filter((p, i, all) => all.indexOf(p) === i);
  const recent = history.slice(0, SHELF_MEMORY).map((h) => h.piece);
  const lastNurture = history.find((h) => base.includes(h.piece))?.piece ?? null;
  const n = base.length;
  const start = lastNurture
    ? (base.indexOf(lastNurture) + 1) % n
    : stableIndex(decision.enrollment_id, n);
  const rotation = Array.from({ length: n }, (_, i) => base[(start + i) % n]);
  const mapped = mappedPiece(decision);
  const order = mapped ? [mapped, ...rotation] : rotation;
  const kept = order.filter((p, i) => !recent.includes(p) && order.indexOf(p) === i);
  const weekAheadOn = options.weekAhead !== false;
  if (weekAheadOn && decision.decision_date && isWeekAheadTouch(decision.decision_date, history)) {
    return ['week_ahead', ...kept.filter((p) => p !== 'week_ahead')];
  }
  return kept;
}

/** Small stable hash, so a first-time person starts the rotation at a spread-out point. */
function stableIndex(seed: string, size: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % size;
}

/**
 * Choose and read the piece for one decision. Each shelf is tried in `pieceOrder` until one
 * has something verified; a gather that throws counts as an empty shelf.
 */
export async function chooseBrainPick(
  decision: BrainPickDecision,
  history: readonly BrainPickRecord[],
  gather: BrainGather,
  person: Omit<BrainPerson, 'excludeItemIds'> = {},
  options: BrainPickOptions = {},
): Promise<BrainPick> {
  const order = pieceOrder(decision, history, options);
  const excludeItemIds = Array.from(new Set(history.map((h) => h.item_id).filter((x): x is string => !!x)));
  // The decision date in the seed, so a person meets a different builder each time.
  const seed = `${decision.enrollment_id}:${decision.decision_date}`;
  for (const piece of order) {
    let res: BrainPieceResult | null = null;
    try {
      res = await gather(piece, seed, { ...person, enrollmentId: person.enrollmentId ?? decision.enrollment_id, excludeItemIds });
    } catch (err: any) {
      console.warn(`[ExplorerBrainPick] ${piece} unavailable: ${err?.message}`);
      res = null;
    }
    if (!res) continue;
    // Re-checked here whatever the shelf returned: an item they already had is never used.
    if (res.itemId && excludeItemIds.includes(res.itemId)) continue;
    const hasContent = res.block.trim() !== '' || (PROFILE_PIECES.includes(piece) && res.allowedLinks.length > 0);
    if (!hasContent) continue;
    return { piece, block: res.block, allowedLinks: [...res.allowedLinks], itemId: res.itemId ?? null, empty: false };
  }
  return { piece: order[0] ?? NURTURE_ROTATION[0], block: '', allowedLinks: [], itemId: null, empty: true };
}

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_ISSUE = /^Explorer copy states a date not present in the resolved context: "([^"]+)"/;

/**
 * OH1o: the Explorer fact guard refuses a date that is not in the resolved facts. A date the brain
 * piece itself supplied (the live event's "Thursday, November 20") IS a resolved fact: it came from
 * the Events schedule. Those issues are dropped ONLY when that exact date text is in the piece block;
 * any other date still rejects the draft. (Nov 18 sample: a builder email was rejected for this.)
 */
export function allowBrainDates(issues: readonly string[], block: string): string[] {
  const text = String(block || '');
  if (!text.trim()) return [...issues];
  const dates = new Set((text.match(new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}\\b`, 'g')) || []).map((d) => d.toLowerCase()));
  return issues.filter((issue) => {
    const m = DATE_ISSUE.exec(issue);
    if (!m) return true;
    return !dates.has(m[1].trim().toLowerCase());
  });
}

/** The prompt block for the chosen piece. Empty string when there is no piece. */
export function renderBrainPickBlock(pick: BrainPick): string {
  if (pick.empty) return '';
  const lines = [`THIS EMAIL'S CONTENT PIECE (${pick.piece}; build the email around it and say only what it says)`];
  if (pick.piece === 'their_progress') {
    lines.push('THEIR PROGRESS: center the email on what they have actually done on the platform (their profile, and any');
    lines.push('lesson content listed above) and the one next step. Do not list their activity back to them.');
  }
  if (pick.block.trim()) lines.push(pick.block.trim());
  if (pick.allowedLinks.length) {
    lines.push(`LINKS THIS PIECE ALLOWS (exactly as written, at most these): ${pick.allowedLinks.join(' , ')}`);
  }
  return lines.join('\n');
}

const UNKNOWN_URL = 'Unknown URL found: ';

/**
 * The general validator only knows the two Colaberry hosts, so a builder's public case study
 * or a fact's public source reads as an unknown URL. Those issues are dropped ONLY for the
 * exact links this email's piece allows; any other unknown link still rejects the draft.
 * (The validator truncates the URL to 80 characters in its message, hence the prefix match
 * on a truncated issue.)
 */
export function allowBrainLinks(issues: readonly string[], allowedLinks: readonly string[]): string[] {
  if (!allowedLinks.length) return [...issues];
  return issues.filter((issue) => {
    if (!issue.startsWith(UNKNOWN_URL)) return true;
    const url = issue.slice(UNKNOWN_URL.length);
    const allowed = allowedLinks.some((a) => a === url || (url.length >= 80 && a.startsWith(url)));
    return !allowed;
  });
}

/**
 * Maya, for Explorer Growth. Not the Open House countdown persona (that one is a host
 * helping someone get to an event); this is Maya checking in with someone exploring the
 * platform on their own, every few days, with one useful thing.
 */
export const EXPLORER_MAYA_VOICE = `You are Maya, Director of Admissions at Colaberry. You are writing one short email to one person who is exploring the Colaberry learning platform on their own: they created an account and are trying the lessons, the campus and the community at their own pace.

THE SITUATION
This is not outreach and it is not a sales email. You write to each person at most once every three days, and each email carries ONE piece of live content, handed to you in a section called THIS EMAIL'S CONTENT PIECE: their own progress, a real builder and what they built, a build prompt to try, one sourced AI fact, what the cohort is posting about, or the next live event. Build the email around that one piece. Use only what it says; never add details to it. If there is no content piece, write a short, warm note from their profile and the step's brief alone.

YOUR OBJECTIVES
1. Make them feel noticed by a real person.
2. Give them one useful thing (the content piece) and one small, easy next step on the platform.
3. Keep it short: 80 to 160 words, short paragraphs.

TONE AND VOICE
Warm, personal, plain American English. Peer to peer, never corporate. No hype, no emojis, no exclamation-mark pile-ups, no "I hope this email finds you well". Use their first name. Sign off simply as Maya.`;

/**
 * OH1o: the part of Maya's Explorer prompt nobody can edit from the Brain tab. The voice above is
 * data (brainRules.explorerVoice); these rules are always appended after it, so an edited voice can
 * change how Maya sounds but never what she is allowed to say.
 */
export const EXPLORER_MAYA_HARD_RULES = `HARD RULES (these never bend, and they override any general rule that follows)
- Never sell. Never mention price, cost, tuition, payment, a discount, an offer, a deal, an early bird, a scholarship, seats, enrollment deadlines, or anything being at no charge. Never use the word spelled f-r-e-e in any form, not even in "feel f-r-e-e to" (say "you're welcome to" or "just reply" instead).
- Never ask them to book a call, never include a booking or strategy-call link, and never mention a cohort start date.
- Links: only the enterprise.colaberry.ai links given in the message instructions, and the links listed in THIS EMAIL'S CONTENT PIECE, exactly as written. No other links of any kind.
- Never invent anything about the person, the program, outcomes, salaries or jobs. Never quote a community post or name a community member.
- What you know about the person comes ONLY from the section WHO THEY ARE. Never assume a background, role, industry or skill that is not written there.
- Never re-say an earlier email: if EARLIER EMAILS lists what you already wrote them, open differently, use a different subject and say something new.
- Never claim a prior conversation that did not happen.`;

/** The full Explorer prompt for a given voice (default: the code voice). */
export function explorerMayaPrompt(voice: string = EXPLORER_MAYA_VOICE): string {
  return `${voice.trim()}\n\n${EXPLORER_MAYA_HARD_RULES}`;
}

export const EXPLORER_MAYA_PROMPT = explorerMayaPrompt();
