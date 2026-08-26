/**
 * fileOwnership — who owns each path the platform renders into a student repo.
 *
 * ## Why this is a module and not a comment
 *
 * The ownership classes have been documented in `profileContract.ts` since the
 * profile layer landed:
 *
 *   .colaberry/plan.json      platform-generated · replaced ONLY while unedited
 *   .colaberry/progress.json  co-owned           · merged field by field
 *   .colaberry/profile.json   STUDENT-OWNED      · seeded once, never overwritten
 *
 * `plan.json` moved out of the plain `platform` class after it destroyed real
 * student work. It is platform-GENERATED, which is not the same as platform-
 * owned: students hand-edit it — adding stories, fixing a requirement mapping —
 * and their Command Center reads it at runtime, so an overwrite costs them the
 * data AND the dashboard built on it. In one repo the bot overwrote a student's
 * file, he restored it by hand, and the bot overwrote him again. Regenerating it
 * is still correct when the copy in the repo is provably the one the platform
 * last wrote; it is never correct otherwise.
 *
 * The classes were enforced in exactly one place — `repoWriter`, at the moment
 * of a git write — and stated as prose everywhere else. That was survivable while
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
import { PLAN_FILE_PATH } from './planDocument';

/**
 * `platform`         — ours outright. Regenerated every sync; overwriting is a
 *                      no-op at worst, so it is safe to hand over as a plain file.
 * `platform_unless_edited`
 *                    — WE generate it and we replace it wholesale, but only for
 *                      as long as the copy in the repo is byte-identical to the
 *                      one we last wrote. The moment a human edits it, it stops
 *                      being ours to replace. Distinct from `co_owned` because
 *                      there is no merge: the file is taken whole from one side
 *                      or the other, never blended. Distinct from `student`
 *                      because an untouched copy SHOULD keep receiving updates.
 * `co_owned`         — the platform owns some fields, the student's agent owns
 *                      others. Only ever safe to apply through `mergeProgressFile`.
 * `student`          — theirs. Seeded once if absent, never replaced. Carries
 *                      editorial choices and consent, neither of which is derivable.
 */
export type FileOwnership = 'platform' | 'platform_unless_edited' | 'co_owned' | 'student';

const OWNERSHIP: Record<string, FileOwnership> = {
  [PLAN_FILE_PATH]: 'platform_unless_edited',
  [PROGRESS_FILE_PATH]: 'co_owned',
  [PROFILE_FILE_PATH]: 'student',
};

/**
 * Everything the renderer emits is platform-owned unless it is one of the three
 * files a student writes into. Defaulting to `platform` is safe because the
 * default is only ever consulted for paths the renderer produces, and the
 * exceptions are named above; a genuinely new co-owned file must be added here,
 * which is what `fileOwnership.test.ts` checks.
 */
/**
 * Whole subtrees a student writes into, matched by prefix rather than exact path.
 *
 * `.claude/agents/` is the Week 7 lab's deliverable: the student builds three
 * subagents by hand, proves each one gets invoked, and commits a recording of
 * them working. The filenames come from their own project, so they cannot be
 * enumerated here the way the three `.colaberry/` files can.
 *
 * ── THIS IS A GUARD AGAINST A FUTURE WRITE, NOT A CURRENT BUG ───────────────
 *
 * Nothing in the pipeline writes `.claude/agents/` today. The hazard is the
 * default: `ownershipOf` returns `platform` for anything unlisted, and
 * `platform` means safe to drop on top sight unseen. So the day the project
 * build learns to generate agents — and the plan already models them, with
 * triggers, skills and gates — those writes would land on the default class and
 * wholesale-replace whatever the student built.
 *
 * That is not hypothetical. It is what this module was created to stop after it
 * happened to `plan.json`: "the bot overwrote a student's file, he restored it
 * by hand, and the bot overwrote him again." Classifying the path before anyone
 * writes to it costs one line; classifying it afterwards costs a student their
 * week.
 */
const STUDENT_OWNED_PREFIXES: readonly string[] = ['.claude/agents/'];

export function ownershipOf(path: string): FileOwnership {
  const exact = OWNERSHIP[path];
  if (exact) return exact;
  // Normalise a leading ./ so a caller that builds paths by concatenation gets
  // the same answer as one that does not.
  const normalised = path.replace(/^\.\//, '');
  if (STUDENT_OWNED_PREFIXES.some((prefix) => normalised.startsWith(prefix))) return 'student';
  return 'platform';
}

/**
 * Can this path be dropped on top of whatever is already there, sight unseen?
 *
 * This is the question a DELIVERY surface asks — a zip the student extracts, a
 * file they save. It is deliberately not "may the platform write here": the
 * platform may write `progress.json`, but only by merging, and it may write
 * `plan.json`, but only after proving the repo copy is still its own.
 *
 * Only bare `platform` qualifies. A zip has no way to run either of those
 * checks — extraction is a blind overwrite — so every file needing a check
 * before it lands travels to a `.seed.json` sibling instead.
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
