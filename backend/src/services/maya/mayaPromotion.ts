import { env } from '../../config/env';
import { classifyError } from '../../utils/errorClassifier';
import { getSetting, setSetting } from '../settingsService';
import { isKillSwitchActiveStrict } from '../launchSafety';
import {
  resolveMayaCapability, type MayaCapability, type MayaEnablement,
} from '../mayaEnablement';
import {
  ALL_MAYA_CAPABILITIES, isM29Capability, type MayaToolCapability,
} from './mayaToolGovernance';

/**
 * M37 - the gate that takes a Maya capability from SHADOW to LIVE, one capability at a time.
 *
 * Checklist (what must be true before a promotion, and how to undo one): docs/maya/MAYA_PROMOTION_CHECKLIST.md.
 *
 * -- TWO AXES, NOT A SECOND FLAG REGISTRY --
 * M29 (mayaEnablement.ts) answers "is this capability ALLOWED to act": kill switch + the existing env flags, no
 * stored state, and it forbids a second flag registry. This module answers a different question, "has a person
 * reviewed this capability and PROMOTED it". That is a decision record, not an enablement flag: one system_settings
 * row (`maya_capability_promotions`) holding, per capability, the state, who promoted it, when, and their note, plus
 * an append-only history. The kill switch is still the single off switch for both axes.
 *
 * -- HOW A MODE IS DECIDED (resolveMayaMode) --
 *   1. Kill switch, read STRICTLY first. On -> off. Unreadable -> off (fails closed, as M29 does).
 *   2. respondToExplorerDm also needs ENABLE_CHAT (the switch that has always governed her portal replies, C121).
 *   3. The promotion record. Unreadable -> off (fails closed). Absent -> DEFAULT_STATES.
 *   4. A promoted PROACTIVE capability is live only if M29 also allows it; otherwise it stays shadow with the M29
 *      reason. NOTHING SENDS: GROWTH_JOURNEY_EXECUTION_ENABLED is Ali's, and this module never sets it.
 *
 * -- THE ONE DEFAULT THAT IS LIVE (Ali, 2026-11-09, "Q2: A") --
 * Maya's DM reply has been live since C121 under ENABLE_CHAT alone. Starting it in shadow would silence her on deploy,
 * so its default is live and it does NOT consult M29 (whose flags are all unset in production). Every other capability
 * defaults to shadow and needs a stored promotion with a reviewer and a note. No deploy can promote anything.
 */

/**
 * -- THE FOURTH MODE, AND WHY IT IS A MODE RATHER THAN A FLAG (2026-11-13) --
 *
 * Ali's instruction was "turn all on", with every message she composes for a real person held
 * for his approval. Those two halves pull in opposite directions under a three-mode dial:
 * `shadow` composes and throws the result away, which is not "on", and `live` delivers without
 * him, which is not "held". `review` is the state that satisfies both. It splits COMPOSE from
 * DELIVER:
 *
 *   off     the handler is never invoked. She refuses by name and says why.
 *   shadow  the handler composes and the result is recorded. Nothing is delivered or queued.
 *   review  the handler composes, the rendered message is queued, and it is delivered only when
 *           a named human decides that exact message.
 *   live    composes and delivers, still consent-checked and still idempotent.
 *
 * A gate that blocked the HANDLER for `review` would produce a queue row with no subject and no
 * body, so the gate belongs on the delivery seam, not on the tool. See `maya/deliverOrQueue.ts`.
 */
export type MayaMode = 'off' | 'shadow' | 'review' | 'live';

/** The states a person may set on the console. `off` is deliberately not one of them: see below. */
export type PromotionState = 'shadow' | 'review' | 'live';

export type MayaModeReason =
  | 'kill_switch'
  | 'kill_switch_unreadable'
  | 'chat_off'
  | 'capability_refused'
  | 'promotion_unreadable'
  | 'not_promoted'
  | 'promoted'
  | 'default_review'
  | 'default_live'
  | `m29:${MayaEnablement['reason']}`;

export interface MayaModeAnswer {
  capability: MayaToolCapability;
  mode: MayaMode;
  reason: MayaModeReason;
}

export interface PromotionEntry {
  state: PromotionState;
  by: string;
  at: string;
  note: string;
}

export interface PromotionHistoryEntry extends PromotionEntry {
  capability: MayaToolCapability;
  /** `set` is the three-way setter. `promote` and `revert` are kept so old history still reads. */
  action: 'promote' | 'revert' | 'set';
}

export interface PromotionRecord {
  capabilities: Partial<Record<MayaToolCapability, PromotionEntry>>;
  history: PromotionHistoryEntry[];
}

export const PROMOTION_SETTING_KEY = 'maya_capability_promotions';
const HISTORY_LIMIT = 200;

/**
 * REFUSED BY NAME. Not a default, not a dial, not promotable: these resolve `off` and there is
 * no state a person can set that changes it, because `setCapabilityState` refuses them too.
 *
 * The difference between "defaults to off" and "refused" is the difference between a switch in
 * the off position and no switch at all, and each of these three earned the second:
 *
 *   sendSmsSummary   Ali, 2026-11-13: SMS stays refused by name. This covers EVERY caller,
 *                    including the GoHighLevel workflow that `scheduleStrategyCall` fires as a
 *                    side effect, which is how SMS was reaching people without a tool call.
 *   placeVoiceCall   same instruction, same reason. `ENABLE_VOICE_CALLS` stays false.
 *   enrollInCampaign a queue row is only an approval of a message if the row IS the message.
 *                    Enrolment is not: it writes a `CampaignLead`, which two crons turn into
 *                    `scheduled_emails`, whose bodies `generateAIContent()` composes AT SEND
 *                    TIME. One click would authorise an unbounded number of messages Ali never
 *                    read. Re-opening it needs a per-message design, not a dial.
 *
 * A capability here cannot be promoted into existence by an admin in a hurry. That is the point.
 */
export const REFUSED_CAPABILITIES = Object.freeze([
  'sendSmsSummary',
  'placeVoiceCall',
  'enrollInCampaign',
] as const);

export type RefusedCapability = (typeof REFUSED_CAPABILITIES)[number];

const REFUSED: ReadonlySet<string> = new Set(REFUSED_CAPABILITIES);

/** True when no state a person can set will let this capability act. */
export function isRefusedCapability(cap: MayaToolCapability): cap is RefusedCapability {
  return REFUSED.has(cap);
}

/** Everything else: the capabilities that have a dial on the console. */
export type PromotableCapability = Exclude<MayaToolCapability, RefusedCapability>;

/**
 * The shipped position of every dial.
 *
 * Typed over `PromotableCapability` on purpose: a refused capability cannot be given a default
 * here, because the type will not let it. That is stronger than a comment asking nobody to.
 *
 * Reading the column: `live` is for capabilities that reach NOBODY outside the product, plus
 * the one declared transactional-receipt exception. `review` is for anything that puts bytes in
 * a stranger's inbox. Nothing that reaches a person defaults to `live` except that exception.
 */
export const DEFAULT_STATES: Readonly<Record<PromotableCapability, PromotionState>> = Object.freeze({
  // --- the M29 portal capabilities, unchanged from MR2 ---------------------------------------
  // Q2: the DM reply keeps its live behavior; she had been answering portal DMs since C121 and
  // starting it in shadow would have silenced her on deploy.
  respondToExplorerDm: 'live',
  sendInAppWelcome: 'shadow',
  createJourneyHandoff: 'shadow',
  readPerson360: 'shadow',
  // MR2 shipped this as `shadow` because nothing had ever sent an email as Maya, so there was no
  // existing behavior for a shadow default to interrupt. It stays `shadow` through this task and
  // moves to `review` in T8, at the same moment `mayaEmailService` learns what `review` means.
  // Flipping it first would label the capability as queued while the service still discarded.
  sendEmail: 'shadow',

  // --- the site chat capabilities, new in this run --------------------------------------------
  // Reach nobody. They write our own records, read our own data, or change what the person
  // already in the conversation sees. `live` is their honest state and always has been; this run
  // gives them a dial, it does not withdraw them.
  captureVisitorRecord: 'live',
  readSiteChatCatalog: 'live',
  composeMarketingDraft: 'live',
  requestHumanCallback: 'live',
  runCampusTour: 'live',
  offerBookingLink: 'live',

  // THE ONE DECLARED EXCEPTION. Booking writes a real calendar event and sends a confirmation
  // without Ali reading either, and the invariant is worded absolutely, so the exception is
  // named and bounded rather than left implicit:
  //
  //   TRANSACTIONAL RECEIPT POLICY. An effect may be `live` without per-message approval only
  //   if it is a receipt of an action the person themselves just performed, addressed to that
  //   person, and its body is a fixed, reviewed template limited to the facts of that
  //   transaction - what, when, with whom, how to join or cancel - composed before send time,
  //   one per transaction. Outreach never qualifies.
  //
  // Only `createBooking` and `sendStrategyCallConfirmation` claim it, and a test pins that list
  // so a future effect cannot inherit the exemption silently. Booking's other two side effects,
  // the GoHighLevel SMS and the campaign enrolment, are refused above.
  bookStrategyCall: 'live',

  // Puts real HTML in a stranger's inbox. Held.
  sendDocument: 'review',
});

/**
 * Capabilities that act without being asked. `live` additionally needs M29's flag.
 *
 * Deliberately still typed over the five M29 capabilities only. The site-chat capabilities are
 * REACTIVE - a visitor asked - so there is no "without being asked" case to gate, and giving
 * them a growth-journey flag would invent a mapping rather than record a decision.
 */
const NEEDS_M29_FOR_LIVE: ReadonlySet<MayaCapability> = new Set(['sendInAppWelcome', 'createJourneyHandoff', 'readPerson360', 'sendEmail']);

export interface MayaPromotionDeps {
  killSwitchActive: () => Promise<boolean>;
  chatEnabled: () => boolean;
  readRecord: () => Promise<unknown>;
  writeRecord: (value: PromotionRecord, adminId: string) => Promise<void>;
  m29: (cap: MayaCapability) => Promise<MayaEnablement>;
  now: () => Date;
}

function defaultDeps(): MayaPromotionDeps {
  return {
    killSwitchActive: isKillSwitchActiveStrict,
    chatEnabled: () => env.enableChat === true,
    readRecord: () => getSetting(PROMOTION_SETTING_KEY),
    writeRecord: (value, adminId) => setSetting(PROMOTION_SETTING_KEY, value, adminId),
    m29: (cap) => resolveMayaCapability(cap),
    now: () => new Date(),
  };
}

export function isMayaCapability(value: unknown): value is MayaToolCapability {
  return typeof value === 'string' && (ALL_MAYA_CAPABILITIES as readonly string[]).includes(value);
}

/** A stored value that is not the expected shape is treated as "no record", never trusted field by field. */
export function parseRecord(raw: unknown): PromotionRecord {
  const empty: PromotionRecord = { capabilities: {}, history: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;
  const caps = (obj.capabilities && typeof obj.capabilities === 'object') ? obj.capabilities as Record<string, unknown> : {};
  const out: PromotionRecord = { capabilities: {}, history: Array.isArray(obj.history) ? obj.history as PromotionHistoryEntry[] : [] };
  for (const [k, v] of Object.entries(caps)) {
    const e = v as Partial<PromotionEntry> | null;
    // A stored state that is not one of the three is dropped, not coerced. A refused capability
    // with a stored entry is dropped too: if one were ever written by hand into
    // `system_settings`, reading it back must not be the way it takes effect.
    const known = e?.state === 'live' || e?.state === 'shadow' || e?.state === 'review';
    if (isMayaCapability(k) && !isRefusedCapability(k) && e && known) {
      out.capabilities[k] = { state: e.state!, by: String(e.by ?? ''), at: String(e.at ?? ''), note: String(e.note ?? '') };
    }
  }
  return out;
}

/** A failed read is an ANSWER (off), but it is still logged with its class: fail closed, never silently. */
function logReadFailure(event: string, cap: MayaToolCapability, err: unknown): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'maya', event, outcome: 'failure',
    error_class: classifyError(err), context: { capability: cap, message: err instanceof Error ? err.message : String(err) },
  }));
}

export async function resolveMayaMode(cap: MayaToolCapability, deps: MayaPromotionDeps = defaultDeps()): Promise<MayaModeAnswer> {
  const answer = (mode: MayaMode, reason: MayaModeReason): MayaModeAnswer => ({ capability: cap, mode, reason });
  try {
    if (await deps.killSwitchActive()) return answer('off', 'kill_switch');
  } catch (err: unknown) {
    logReadFailure('maya_kill_switch_unreadable', cap, err);
    return answer('off', 'kill_switch_unreadable');
  }
  // SECOND, before the record is even read. A refused capability is off whatever anybody has
  // stored, so a hand-written `system_settings` row cannot turn SMS back on.
  if (isRefusedCapability(cap)) return answer('off', 'capability_refused');
  if (cap === 'respondToExplorerDm' && !deps.chatEnabled()) return answer('off', 'chat_off');

  let record: PromotionRecord;
  try {
    record = parseRecord(await deps.readRecord());
  } catch (err: unknown) {
    logReadFailure('maya_promotion_unreadable', cap, err);
    return answer('off', 'promotion_unreadable');
  }
  const stored = record.capabilities[cap];
  const state: PromotionState = stored?.state ?? DEFAULT_STATES[cap];
  // `not_promoted` is kept as the reason for BOTH an absent record and a stored shadow, so a
  // reader asking "why is this silent" gets the same answer however it got there.
  if (state === 'shadow') return answer('shadow', 'not_promoted');
  if (state === 'review') return answer('review', stored ? 'promoted' : 'default_review');

  // M29 gates the LIVE path only, and that boundary is deliberate. `review` delivers nothing by
  // itself: it queues, and a named human decides each message. A human decision is a stronger
  // gate than a flag, not a way around one, so the flag governs the path that has no human on
  // it. Recorded as a posture change in docs/maya/MAYA_GOVERNANCE.md rather than left implicit.
  if (isM29Capability(cap) && NEEDS_M29_FOR_LIVE.has(cap)) {
    const gate = await deps.m29(cap);
    if (!gate.enabled) return answer('shadow', `m29:${gate.reason}`);
  }
  return answer('live', stored ? 'promoted' : 'default_live');
}

export async function resolveAllMayaModes(deps: MayaPromotionDeps = defaultDeps()): Promise<MayaModeAnswer[]> {
  const out: MayaModeAnswer[] = [];
  for (const cap of ALL_MAYA_CAPABILITIES) out.push(await resolveMayaMode(cap, deps));
  return out;
}

export async function readPromotionRecord(deps: MayaPromotionDeps = defaultDeps()): Promise<PromotionRecord> {
  return parseRecord(await deps.readRecord());
}

export class PromotionReviewError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

export interface PromotionChange {
  reviewerId: string;
  reviewNote: string;
  /**
   * The state the caller BELIEVED this capability was in when it decided who was allowed to
   * make this change. Optional, and supplied by the route.
   *
   * WHY IT EXISTS. The authority for a state change depends on its DIRECTION (see `isRaise`),
   * so the route has to read the current state before it can decide whether the caller is
   * allowed to make the change at all. That read and this write are two statements, and an
   * independent review found the gap between them: a non-Ali admin lawfully lowering
   * `live -> review` whose request interleaves with Ali reverting to `shadow` would land as a
   * `shadow -> review` RAISE, made by somebody who is not allowed to raise. The end state is
   * mild, but the authority check was answered about a world that no longer existed.
   *
   * Supplying it turns the write into a compare-and-set: if the stored state moved after the
   * route decided who could act, the change is refused and the caller re-reads. This is the
   * same shape as the conditional claim in the outbound queue, for the same reason.
   */
  expectedFrom?: PromotionState;
}
export interface PromotionResult { capability: MayaToolCapability; state: PromotionState; changed: boolean }

/** How far toward `live` a state sits. Used to tell a RAISE from a LOWER, which is an auth question. */
const STATE_RANK: Readonly<Record<PromotionState, number>> = Object.freeze({ shadow: 0, review: 1, live: 2 });

/**
 * Is moving `from` to `to` a widening of what Maya may do without a person?
 *
 * The routes split on this: raising needs `requireCoryAuthorized` (Ali, by identity), lowering
 * needs only `requireAdmin`, so anyone on the admin team can pull a capability back during an
 * incident while only Ali can widen one. Exported so the route and the test read the same rule
 * rather than two restatements of it.
 */
export function isRaise(from: PromotionState, to: PromotionState): boolean {
  return STATE_RANK[to] > STATE_RANK[from];
}

/**
 * Record a reviewed state change. A reviewer id and a non-empty note are mandatory: this is the
 * "no promotion without human review" guarantee, and it holds for revert too so the history always
 * says who silenced a capability and why. Setting the state it already has is a no-op (idempotent).
 */
async function changeState(
  cap: MayaToolCapability, target: PromotionState, action: 'promote' | 'revert' | 'set', change: PromotionChange, deps: MayaPromotionDeps,
): Promise<PromotionResult> {
  const reviewerId = (change.reviewerId ?? '').trim();
  const note = (change.reviewNote ?? '').trim();
  if (!reviewerId) throw new PromotionReviewError('A reviewer is required');
  if (note.length < 3) throw new PromotionReviewError('A review note is required');
  // A refused capability has no dial. Refusing here as well as in the resolver means the record
  // never even acquires an entry that a later reader would have to know to ignore.
  if (isRefusedCapability(cap)) {
    throw new PromotionReviewError(`${cap} is refused by name and cannot be set to any state`);
  }

  const record = parseRecord(await deps.readRecord());
  const current = record.capabilities[cap]?.state ?? DEFAULT_STATES[cap as PromotableCapability];
  // COMPARE-AND-SET. Refuse rather than write a change whose authority was decided against a
  // state that has since moved. See the note on `PromotionChange.expectedFrom`.
  if (change.expectedFrom !== undefined && current !== change.expectedFrom) {
    throw new PromotionReviewError(
      `${cap} moved from ${change.expectedFrom} to ${current} while this change was being `
      + 'authorised. Nothing was changed. Reload and decide again.',
    );
  }
  // Already in the target state, stored or by default: a no-op. Nothing is written and no history entry is added.
  if (current === target) return { capability: cap, state: target, changed: false };

  const entry: PromotionEntry = { state: target, by: reviewerId, at: deps.now().toISOString(), note: note.slice(0, 500) };
  const next: PromotionRecord = {
    capabilities: { ...record.capabilities, [cap]: entry },
    history: [...record.history, { ...entry, capability: cap, action }].slice(-HISTORY_LIMIT),
  };
  await deps.writeRecord(next, reviewerId);
  return { capability: cap, state: target, changed: current !== target };
}

/**
 * THE THREE-WAY SETTER, and why the two-way one was not enough.
 *
 * `promoteMayaCapability` could only reach `live` and `revertMayaCapability` could only reach
 * `shadow`, so with `review` added there was no way to put a capability INTO the state this
 * whole run exists to ship, and no way back to it once it had been moved. A dial you can only
 * turn to the ends is not a dial.
 *
 * Auth is NOT decided here, deliberately. This function records a decision; the route decides
 * whose decision it may be, using `isRaise` above: raising needs Ali by identity, lowering needs
 * any admin. Putting the auth check in here would hide it from the route tests that have to
 * prove a non-Ali admin is refused.
 */
export function setMayaCapabilityState(
  cap: MayaToolCapability, target: PromotionState, change: PromotionChange, deps: MayaPromotionDeps = defaultDeps(),
): Promise<PromotionResult> {
  return changeState(cap, target, 'set', change, deps);
}

/** Kept so existing callers and existing history entries still read. */
export function promoteMayaCapability(cap: MayaToolCapability, change: PromotionChange, deps: MayaPromotionDeps = defaultDeps()): Promise<PromotionResult> {
  return changeState(cap, 'live', 'promote', change, deps);
}

export function revertMayaCapability(cap: MayaToolCapability, change: PromotionChange, deps: MayaPromotionDeps = defaultDeps()): Promise<PromotionResult> {
  return changeState(cap, 'shadow', 'revert', change, deps);
}

/**
 * The state a capability is in right now, without resolving a mode.
 *
 * `resolveMayaMode` answers "may she act", which folds in the kill switch, the chat flag and
 * M29. The console also needs "what did a person set this to", which is a different question
 * and must not be answered by reading a mode backwards.
 */
export async function currentCapabilityState(
  cap: PromotableCapability, deps: MayaPromotionDeps = defaultDeps(),
): Promise<PromotionState> {
  const record = parseRecord(await deps.readRecord());
  return record.capabilities[cap]?.state ?? DEFAULT_STATES[cap];
}
