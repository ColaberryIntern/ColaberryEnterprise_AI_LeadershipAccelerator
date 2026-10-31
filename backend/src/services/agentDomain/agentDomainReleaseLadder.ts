/**
 * The release ladder: ten rungs of autonomy, plus the three workstream releases they replaced.
 *
 * Extracted from `agentDomainStoryTemplates.ts` when projecting the ladder pushed that file past
 * this repo's 500-line hard ceiling. The seam is a real one rather than a convenience: deciding
 * WHAT THE RELEASES ARE is a different job from generating the stories that hang under them, and
 * the migration script needs the first without the second.
 *
 * Phase 2 of `docs/architecture/ai-workforce-management/AUTONOMY_RELEASE_MIGRATION.md`, decided by
 * Ali on 30 October 2026. **A release is a rung of autonomy, not a phase of work.**
 */
import {
  AUTONOMY_LEVELS,
  AUTONOMY_MEANINGS,
  AUTONOMY_NAMESPACE,
  isAutonomyStage,
  type AutonomyLevel,
  type AutonomyStage,
} from './autonomyLadder';

/** A `student_task_lists` row, as the generator describes it. */
export interface GeneratedRelease {
  readonly cluster: string;
  readonly name: string;
  readonly position: number;
}

/**
 * The ten rungs, as releases. **A release is a rung of autonomy, not a phase of work.**
 *
 * Titles are the owner's own wording from `AUTONOMY_MEANINGS`, prefixed with the bare level so a
 * board reads `R4 · Execute and verify stateful, multi-step sandbox tasks`. The bare `R4` is safe
 * in a TITLE, which nothing parses; the CLUSTER key keeps the `autonomy:` namespace, because that
 * is the value that gets stored and read back.
 */
export const AUTONOMY_RELEASES: ReadonlyArray<GeneratedRelease> = AUTONOMY_LEVELS.map((level, i) => ({
  cluster: `${AUTONOMY_NAMESPACE}${level}`,
  name: `${level} · ${AUTONOMY_MEANINGS[level].replace(/\.$/, '')}`,
  position: i,
}));

/**
 * The three original releases, **kept rather than dropped**.
 *
 * `AUTONOMY_RELEASE_MIGRATION.md` makes them the rollback path: after the migration they hold
 * nothing, and one `UPDATE` per story puts everything back where it was. They sit BELOW the ladder
 * (positions 10-12) so an intern opening the board sees the rung they are on first, not three
 * empty lists.
 *
 * They are also why the new cluster keys are namespaced. The lowercase `r0/r1/r2` looks exactly
 * like the ladder and is a different axis, which the migration design names as "most of why this
 * drifted". `r0` and `autonomy:R0` now coexist in one project, and the only reason that is safe is
 * that they are not spelled the same.
 */
export const LEGACY_RELEASES: ReadonlyArray<GeneratedRelease> = [
  { cluster: 'r0', name: 'Discovery and validation (superseded by the ladder)', position: 10 },
  { cluster: 'r1', name: 'Legacy migration plan (superseded by the ladder)', position: 11 },
  { cluster: 'r2', name: 'Capability development (superseded by the ladder)', position: 12 },
];

export const RELEASES: ReadonlyArray<GeneratedRelease> = [...AUTONOMY_RELEASES, ...LEGACY_RELEASES];

/** The release's display name for a cluster key, for the prompt header. */
export const releaseName = (cluster: string): string =>
  RELEASES.find((r) => r.cluster === cluster)?.name ?? cluster;

/** Where every shared-foundation story goes: R0 is literally "define the workflow". */
export const FOUNDATION_STAGE: AutonomyStage = `${AUTONOMY_NAMESPACE}R0`;

/**
 * Thrown when capability data names something that is not a rung of the ladder.
 *
 * Deliberately a refusal rather than a default. A default would place the story on whatever rung
 * the fallback named, and a story sitting on the wrong rung is a story claiming the wrong level of
 * authority -- the one mistake this whole structure exists to prevent. Measured against the
 * shipped capability data on 2026-10-31, every one of the 443 `starting_autonomy` values and all
 * 964 `release_behaviour[].autonomy` values is a valid namespaced rung, so this cannot fire today;
 * it exists for the next record somebody hand-edits.
 */
export class NotAnAutonomyRungError extends Error {
  readonly error_class = 'NotAnAutonomyRungError';

  constructor(capabilityId: string, field: string, value: unknown) {
    super(
      `NotAnAutonomyRungError: capability '${capabilityId}' has ${field}=${JSON.stringify(value)}, `
      + 'which is not one of autonomy:R0..autonomy:R9. A story cannot be placed on a rung that '
      + 'does not exist, and defaulting it would put the work at the wrong authority level. Fix '
      + 'the capability record rather than relaxing this check.',
    );
    this.name = 'NotAnAutonomyRungError';
  }
}

/** The rung a value names, or a refusal. Never a fallback. */
export function rungOf(capabilityId: string, field: string, value: string): AutonomyStage {
  if (!isAutonomyStage(value)) throw new NotAnAutonomyRungError(capabilityId, field, value);
  return value;
}

/** `autonomy:R4` -> `R4`, for a title or a prompt heading. */
export const bareLevel = (stage: AutonomyStage): AutonomyLevel =>
  stage.slice(AUTONOMY_NAMESPACE.length) as AutonomyLevel;

/**
 * Rungs this platform cannot currently reach, and the disclosure every story on one must carry.
 *
 * R8 is "Coordinate necessary, authorized handoffs with other agents", and
 * `AUTONOMY_RELEASE_MIGRATION.md` is blunt about it: "**That capability does not exist in this
 * platform at all** -- the research story that asks about it says so verbatim. It is therefore a
 * platform build, not an intern deliverable."
 *
 * Writing an R8 story without saying so would hand an intern a rung describing behaviour that has
 * nothing underneath it, which is precisely the failure the "no story claims a capability this
 * platform does not have" guard exists to catch -- and it caught this generator on the first run,
 * on `learner_success.CAP.daily_at_risk_student_flagging.autonomy:R8`. The disclosure is the fix;
 * suppressing the story would hide a real gap, and relaxing the guard would be worse than either.
 */
export const RUNG_PLATFORM_GAP: Readonly<Partial<Record<AutonomyLevel, string>>> = Object.freeze({
  R8: '**No agent-to-agent handoff capability exists in this platform today.** R8 is therefore '
    + 'unreachable by fact rather than by choice, and closing that gap is a platform build rather '
    + 'than an intern deliverable -- its natural home is the `platform` domain, whose capabilities '
    + 'are orchestration, agent lifecycle and reliability. Read this story as the specification of '
    + 'what would have to exist, not as work that can be completed against what does.',
});
