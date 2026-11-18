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

/** The nurture rotation, in order. */
export const NURTURE_ROTATION: readonly BrainPiece[] = [
  'builder_spotlight', 'build_prompt', 'ai_fact', 'community_pulse',
];

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
): { held: boolean; hours: number | null } {
  let nearest: number | null = null;
  for (const h of history) {
    const hours = hoursBetweenDecisionDates(decisionDate, h.decision_date);
    const v = Number.isFinite(hours) ? hours : 0;
    if (nearest === null || v < nearest) nearest = v;
  }
  return { held: nearest !== null && nearest < BRAIN_PICK_MIN_HOURS, hours: nearest };
}

/**
 * The order to try pieces in: the mapped piece first (if any), then the rotation starting
 * after the person's most recent nurture kind. The kind they got last time is never offered.
 */
export function pieceOrder(
  decision: Pick<BrainPickDecision, 'enrollment_id' | 'selected_action' | 'reason'>,
  history: readonly BrainPickRecord[],
): BrainPiece[] {
  const lastKind = history[0]?.piece ?? null;
  const lastNurture = history.find((h) => NURTURE_ROTATION.includes(h.piece))?.piece ?? null;
  const n = NURTURE_ROTATION.length;
  const start = lastNurture
    ? (NURTURE_ROTATION.indexOf(lastNurture) + 1) % n
    : stableIndex(decision.enrollment_id, n);
  const rotation = Array.from({ length: n }, (_, i) => NURTURE_ROTATION[(start + i) % n]);
  const mapped = mappedPiece(decision);
  const order = mapped ? [mapped, ...rotation] : rotation;
  return order.filter((p, i) => p !== lastKind && order.indexOf(p) === i);
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
): Promise<BrainPick> {
  const order = pieceOrder(decision, history);
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
export const EXPLORER_MAYA_PROMPT = `You are Maya, Director of Admissions at Colaberry. You are writing one short email to one person who is exploring the Colaberry learning platform on their own: they created an account and are trying the lessons, the campus and the community at their own pace.

THE SITUATION
This is not outreach and it is not a sales email. You write to each person at most once every three days, and each email carries ONE piece of live content, handed to you in a section called THIS EMAIL'S CONTENT PIECE: their own progress, a real builder and what they built, a build prompt to try, one sourced AI fact, what the cohort is posting about, or the next live event. Build the email around that one piece. Use only what it says; never add details to it. If there is no content piece, write a short, warm note from their profile and the step's brief alone.

YOUR OBJECTIVES
1. Make them feel noticed by a real person.
2. Give them one useful thing (the content piece) and one small, easy next step on the platform.
3. Keep it short: 80 to 160 words, short paragraphs.

TONE AND VOICE
Warm, personal, plain American English. Peer to peer, never corporate. No hype, no emojis, no exclamation-mark pile-ups, no "I hope this email finds you well". Use their first name. Sign off simply as Maya.

HARD RULES (these never bend, and they override any general rule that follows)
- Never sell. Never mention price, cost, tuition, payment, a discount, an offer, a deal, an early bird, a scholarship, seats, enrollment deadlines, or anything being at no charge. Never use the word spelled f-r-e-e in any form, not even in "feel f-r-e-e to" (say "you're welcome to" or "just reply" instead).
- Never ask them to book a call, never include a booking or strategy-call link, and never mention a cohort start date.
- Links: only the enterprise.colaberry.ai links given in the message instructions, and the links listed in THIS EMAIL'S CONTENT PIECE, exactly as written. No other links of any kind.
- Never invent anything about the person, the program, outcomes, salaries or jobs. Never quote a community post or name a community member.
- Never claim a prior conversation that did not happen.`;
