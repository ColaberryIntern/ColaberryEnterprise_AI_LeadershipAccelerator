import { env } from '../../config/env';
import { classifyError } from '../../utils/errorClassifier';
import { getSetting, setSetting } from '../settingsService';
import { isKillSwitchActiveStrict } from '../launchSafety';
import {
  MAYA_CAPABILITIES, resolveMayaCapability, type MayaCapability, type MayaEnablement,
} from '../mayaEnablement';

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

export type MayaMode = 'off' | 'shadow' | 'live';
export type PromotionState = 'shadow' | 'live';

export type MayaModeReason =
  | 'kill_switch'
  | 'kill_switch_unreadable'
  | 'chat_off'
  | 'promotion_unreadable'
  | 'not_promoted'
  | 'promoted'
  | 'default_live'
  | `m29:${MayaEnablement['reason']}`;

export interface MayaModeAnswer {
  capability: MayaCapability;
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
  capability: MayaCapability;
  action: 'promote' | 'revert';
}

export interface PromotionRecord {
  capabilities: Partial<Record<MayaCapability, PromotionEntry>>;
  history: PromotionHistoryEntry[];
}

export const PROMOTION_SETTING_KEY = 'maya_capability_promotions';
const HISTORY_LIMIT = 200;

/** Q2: the DM reply keeps its live behavior; everything else starts in shadow. */
export const DEFAULT_STATES: Readonly<Record<MayaCapability, PromotionState>> = Object.freeze({
  respondToExplorerDm: 'live',
  sendInAppWelcome: 'shadow',
  createJourneyHandoff: 'shadow',
  readPerson360: 'shadow',
  // MR2. Email is the only capability that leaves the platform, so it starts in shadow like the
  // rest and additionally needs M29 below. There is no argument for a different default here:
  // `respondToExplorerDm` is `live` only because she had already been answering portal DMs since
  // C121 and starting it in shadow would have silenced her on deploy. Nothing has ever sent an
  // email as Maya, so there is no existing behavior for a shadow default to interrupt.
  sendEmail: 'shadow',
});

/** Capabilities that act without being asked. Live additionally needs M29. */
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

export function isMayaCapability(value: unknown): value is MayaCapability {
  return typeof value === 'string' && (MAYA_CAPABILITIES as readonly string[]).includes(value);
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
    if (isMayaCapability(k) && e && (e.state === 'live' || e.state === 'shadow')) {
      out.capabilities[k] = { state: e.state, by: String(e.by ?? ''), at: String(e.at ?? ''), note: String(e.note ?? '') };
    }
  }
  return out;
}

/** A failed read is an ANSWER (off), but it is still logged with its class: fail closed, never silently. */
function logReadFailure(event: string, cap: MayaCapability, err: unknown): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'maya', event, outcome: 'failure',
    error_class: classifyError(err), context: { capability: cap, message: err instanceof Error ? err.message : String(err) },
  }));
}

export async function resolveMayaMode(cap: MayaCapability, deps: MayaPromotionDeps = defaultDeps()): Promise<MayaModeAnswer> {
  const answer = (mode: MayaMode, reason: MayaModeReason): MayaModeAnswer => ({ capability: cap, mode, reason });
  try {
    if (await deps.killSwitchActive()) return answer('off', 'kill_switch');
  } catch (err: unknown) {
    logReadFailure('maya_kill_switch_unreadable', cap, err);
    return answer('off', 'kill_switch_unreadable');
  }
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
  if (state !== 'live') return answer('shadow', 'not_promoted');

  if (NEEDS_M29_FOR_LIVE.has(cap)) {
    const gate = await deps.m29(cap);
    if (!gate.enabled) return answer('shadow', `m29:${gate.reason}`);
  }
  return answer('live', stored ? 'promoted' : 'default_live');
}

export async function resolveAllMayaModes(deps: MayaPromotionDeps = defaultDeps()): Promise<MayaModeAnswer[]> {
  const out: MayaModeAnswer[] = [];
  for (const cap of MAYA_CAPABILITIES) out.push(await resolveMayaMode(cap, deps));
  return out;
}

export async function readPromotionRecord(deps: MayaPromotionDeps = defaultDeps()): Promise<PromotionRecord> {
  return parseRecord(await deps.readRecord());
}

export class PromotionReviewError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

export interface PromotionChange { reviewerId: string; reviewNote: string }
export interface PromotionResult { capability: MayaCapability; state: PromotionState; changed: boolean }

/**
 * Record a reviewed state change. A reviewer id and a non-empty note are mandatory: this is the
 * "no promotion without human review" guarantee, and it holds for revert too so the history always
 * says who silenced a capability and why. Setting the state it already has is a no-op (idempotent).
 */
async function changeState(
  cap: MayaCapability, target: PromotionState, action: 'promote' | 'revert', change: PromotionChange, deps: MayaPromotionDeps,
): Promise<PromotionResult> {
  const reviewerId = (change.reviewerId ?? '').trim();
  const note = (change.reviewNote ?? '').trim();
  if (!reviewerId) throw new PromotionReviewError('A reviewer is required');
  if (note.length < 3) throw new PromotionReviewError('A review note is required');

  const record = parseRecord(await deps.readRecord());
  const current = record.capabilities[cap]?.state ?? DEFAULT_STATES[cap];
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

export function promoteMayaCapability(cap: MayaCapability, change: PromotionChange, deps: MayaPromotionDeps = defaultDeps()): Promise<PromotionResult> {
  return changeState(cap, 'live', 'promote', change, deps);
}

export function revertMayaCapability(cap: MayaCapability, change: PromotionChange, deps: MayaPromotionDeps = defaultDeps()): Promise<PromotionResult> {
  return changeState(cap, 'shadow', 'revert', change, deps);
}
