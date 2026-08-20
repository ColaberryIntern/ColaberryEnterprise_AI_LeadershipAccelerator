/**
 * criterionPaths — a criterion that NAMES a repo path requires that path to
 * exist in the tree at verification time.
 *
 * ── WHY THIS CHECK AND NOT THE OTHER ONES ───────────────────────────────────
 *
 * Placeholder and inertness detection were built, tested against the real
 * cohort, and abandoned. Scanning for the word `placeholder` is roughly 95%
 * false positives. `"Not built yet"` appears in two real repos as an HONEST
 * status label on a panel with no data — its presence is evidence the trust
 * criterion is SATISFIED, not violated. Any rule that reads a student's prose
 * and infers dishonesty from it penalises exactly the students who were most
 * careful about not showing numbers they had not produced. None of that is
 * implemented here and none of it should be.
 *
 * File presence is a different kind of fact. It is about the tree, not the
 * prose; it has no false positives; and it is precisely the hole that the
 * STORY-000 C3/C4 rewording exposed. The old criteria were grammatically about
 * code behaviour with the file as an object, so a student could tick them
 * honestly with nothing on disk. The reworded criteria state the required
 * state, and this module is what makes that statement checkable.
 *
 * ── WHY IT CANNOT REVOKE ANYTHING ALREADY EARNED ────────────────────────────
 *
 * `student_tasks.verified_at` has exactly one writer — `markTaskVerifiedComplete`
 * — whose first line is `task.verified_at ?? new Date()`, so it can only ever
 * rewrite its own existing value. No code path anywhere sets it back to null;
 * the two raw-SQL statements that mention the column do so only in WHERE
 * clauses. Whatever this module concludes, a story already banked stays banked,
 * and `applyVerificationLatch` holds the displayed state up as well.
 *
 * PURE. No I/O, no clock. The tree is passed in.
 */

/** What the platform can do with this repo, mirroring `connectionAccess.RepoWriteAccess`. */
export type RepoWriteAccess = 'push' | 'pull_only';

/**
 * The repo as it stands at verification time, or null when no tree was read.
 *
 * NULL IS A FIRST-CLASS ANSWER and it means "enforce nothing". A GitHub tree
 * read that timed out, rate-limited, or was never attempted must never cost a
 * student a criterion — the whole point of this module is to check a fact, and
 * an unread tree is the absence of a fact rather than a negative one.
 */
export interface RepoTreeContext {
  /** Every blob path in the tree, repo-relative, forward slashes. */
  paths: ReadonlySet<string>;
  /** As recorded on the connection, or null when it was never captured. */
  writeAccess: RepoWriteAccess | null;
}

/**
 * Files the PLATFORM seeds into a repo it can write to.
 *
 * `renderDocs` writes all three on every sync. That is what makes their absence
 * ambiguous — on a repo we can push to, a missing one is OUR defect; on a repo
 * we cannot, it was never ours to deliver. `blameFor` below is where that
 * ambiguity is resolved, and this list is the input to it.
 */
export const PLATFORM_SEEDED_PATHS: readonly string[] = [
  '.colaberry/plan.json',
  '.colaberry/progress.json',
  '.colaberry/manifest.json',
];

const PLATFORM_SEEDED = new Set<string>(PLATFORM_SEEDED_PATHS);

/**
 * A repo-relative path, conservatively.
 *
 * Deliberately narrow, because the cost of the two errors is not symmetric: a
 * path we fail to spot only means we check less than we could, while a path we
 * hallucinate out of ordinary prose fails a student for a file that was never
 * required. So the shape is pinned tight:
 *
 *   - at least one `/`, so a bare word is never a path
 *   - a final `.ext` of 1-10 word characters, so `docs/stories` (a directory)
 *     and `and/or` (prose) are both out
 *   - segments limited to `[A-Za-z0-9._-]`, so a sentence cannot run into one
 *   - a leading dot is allowed ONLY on the first segment (`.colaberry/x.json`)
 *
 * Hosts and URLs are excluded separately below, since `api.github.com/x/y.json`
 * satisfies the shape.
 */
const PATH_CANDIDATE = /(?<![\w./-])(\.?[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._-]+)+\.[A-Za-z0-9]{1,10})(?![\w/-])/g;

/** A first segment that looks like a hostname — `api.github.com`, `student.github.io`. */
const HOSTLIKE_FIRST_SEGMENT = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/**
 * Every repo path a criterion requires, in order of appearance, de-duplicated.
 *
 * Returns `[]` for a criterion that names no path — which is most of them, and
 * which means this check simply does not apply there.
 */
export function repoPathsNamedIn(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(PATH_CANDIDATE)) {
    const candidate = m[1];

    // A URL. `://` anywhere before the match is enough — we do not need to parse
    // it, only to decline it.
    const before = text.slice(0, m.index ?? 0);
    if (/:\/\/\S*$/.test(before)) continue;

    // `api.github.com/repos/x/y.json` — a dotted first segment is a host, not a
    // directory. `.colaberry` is exempt: its dot is leading, not internal.
    const first = candidate.split('/')[0];
    if (!first.startsWith('.') && HOSTLIKE_FIRST_SEGMENT.test(first)) continue;

    if (seen.has(candidate)) continue;
    seen.add(candidate);
    found.push(candidate);
  }
  return found;
}

/**
 * Whose fault is it that this path is not in the repo?
 *
 * ── THE SEQUENCING DECISION ─────────────────────────────────────────────────
 *
 * The hazard is real and was called out before a line of this was written: if
 * the platform was supposed to write a file and could not, failing the student
 * for its absence punishes them for our defect. `status_json.write_access` is
 * `null` on all 10 live connections today, and PR #1618 is what starts
 * populating it. So the rule has to be safe while that field is empty AND get
 * sharper as it fills, without a second migration.
 *
 *   'push'      the platform CAN write and therefore DID seed this file. Its
 *               absence is our bug or the student deleted it, and we cannot
 *               tell which from here. NOT the student's fault. Not enforced.
 *   'pull_only' the platform can never write this repo, so the file was never
 *               ours to deliver; the student obtains it from the docs bundle
 *               and commits it. Theirs. ENFORCED.
 *   null        we do not know which of the two above applies. ENFORCE NOTHING.
 *
 * Note the default here is the OPPOSITE of `isWritableConnection`, which reads
 * an unrecorded permission as writable — and both are right, because the two
 * questions have opposite safe directions. "May we attempt a write?" should
 * guess yes, since refusing breaks working repos to fix a reporting gap. "May
 * we fail a student for a missing file?" must guess no, since guessing wrong
 * takes credit from someone who earned it. Each default is the cautious one for
 * the student.
 *
 * TODAY'S NET EFFECT, stated plainly: every live connection reads `null`, so no
 * `.colaberry/` file is enforced against anyone yet. Only paths the student
 * unambiguously owns — the source files their own criteria name — are checked.
 * Enforcement of the seeded files switches on per student as #1618 records real
 * permissions, and it can only ever reach students the platform genuinely
 * cannot write for.
 */
function blameForMissing(path: string, writeAccess: RepoWriteAccess | null): boolean {
  if (!PLATFORM_SEEDED.has(path)) return true;      // unambiguously the student's file
  return writeAccess === 'pull_only';
}

/**
 * The paths this criterion requires that are NOT in the repo AND that the
 * student is answerable for. Empty means the criterion is not blocked here —
 * either it names no path, or every named path is present, or the missing one
 * is a file we owed them.
 */
export function missingRequiredPaths(
  criterionText: string,
  tree: RepoTreeContext | null,
): string[] {
  if (!tree) return [];
  return repoPathsNamedIn(criterionText)
    .filter((p) => !tree.paths.has(p))
    .filter((p) => blameForMissing(p, tree.writeAccess));
}
