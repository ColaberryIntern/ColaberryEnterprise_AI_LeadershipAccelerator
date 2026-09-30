import { createHash } from 'crypto';
import { sequelize } from '../../../config/database';

/**
 * The systems learners built, as a metric may see them.
 *
 * WHY THIS SHAPE. `METRIC_PROVENANCE_PIPELINE.md` §2.6 records that no consent
 * axis covers publication of learner data, and §9 keeps cohort metrics closed
 * until one exists. That gate is about per-learner competency figures. A COUNT
 * of distinct systems is a much milder thing — but it is still built from
 * learners' work, so this loader is written so that the dangerous version cannot
 * be built on top of it by accident:
 *
 *   · No owner, no repository name, no enrolment id, no learner identity ever
 *     leaves this module. Only an opaque ref and a file count.
 *   · The ref is the same one-way hash the repository analyzer uses, so a
 *     computation can distinguish two systems without being able to name either.
 *   · Nothing here returns a per-learner row. One learner with three
 *     repositories is three systems, and no field says they share an owner.
 *
 * A definition can therefore say "nineteen systems were built" and cannot say
 * anything about who built them, because it was never given that.
 */

export interface MetricLearnerSystem {
  /** `sha256(owner/name)`, truncated. Opaque and stable; never reversible here. */
  readonly ref: string;
  /** Files the platform observed in the repository tree. 0 when never read. */
  readonly fileCount: number;
  /** Whether the platform has actually read the tree, as opposed to only holding a URL. */
  readonly treeRead: boolean;
}

/** Owners whose repositories are Colaberry's own products rather than a learner's build. */
const NON_LEARNER_OWNERS = new Set(['colaberryintern', 'octocat']);

const refOf = (owner: string, name: string): string =>
  createHash('sha256').update(`${owner.toLowerCase()}/${name.toLowerCase()}`).digest('hex').slice(0, 16);

/**
 * Every distinct learner-owned system the platform knows about.
 *
 * DISTINCT BY REPOSITORY, not by connection row: several connections can point
 * at the same repository, and counting rows would report the same system more
 * than once. That is not hypothetical — the production table holds duplicates
 * today.
 *
 * `octocat/Hello-World` and repositories under the Colaberry organisation are
 * excluded: the first is GitHub's one-file demo used as a placeholder, and the
 * second is company product work that interns contribute to. Counting either as
 * "a system a learner built" would make the figure mean two different things at
 * once.
 */
export async function loadLearnerSystems(): Promise<MetricLearnerSystem[]> {
  const rows = (await sequelize.query(
    `SELECT DISTINCT ON (lower(repo_owner), lower(repo_name))
            repo_owner, repo_name, file_count, file_tree_json IS NOT NULL AS tree_read
       FROM github_connections
      WHERE repo_owner IS NOT NULL AND repo_owner <> ''
        AND repo_name  IS NOT NULL AND repo_name  <> ''
      ORDER BY lower(repo_owner), lower(repo_name)`,
    { type: (sequelize as unknown as { QueryTypes: { SELECT: string } }).QueryTypes.SELECT }
  )) as unknown as LearnerRow[];

  return rows
    .filter((r) => !NON_LEARNER_OWNERS.has(String(r.repo_owner).toLowerCase()))
    .map(toLearnerSystem);
}

/**
 * One database row, reduced to what a metric may see.
 *
 * EXTRACTED SO THE PRIVACY GUARANTEE IS TESTABLE. Inline, this mapping was
 * defended by nothing: a mutation adding `enrollmentId` to the returned object
 * passed the whole suite AND `tsc --noEmit`, because the tests never reach the
 * loader (it needs a database) and excess properties survive an inferred
 * `.map()`. A pure function can be called directly, so the test below asserts
 * the EXACT key set of what comes out — which is the only form of this check
 * that a later edit cannot walk past.
 */
export function toLearnerSystem(row: LearnerRow): MetricLearnerSystem {
  return {
    ref: refOf(String(row.repo_owner), String(row.repo_name)),
    fileCount: Number(row.file_count) || 0,
    treeRead: row.tree_read === true,
  };
}

interface LearnerRow {
  repo_owner: string;
  repo_name: string;
  file_count: number | string | null;
  tree_read: boolean;
}
