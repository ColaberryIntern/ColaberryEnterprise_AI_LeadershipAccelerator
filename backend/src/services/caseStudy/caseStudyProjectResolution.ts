import { Op, col, fn, where } from 'sequelize';
import CaseStudyRepoCollection from '../../models/CaseStudyRepoCollection';
import CaseStudyRepository from '../../models/CaseStudyRepository';
import GitHubConnection from '../../models/GitHubConnection';

/**
 * caseStudyProjectResolution - which student projects a Case Study is about,
 * when nobody said. I/O (three reads).
 *
 * The maturity rule in the publish gate reads the linked project's foundation
 * and is a no-op for a record with no `project_id`. On 2026-09-14 every live
 * record was unlinked, and one of them cited a repository that belongs to a
 * student project. That is the whole bypass: create the record with
 * `from-repositories` instead of `from-project` and the ladder never sees it.
 *
 * This closes it with a fact, not a guess. A repository row either carries a
 * `project_id` (attached that way), or its owner and name match a
 * `github_connections` row that does. Either is a stored link between the
 * record and a project; neither infers anything about who the client is or
 * whether anyone consented to anything. A repository that belongs to no
 * student project (the enterprise repo, a stranger's repo) resolves to nothing,
 * so the library of records about our own work is untouched.
 *
 * Case-insensitive on owner and name, because GitHub is, and matched through
 * `LOWER()` so the expression index on the repositories table is the shape the
 * planner expects. Returns distinct ids in a stable order.
 */
export async function resolveProjectsThroughRepositories(caseStudyId: string): Promise<string[]> {
  const collection = await CaseStudyRepoCollection.findOne({ where: { case_study_id: caseStudyId } });
  if (!collection) return [];

  const repos = await CaseStudyRepository.findAll({ where: { collection_id: collection.id } });
  const found = new Set<string>();

  for (const repo of repos) {
    if (repo.project_id) {
      found.add(String(repo.project_id));
      continue;
    }
    const owner = String(repo.repo_owner ?? '').trim().toLowerCase();
    const name = String(repo.repo_name ?? '').trim().toLowerCase();
    if (!owner || !name) continue;

    const connections = await GitHubConnection.findAll({
      where: {
        [Op.and]: [
          where(fn('lower', col('repo_owner')), owner),
          where(fn('lower', col('repo_name')), name),
          { project_id: { [Op.ne]: null } },
        ],
      },
    });
    for (const c of connections) {
      if (c.project_id) found.add(String(c.project_id));
    }
  }

  return [...found].sort();
}
