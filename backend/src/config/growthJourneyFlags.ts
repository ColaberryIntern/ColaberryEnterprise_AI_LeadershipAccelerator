/**
 * Growth Journey OS feature flags (T209).
 *
 * Mirrors `explorerGrowthFlags.ts`'s shape — one master switch, subordinate
 * sub-flags, strict `'true'` opt-in, a single sanctioned gate — while sharing
 * NONE of its property names. That last part is the whole task.
 *
 * ─── WHY THE NAMES ARE DIFFERENT, AND WHY THAT IS NOT COSMETIC ──────────────
 *
 * `config/__tests__/explorerGrowthFlags.test.ts` walks every `.ts` file under
 * `src` and fails on a property access matching any of Explorer's nine sub-flag
 * names (the ones ending in `Enabled` — signal ingest, auto-dial, and so on)
 * outside two allowlisted paths. Its own comment anticipates a module like this
 * one: "a name collision worth knowing about." A mirror that reused those names
 * would trip it on its very first line.
 *
 * AND IT SCANS RAW TEXT, COMMENTS INCLUDED. The first draft of this very header
 * spelled two of those names out as dotted examples, and the Explorer guard
 * tripped on the comment. So the names are described here, not written.
 *
 * The plan went through three drafts on this point. Cycle 1 said three Explorer
 * tests would break; cycle 2 said none; the truth was that the three named do
 * not break and a fourth does. The resolution is DISTINCT NAMES, not an
 * allowlist entry: adding this file to that guard's `ALLOWED` list would weaken
 * a working guard to accommodate a naming choice. So `journeySignalIngest`, not
 * `signalIngestEnabled`; `journeyExecution`, not `executionEnabled`. A test in
 * this module runs the Explorer guard's own regex over this file and asserts no
 * match, so the non-collision is proven rather than hoped.
 *
 * The precedent is `explorerVoiceEligibility.ts:61`, which takes the auto-dial
 * flag as an injected field named `autoDialFlagOn` while `autoDialEnabled`
 * still lives in the flags module — a consumer choosing a non-colliding name,
 * which is exactly what this task does.
 *
 * ─── NOTHING HERE IS ON ─────────────────────────────────────────────────────
 *
 * Every flag defaults OFF and only the exact string `'true'` turns one on.
 * `journeyExecution` in particular gates anything that would act on a person
 * — it is the Growth Journey counterpart of the "NOTHING SENDS" rule, and it
 * stays off until specifically approved, independently of the master.
 *
 * Env var names are `GROWTH_JOURNEY_*`. None is `EXPLORER_*`: AD-1 forbids
 * renaming an Explorer flag, and a new flag wearing that prefix would read as
 * one that had been.
 */

export type GrowthJourneyCapability =
  | 'journeySignalIngest'
  | 'journeyClassification'
  | 'journeyExecution';

export interface GrowthJourneyFlags {
  /** Master switch. Off => every capability is off regardless of its own flag. */
  readonly growthJourneyEnabled: boolean;
  /** Write generic journey signals for non-Explorer subjects. Safe to enable first. */
  readonly journeySignalIngest: boolean;
  /** Run source/brand/intent/path classification (§7). Reads and records; acts on nothing. */
  readonly journeyClassification: boolean;
  /**
   * Execute a decided action — enrol, schedule, hand off. THE ONLY FLAG THAT
   * CAN CAUSE A PERSON TO BE CONTACTED. Off until specifically approved.
   */
  readonly journeyExecution: boolean;
}

/** Env var name for each flag, so tests and docs share one source of truth. */
export const GROWTH_JOURNEY_ENV_KEYS = {
  growthJourneyEnabled: 'GROWTH_JOURNEY_ENABLED',
  journeySignalIngest: 'GROWTH_JOURNEY_SIGNAL_INGEST_ENABLED',
  journeyClassification: 'GROWTH_JOURNEY_CLASSIFICATION_ENABLED',
  journeyExecution: 'GROWTH_JOURNEY_EXECUTION_ENABLED',
} as const satisfies Record<keyof GrowthJourneyFlags, string>;

const CAPABILITY_FLAG: Record<GrowthJourneyCapability, keyof GrowthJourneyFlags> = {
  journeySignalIngest: 'journeySignalIngest',
  journeyClassification: 'journeyClassification',
  journeyExecution: 'journeyExecution',
};

/** Strict opt-in: only the exact string 'true' enables a flag. */
function isOn(raw: string | undefined): boolean {
  return raw === 'true';
}

/**
 * Resolve all Growth Journey flags from an environment source.
 *
 * Pure — no `process.env` access unless passed, no I/O. Frozen so a caller
 * cannot mutate a flag at runtime and quietly turn something on.
 */
export function resolveGrowthJourneyFlags(
  source: NodeJS.ProcessEnv = process.env,
): GrowthJourneyFlags {
  return Object.freeze({
    growthJourneyEnabled: isOn(source[GROWTH_JOURNEY_ENV_KEYS.growthJourneyEnabled]),
    journeySignalIngest: isOn(source[GROWTH_JOURNEY_ENV_KEYS.journeySignalIngest]),
    journeyClassification: isOn(source[GROWTH_JOURNEY_ENV_KEYS.journeyClassification]),
    journeyExecution: isOn(source[GROWTH_JOURNEY_ENV_KEYS.journeyExecution]),
  });
}

/**
 * Whether a capability may run. Requires BOTH the master flag and the
 * capability's own flag. This is the only sanctioned gate — never read a
 * sub-flag directly. This module's own guard test fails on any file that does.
 */
export function isGrowthJourneyCapabilityEnabled(
  capability: GrowthJourneyCapability,
  flags: GrowthJourneyFlags,
): boolean {
  if (!flags.growthJourneyEnabled) return false;
  return flags[CAPABILITY_FLAG[capability]];
}

/** Every capability currently permitted to run. For admin and health surfaces. */
export function enabledGrowthJourneyCapabilities(flags: GrowthJourneyFlags): GrowthJourneyCapability[] {
  return (Object.keys(CAPABILITY_FLAG) as GrowthJourneyCapability[]).filter((c) =>
    isGrowthJourneyCapabilityEnabled(c, flags),
  );
}
