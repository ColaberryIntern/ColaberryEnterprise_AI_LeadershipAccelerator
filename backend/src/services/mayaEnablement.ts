import { env } from '../config/env';
import {
  isGrowthJourneyCapabilityEnabled, type GrowthJourneyCapability, type GrowthJourneyFlags,
} from '../config/growthJourneyFlags';
import {
  isExplorerFeatureEnabled, type ExplorerGrowthFeature, type ExplorerGrowthFlags,
} from '../config/explorerGrowthFlags';
import { isKillSwitchActiveStrict } from './launchSafety';

/**
 * One place to ask whether Maya may act, per capability (M29).
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * It is NOT a new flag mechanism, and M29 forbids one explicitly: "no second
 * kill switch, no second flag registry". Nothing here stores state, reads an env
 * var, or defines a switch. Every answer is composed from gates that already
 * exist:
 *
 *   - `isGrowthJourneyCapabilityEnabled` (config/growthJourneyFlags.ts), which
 *     already ANDs the growth-journey master flag, so the master is honoured
 *     without this module reading it.
 *   - `isExplorerFeatureEnabled` (config/explorerGrowthFlags.ts), for the
 *     capabilities that also need a channel to be open.
 *   - `isKillSwitchActiveStrict` (launchSafety.ts), the `system_kill_switch`
 *     settings row.
 *
 * Adding a Maya capability therefore adds NO flag and requires no update to the
 * hand-maintained flag pins in `config/__tests__`.
 *
 * ── THE KILL SWITCH IS CHECKED FIRST, AND THAT IS A DEVIATION ───────────────
 *
 * M29: "system_kill_switch overrides everything". So it is read before any flag.
 *
 * The existing precedent, `resolveStops()` in
 * `growthJourney/execution/resolveExecutionMode.ts`, checks flags FIRST and the
 * switch at step 5. The outcome is identical either way - off is off - but the
 * REASON differs: there, a master-off answers `flag_master_off` without ever
 * reading the switch. Here the switch wins the reason too, because a reader
 * asking "why can Maya not act" during an incident should be told the incident,
 * not a flag that also happens to be off.
 *
 * The STRICT reader is used deliberately. `isKillSwitchActive` swallows a read
 * error and returns false, which fails OPEN. For an agent that can contact a
 * human, an unreadable kill switch must fail CLOSED, so a throw here becomes
 * `kill_switch_unreadable` and the capability stays off.
 *
 * ── EVERY CAPABILITY IS OFF UNTIL SOMEBODY TURNS IT ON ──────────────────────
 *
 * Both underlying resolvers treat anything other than the exact string 'true' as
 * off, and both AND their master flag. There is no default-on path through this
 * module, and no capability can turn itself on: this resolver only REPORTS
 * state. Ali owns every promotion.
 *
 * ── THE MAPPING IS THE REVIEWABLE DECISION ─────────────────────────────────
 *
 * | Maya capability      | Growth gate      | Explorer gate | Why                                              |
 * |----------------------|------------------|---------------|--------------------------------------------------|
 * | respondToExplorerDm  | journeyExecution | inAppNudge    | an outbound reply, in the in-product surface     |
 * | sendInAppWelcome     | journeyExecution | inAppNudge    | same channel, different trigger                  |
 * | createJourneyHandoff | journeyHandoffs  | -             | the existing handoff capability IS this action   |
 * | readPerson360        | journeyDecisions | -             | see the caveat below                             |
 * | sendEmail            | journeyExecution | -             | leaves the platform; see the note below          |
 *
 * `sendEmail` HAS NO EXPLORER GATE, AND THAT IS DELIBERATE (MR2). Every other
 * outbound capability pairs `journeyExecution` with the Explorer flag for the
 * channel it uses, because `inAppNudge` gates the in-product surface. Email has
 * no such flag: the Explorer feature union is `signalIngest`,
 * `journeyIntelligence`, `journeyGovernor`, `draftRender`, `commercial`,
 * `aliOutreach`, `sms`, `autoDial`, `inAppNudge`, `aiRanking` - and none of them
 * is an email channel. `draftRender` gates RENDERING a draft, not sending one,
 * and borrowing it would make the gate read as something it is not.
 *
 * So the gate is `journeyExecution` alone, which the flags module itself calls
 * the only flag that can cause a person to be contacted. Fewer gates is the
 * uncomfortable direction here, so it is worth being explicit about what still
 * stands between this capability and a real inbox: the promotion record (absent
 * in production), `journeyExecution` (unset), Maya's agent row (`enabled=false`),
 * her `send_email` grant (deliberately absent), a brand scope, and
 * `evaluateSend`. This flag is one of six, not the only one.
 *
 * `readPerson360` IS THE ONE TO SANITY-CHECK. M34 calls Person 360 "her eyes",
 * and reading is not acting, so gating it on `journeyDecisions` is a judgement:
 * it treats "Maya may form a view about a person" as the switch. The alternative
 * - leaving reads ungated - was rejected because M29's first acceptance
 * criterion is that every capability is off by default, and an ungated read
 * would be the one exception. If that mapping is wrong it is wrong in the safe
 * direction: it makes Maya blind rather than talkative.
 */

/** The capabilities Maya's tools will ask about (M31 to M34). */
export type MayaCapability =
  | 'respondToExplorerDm'
  | 'sendInAppWelcome'
  | 'createJourneyHandoff'
  | 'readPerson360'
  | 'sendEmail';

/**
 * Why a capability is off, or that it is on. A bare boolean would make an
 * incident indistinguishable from an un-launched feature, which is the same
 * absence-versus-zero mistake the M24 fixes removed from the score's inputs.
 */
export type MayaEnablementReason =
  | 'enabled'
  | 'kill_switch'
  | 'kill_switch_unreadable'
  | `growth_flag_off:${GrowthJourneyCapability}`
  | `explorer_flag_off:${ExplorerGrowthFeature}`;

export interface MayaEnablement {
  capability: MayaCapability;
  enabled: boolean;
  reason: MayaEnablementReason;
}

interface CapabilityGates {
  growth: GrowthJourneyCapability;
  explorer?: ExplorerGrowthFeature;
}

/**
 * The whole mapping, in one object so it can be enumerated by a test rather than
 * restated in one. Exported for that reason only.
 */
export const MAYA_CAPABILITY_GATES: Readonly<Record<MayaCapability, CapabilityGates>> = Object.freeze({
  respondToExplorerDm: { growth: 'journeyExecution', explorer: 'inAppNudge' },
  sendInAppWelcome: { growth: 'journeyExecution', explorer: 'inAppNudge' },
  createJourneyHandoff: { growth: 'journeyHandoffs' },
  readPerson360: { growth: 'journeyDecisions' },
  sendEmail: { growth: 'journeyExecution' },
});

export const MAYA_CAPABILITIES = Object.freeze(
  Object.keys(MAYA_CAPABILITY_GATES) as MayaCapability[],
);

export interface MayaEnablementDeps {
  killSwitchActive: () => Promise<boolean>;
  growthFlags: GrowthJourneyFlags;
  explorerFlags: ExplorerGrowthFlags;
}

function defaultDeps(): MayaEnablementDeps {
  return {
    killSwitchActive: isKillSwitchActiveStrict,
    growthFlags: env.growthJourney,
    explorerFlags: env.explorerGrowth,
  };
}

/**
 * Resolve one capability. Never throws: an unreadable kill switch is an answer
 * (`kill_switch_unreadable`, off), not an exception for every caller to handle.
 */
export async function resolveMayaCapability(
  capability: MayaCapability,
  deps: MayaEnablementDeps = defaultDeps(),
): Promise<MayaEnablement> {
  const off = (reason: MayaEnablementReason): MayaEnablement => ({ capability, enabled: false, reason });

  // 1. The kill switch, before anything else. See the docblock on why this
  //    ordering differs from resolveStops().
  try {
    if (await deps.killSwitchActive()) return off('kill_switch');
  } catch {
    // Fails CLOSED, unlike the lenient reader. An agent that can contact a
    // human does not get the benefit of the doubt about whether it was stopped.
    return off('kill_switch_unreadable');
  }

  const gates = MAYA_CAPABILITY_GATES[capability];

  // 2. The growth-journey capability. This helper already ANDs the master flag,
  //    so a master-off answers here without this module reading the master.
  if (!isGrowthJourneyCapabilityEnabled(gates.growth, deps.growthFlags)) {
    return off(`growth_flag_off:${gates.growth}`);
  }

  // 3. The channel, where the capability needs one open.
  if (gates.explorer && !isExplorerFeatureEnabled(gates.explorer, deps.explorerFlags)) {
    return off(`explorer_flag_off:${gates.explorer}`);
  }

  return { capability, enabled: true, reason: 'enabled' };
}

/** The boolean form, for a call site that only branches. */
export async function isMayaCapabilityEnabled(
  capability: MayaCapability,
  deps?: MayaEnablementDeps,
): Promise<boolean> {
  return (await resolveMayaCapability(capability, deps)).enabled;
}

/**
 * Every capability's state in one call, for an admin surface that shows what is
 * on. Resolved sequentially rather than in parallel so one kill-switch read is
 * not multiplied by the number of capabilities on a page refresh.
 */
export async function resolveAllMayaCapabilities(
  deps: MayaEnablementDeps = defaultDeps(),
): Promise<MayaEnablement[]> {
  const out: MayaEnablement[] = [];
  for (const capability of MAYA_CAPABILITIES) {
    out.push(await resolveMayaCapability(capability, deps));
  }
  return out;
}
