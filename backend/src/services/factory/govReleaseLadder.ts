/**
 * govReleaseLadder - impose the canonical three-release ladder on a gov build plan.
 *
 * M2-T1. A gov pursuit's build is delivered in three fixed releases, regardless of how
 * the AI decomposer happened to key its own releases:
 *
 *   R0  Foundation      the walking skeleton (Command Center + connected demo + trust
 *                       spine). Built automatically as part of entering the build.
 *   R1  Proposal        the active release the intern works during the pursuit. It
 *                       starts EMPTY here; its stories (P1-P8) are injected in M3.
 *   R2  Full build-out  every other story the decomposer produced, moved intact and
 *                       parked until the proposal is submitted (parking is M2-T2).
 *
 * This is a PURE, gov-only transform applied to the already-gated plan before it is
 * scheduled and materialized. It only reassigns each story's `release` and rewrites the
 * `releases` list - it never adds, drops, renames, or re-scopes a story, so requirement
 * coverage (what the plan gate blocks on) is untouched. The non-gov student path never
 * calls this and keeps its decomposer-emitted releases exactly as before.
 *
 * The first release by the same ordering materializeTasks uses (`key.localeCompare`) is
 * treated as the walking skeleton and becomes R0, so the STORY-000 Command Center and
 * STORY-900 Connected Demo (which materialize injects into the first release) still land
 * in R0. `r0 < r1 < r2` under localeCompare, so ordering is preserved.
 */
import type { BuildPlan, PlanRelease, PlanStory } from '../sbp/planContract';

export const GOV_RELEASE_FOUNDATION = 'r0';
export const GOV_RELEASE_PROPOSAL = 'r1';
export const GOV_RELEASE_BUILD_OUT = 'r2';

/** The three canonical gov release keys, in order. */
export const GOV_RELEASE_KEYS = [
  GOV_RELEASE_FOUNDATION,
  GOV_RELEASE_PROPOSAL,
  GOV_RELEASE_BUILD_OUT,
] as const;

/**
 * Reassign a plan onto R0 / R1 / R2. Returns a new plan; the input is not mutated.
 */
export function normalizeGovReleaseLadder(plan: BuildPlan): BuildPlan {
  const releases = Array.isArray(plan.releases) ? plan.releases : [];
  const stories = Array.isArray(plan.stories) ? plan.stories : [];

  // The walking-skeleton release = the first by the ordering materialize uses.
  const ordered = [...releases].sort((a, b) => a.key.localeCompare(b.key));
  const foundationKey = ordered.length ? ordered[0].key : null;
  const orig0 = ordered.length ? ordered[0] : null;

  // Every story in the skeleton release -> R0; everything else -> R2 (parked build-out).
  // R1 (Proposal) starts empty; its stories are injected in a later milestone.
  const remappedStories: PlanStory[] = stories.map((s) => ({
    ...s,
    release: s.release === foundationKey ? GOV_RELEASE_FOUNDATION : GOV_RELEASE_BUILD_OUT,
  }));

  // Keep the week windows monotonic and contiguous so scheduling stays sane.
  const r0Start = orig0?.week_start ?? 1;
  const r0End = Math.max(orig0?.week_end ?? r0Start, r0Start);
  const r1Week = r0End + 1;
  const maxWeek = releases.reduce((m, r) => Math.max(m, r.week_end ?? 0), r1Week + 1);

  const ladder: PlanRelease[] = [
    {
      key: GOV_RELEASE_FOUNDATION,
      name: 'Foundation',
      goal: 'The walking skeleton. A running Command Center, a connected demo, and the trust spine, proven end to end.',
      demo: 'A running Command Center and a connected demo of the system.',
      week_start: r0Start,
      week_end: r0End,
    },
    {
      key: GOV_RELEASE_PROPOSAL,
      name: 'Proposal',
      goal: 'Produce the submission-ready proposal for this solicitation.',
      demo: 'A complete, human-reviewed proposal package ready to submit.',
      week_start: r1Week,
      week_end: r1Week,
    },
    {
      key: GOV_RELEASE_BUILD_OUT,
      name: 'Full build-out',
      goal: 'The full system build, delivered after the proposal is submitted.',
      demo: 'The delivered system meeting every requirement.',
      week_start: r1Week + 1,
      week_end: Math.max(maxWeek, r1Week + 1),
    },
  ];

  return { ...plan, releases: ladder, stories: remappedStories };
}

// ---------------------------------------------------------------------------
// M2-T2: parking. R2 (Full build-out) is materialized in full but PARKED - the
// intern works R1 (Proposal) during the pursuit, and the build-out is delivered
// only after the proposal is submitted. Parking state lives in the gov project's
// own `project_variables` (where gov state already lives: kind,
// gov_delivery_project_id, command_center_url), so it needs NO shared-table
// column and never touches the student path. Activation is a DELIBERATE switch
// that removes a release from the parked list; it is never automatic.
// ---------------------------------------------------------------------------

/** project_variables key holding the list of parked release keys for a gov project. */
export const GOV_PARKED_RELEASES_VAR = 'gov_parked_releases';

/** R2 Full build-out is parked by default; R0 and R1 are active. */
export const GOV_DEFAULT_PARKED_RELEASES: readonly string[] = [GOV_RELEASE_BUILD_OUT];

type ProjectVariables = Record<string, unknown> | null | undefined;

/** The parked release keys recorded on a gov project, or [] when none/absent/malformed. */
export function getParkedReleases(variables: ProjectVariables): string[] {
  const raw = (variables || {})[GOV_PARKED_RELEASES_VAR];
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
}

/** True when the given release is parked on this gov project. */
export function isReleaseParked(variables: ProjectVariables, releaseKey: string): boolean {
  return getParkedReleases(variables).includes(releaseKey);
}

/**
 * Apply the default parking (R2 parked) to a gov project's variables WITHOUT
 * overwriting an existing choice - so a re-materialize never re-parks a release
 * an admin has deliberately activated. Returns a new object; input not mutated.
 */
export function withDefaultGovParking(variables: ProjectVariables): Record<string, unknown> {
  const next = { ...(variables || {}) };
  if (!(GOV_PARKED_RELEASES_VAR in next)) {
    next[GOV_PARKED_RELEASES_VAR] = [...GOV_DEFAULT_PARKED_RELEASES];
  }
  return next;
}

/**
 * Deliberately activate a parked release: remove it from the parked list.
 * Idempotent (activating an already-active release is a no-op). Returns a new
 * object; input not mutated.
 */
export function activateGovRelease(variables: ProjectVariables, releaseKey: string): Record<string, unknown> {
  const next = { ...(variables || {}) };
  next[GOV_PARKED_RELEASES_VAR] = getParkedReleases(next).filter((k) => k !== releaseKey);
  return next;
}
