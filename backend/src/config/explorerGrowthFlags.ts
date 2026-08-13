/**
 * Explorer Growth OS — feature flags. Plan: docs/EXPLORER_GROWTH_OS_PLAN.md §34.
 *
 * Every flag is DEFAULT OFF via this repo's `=== 'true'` convention (see
 * `enableVoiceCalls` in env.ts), so absent, empty, misspelled, or
 * differently-cased values all resolve false. The subsystem must ship dark.
 *
 * Sub-flags are subordinate to the master. `isExplorerFeatureEnabled()` is the
 * ONLY sanctioned read — a direct sub-flag read would let a capability activate
 * while the master switch is off, the exact failure a dark launch prevents. That
 * rule is enforced, not merely documented: see the direct-read guard in
 * __tests__/explorerGrowthFlags.test.ts.
 *
 * `resolveExplorerGrowthFlags` takes its environment as a parameter so the logic
 * is pure and testable without module-registry resets.
 */

/** A capability that can be independently gated. */
export type ExplorerGrowthFeature =
  | 'signalIngest'
  | 'journeyGovernor'
  | 'commercial'
  | 'aliOutreach'
  | 'sms'
  | 'autoDial'
  | 'inAppNudge'
  | 'aiRanking';

export interface ExplorerGrowthFlags {
  /** Master switch. Off => every capability is off regardless of its own flag. */
  readonly growthOsEnabled: boolean;
  /** Write learner behavioural signals. Safe to enable first, on its own. */
  readonly signalIngestEnabled: boolean;
  /** Run the Journey Governor decision engine. */
  readonly journeyGovernorEnabled: boolean;
  /** Accelerator / subscription / referral messaging. */
  readonly commercialEnabled: boolean;
  /** Personal outreach from Ali's campaign identity. */
  readonly aliOutreachEnabled: boolean;
  /** SMS sends. Independent of voice — different consent basis and cost. */
  readonly smsEnabled: boolean;
  /** Automated outbound voice. Blocked on the §35 consent decisions. */
  readonly autoDialEnabled: boolean;
  /** In-app nudges inside the portal. */
  readonly inAppNudgeEnabled: boolean;
  /** Allow AI to reorder candidates within a priority tier. */
  readonly aiRankingEnabled: boolean;
}

/** Env var name for each flag, so tests and docs share one source of truth. */
export const EXPLORER_GROWTH_ENV_KEYS = {
  growthOsEnabled: 'EXPLORER_GROWTH_OS_ENABLED',
  signalIngestEnabled: 'EXPLORER_SIGNAL_INGEST_ENABLED',
  journeyGovernorEnabled: 'EXPLORER_JOURNEY_GOVERNOR_ENABLED',
  commercialEnabled: 'EXPLORER_COMMERCIAL_ENABLED',
  aliOutreachEnabled: 'EXPLORER_ALI_OUTREACH_ENABLED',
  smsEnabled: 'EXPLORER_SMS_ENABLED',
  autoDialEnabled: 'EXPLORER_AUTO_DIAL_ENABLED',
  inAppNudgeEnabled: 'EXPLORER_IN_APP_NUDGE_ENABLED',
  aiRankingEnabled: 'EXPLORER_AI_RANKING_ENABLED',
} as const satisfies Record<keyof ExplorerGrowthFlags, string>;

/** Maps a feature to the flag that gates it. */
const FEATURE_FLAG: Record<ExplorerGrowthFeature, keyof ExplorerGrowthFlags> = {
  signalIngest: 'signalIngestEnabled',
  journeyGovernor: 'journeyGovernorEnabled',
  commercial: 'commercialEnabled',
  aliOutreach: 'aliOutreachEnabled',
  sms: 'smsEnabled',
  autoDial: 'autoDialEnabled',
  inAppNudge: 'inAppNudgeEnabled',
  aiRanking: 'aiRankingEnabled',
};

/** Strict opt-in: only the exact string 'true' enables a flag. */
function isOn(raw: string | undefined): boolean {
  return raw === 'true';
}

/**
 * Resolve all Explorer Growth flags from an environment source.
 * Pure — no `process.env` access, no I/O. Frozen so a caller cannot mutate
 * a flag at runtime and quietly change the safety posture.
 */
export function resolveExplorerGrowthFlags(
  source: NodeJS.ProcessEnv = process.env,
): ExplorerGrowthFlags {
  return Object.freeze({
    growthOsEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.growthOsEnabled]),
    signalIngestEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.signalIngestEnabled]),
    journeyGovernorEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.journeyGovernorEnabled]),
    commercialEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.commercialEnabled]),
    aliOutreachEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.aliOutreachEnabled]),
    smsEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.smsEnabled]),
    autoDialEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.autoDialEnabled]),
    inAppNudgeEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.inAppNudgeEnabled]),
    aiRankingEnabled: isOn(source[EXPLORER_GROWTH_ENV_KEYS.aiRankingEnabled]),
  });
}

/**
 * Whether a capability may run. Requires BOTH the master flag and the
 * capability's own flag. This is the only sanctioned gate — never read a
 * sub-flag directly.
 */
export function isExplorerFeatureEnabled(
  feature: ExplorerGrowthFeature,
  flags: ExplorerGrowthFlags,
): boolean {
  if (!flags.growthOsEnabled) return false;
  return flags[FEATURE_FLAG[feature]];
}

/** Every capability that is currently permitted to run. Useful for admin/health surfaces. */
export function enabledExplorerFeatures(flags: ExplorerGrowthFlags): ExplorerGrowthFeature[] {
  return (Object.keys(FEATURE_FLAG) as ExplorerGrowthFeature[]).filter((f) =>
    isExplorerFeatureEnabled(f, flags),
  );
}
