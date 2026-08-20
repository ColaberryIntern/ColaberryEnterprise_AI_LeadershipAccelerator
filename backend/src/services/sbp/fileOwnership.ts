/**
 * fileOwnership — who owns each path the platform renders into a student repo.
 *
 * ## Why this is a module and not a comment
 *
 * The three ownership classes have been documented in `profileContract.ts`
 * since the profile layer landed:
 *
 *   .colaberry/plan.json      platform-owned  · replaced wholesale
 *   .colaberry/progress.json  co-owned        · merged field by field
 *   .colaberry/profile.json   STUDENT-OWNED   · seeded once, never overwritten
 *
 * They were enforced in exactly one place — `repoWriter`, at the moment of a
 * git write — and stated as prose everywhere else. That was survivable while
 * `repoWriter` was the only thing that ever moved a rendered file toward a
 * student. It stopped being survivable the moment the docs bundle handed the
 * SAME raw render to a human with the instruction "unzip it into your repo":
 * the student's `unzip` performed the wholesale replace that `repoWriter` had
 * always been careful not to, and the ticks in `progress.json` were gone.
 *
 * So ownership becomes a value any surface can ask about, rather than a rule
 * one surface happens to implement. A new delivery path — a second download, a
 * scaffold, an export — gets the answer by asking, and the test that pins the
 * classification fails if a future renderer adds a student-owned file that
 * nobody classified.
 *
 * PURE. No I/O, no clock.
 */
import { PROGRESS_FILE_PATH } from './verification/progressContract';
import { PROFILE_FILE_PATH } from './profileContract';

/**
 * `platform`  — ours outright. Regenerated every sync; overwriting is a no-op
 *               at worst, so it is safe to hand over as a plain file.
 * `co_owned`  — the platform owns some fields, the student's agent owns others.
 *               Only ever safe to apply through `mergeProgressFile`.
 * `student`   — theirs. Seeded once if absent, never replaced. Carries
 *               editorial choices and consent, neither of which is derivable.
 */
export type FileOwnership = 'platform' | 'co_owned' | 'student';

const OWNERSHIP: Record<string, FileOwnership> = {
  [PROGRESS_FILE_PATH]: 'co_owned',
  [PROFILE_FILE_PATH]: 'student',
};

/**
 * Everything the renderer emits is platform-owned unless it is one of the two
 * files a student writes into. Defaulting to `platform` is safe because the
 * default is only ever consulted for paths the renderer produces, and the two
 * exceptions are named above; a genuinely new co-owned file must be added here,
 * which is what `fileOwnership.test.ts` checks.
 */
export function ownershipOf(path: string): FileOwnership {
  return OWNERSHIP[path] ?? 'platform';
}

/**
 * Can this path be dropped on top of whatever is already there, sight unseen?
 *
 * This is the question a DELIVERY surface asks — a zip the student extracts, a
 * file they save. It is deliberately not "may the platform write here": the
 * platform may write `progress.json`, but only by merging.
 */
export function isSafeToOverwrite(path: string): boolean {
  return ownershipOf(path) === 'platform';
}

/**
 * Where a student-owned file's starting content goes when it travels inside an
 * archive.
 *
 * A student with no repo still needs the seed — it is how their agent learns
 * the criterion sentences it is meant to tick. Shipping it at a DIFFERENT path
 * keeps it available without making extraction destructive: the student copies
 * it into place deliberately, once, when they have nothing to lose. Extraction
 * itself can no longer clobber anything, whatever the instructions say and
 * however fast they were skimmed.
 *
 * `.colaberry/progress.json` ⇒ `.colaberry/progress.seed.json`
 */
export function seedPathFor(path: string): string {
  return path.replace(/\.json$/, '.seed.json');
}
