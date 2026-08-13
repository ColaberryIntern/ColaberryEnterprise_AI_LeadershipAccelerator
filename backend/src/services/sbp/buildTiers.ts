/**
 * buildTiers — what "a workflow" / "a full project" / "fully autonomous"
 * actually mean, in one place.
 *
 * FR-002 requires the wizard's three tiers to select a genuine generation
 * depth. They did not: `DEFAULT_TARGETS` in decomposePrompt.ts was a single
 * shared set, so all three tiers produced the same size plan and the choice was
 * decoration. This module is the single source of truth for that depth —
 * decomposition reads it, the wizard's copy is derived from it, and the
 * document stage (when it lands) reads its floor and Architect mode from here.
 *
 * Pure data and pure functions only: no I/O, so it can be asserted directly.
 *
 * The numbers satisfy FR-002's acceptance bar — adjacent tiers differ by at
 * least 40% in target requirement count — with headroom, and they escalate
 * releases and stories with them so a bigger tier is genuinely a bigger plan
 * rather than the same plan with a longer list of requirements.
 */

export type BuildTier = 'workflow' | 'project' | 'autonomous';

export interface TierDepth {
  /** Inclusive [min, max] target requirement count for the decomposer. */
  requirements: [number, number];
  /** Release count (r0..rN-1). */
  releases: number;
  /** Inclusive [min, max] target vertical-slice story count. */
  stories: [number, number];
  /**
   * FR-003's minimum document length for this tier, in words. Read by the
   * document stage to detect a short document. Not enforced here.
   */
  wordFloor: number;
  /** Which Architect depth setting this tier maps to. */
  architectMode: 'professional' | 'autonomous';
  /**
   * What the student is told they get. Depth, not a fabricated duration:
   * FR-002 also wants the displayed estimate derived from a trailing-7-day
   * p50, and no such telemetry exists yet, so the wizard states depth instead
   * of inventing minutes. See PROGRESS.md / handoff for that gap.
   */
  blurb: string;
}

export const TIER_DEPTH: Record<BuildTier, TierDepth> = {
  workflow: {
    requirements: [8, 12],
    releases: 3,
    stories: [7, 10],
    wordFloor: 2_500,
    architectMode: 'professional',
    blurb: 'A focused automation: around 8-12 requirements across 3 releases. No repo needed.',
  },
  project: {
    requirements: [18, 24],
    releases: 5,
    stories: [16, 22],
    wordFloor: 6_000,
    architectMode: 'professional',
    blurb: 'The full build: around 18-24 requirements across 5 releases, with reliability and a showcase.',
  },
  autonomous: {
    requirements: [30, 40],
    releases: 7,
    stories: [28, 38],
    wordFloor: 12_000,
    architectMode: 'autonomous',
    blurb: 'A complete agent system: around 30-40 requirements across 7 releases, designed end to end.',
  },
};

export const TIER_ORDER: BuildTier[] = ['workflow', 'project', 'autonomous'];

/** Anything unrecognised falls back to `project`, the wizard's own default. */
export function asTier(size: string | null | undefined): BuildTier {
  return (size && (TIER_ORDER as string[]).includes(size)) ? size as BuildTier : 'project';
}

export function tierDepth(size: string | null | undefined): TierDepth {
  return TIER_DEPTH[asTier(size)];
}

/**
 * The decomposer's `targets` for a tier — exactly the shape
 * `DecomposeInputs.targets` expects, so the call site stays a one-liner.
 */
export function tierTargets(size: string | null | undefined): {
  requirements: [number, number];
  releases: number;
  stories: [number, number];
} {
  const d = tierDepth(size);
  return { requirements: d.requirements, releases: d.releases, stories: d.stories };
}

/** Midpoint of a tier's requirement range — the figure FR-002's bar is measured on. */
export function midRequirements(tier: BuildTier): number {
  const [lo, hi] = TIER_DEPTH[tier].requirements;
  return (lo + hi) / 2;
}
