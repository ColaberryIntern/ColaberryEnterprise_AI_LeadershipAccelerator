/**
 * repoWriteAccess — "can the platform actually write to this project's repo?",
 * answered once, for the renderers that have to tell a student the truth.
 *
 * WHY THIS IS NOT A FIELD ON `repoForProject`. That function answers a narrower
 * question — "is there a repo worth attempting a write against?" — and returns
 * null for four quite different situations at once. Documents need the
 * distinction it throws away: `push` is the only state in which STORY-000's doc
 * may tell a student their acceptance criteria were seeded into their repo, and
 * on 2026-08-19 that state held for one repository out of thirteen. The other
 * twelve read a document asserting a file that had never been written.
 *
 * WHY A SEPARATE LOOKUP RATHER THAN WIDENING `WorkspaceRepo`. `workspaceRepo.ts`
 * and `repoConnectService.ts` are both being reworked on the open branch behind
 * PR #1618, which inverts the meaning of an unrecorded permission. Adding a
 * field to their return types now would collide with that work for no gain,
 * whereas this module composes with either version of them: it reads
 * `writeAccessOf`, which #1618 leaves alone precisely so that reporting stays
 * faithful while gating gets stricter. One extra indexed read on a path that
 * already does several is a fair price for not fighting an open branch.
 *
 * ONE RESPONSIBILITY: report. It gates nothing, refuses nothing, and writes
 * nothing.
 */
import type { RepoWriteAccess } from './repoConnect/connectionAccess';
import { writeAccessOf } from './repoConnect/connectionAccess';

/**
 * What GitHub told us the platform can do with this project's repo.
 *
 * Three outcomes, and the third is not a failure:
 *   `'push'`      we can write. Documents may say a seeded file is there.
 *   `'pull_only'` GitHub reported `permissions.push: false`. A legitimate
 *                 student choice; nothing is seeded and documents must say so.
 *   `null`        no connection row, or a row from before the permission was
 *                 captured. We do not know, so nothing may be claimed.
 *
 * NEVER THROWS, AND NEVER SWALLOWS. A document render must not fail because a
 * permission lookup did, so any error is reported as `null` — which routes the
 * renderer onto the self-sufficient text, the one that is true regardless.
 * Degrading to "tell the student everything they need" is the correct direction
 * for this question. The failure is still logged with its error class, because a
 * lookup that has started failing every run would otherwise present as every
 * student silently losing their seeded-file claim, with nothing to explain it.
 *
 * The model import is dynamic, and it names ONE MODEL rather than the barrel.
 * `workspaceRepo` reaches for `../../models`, which pulls every model in the
 * application into whatever imported it — and this function is called from
 * `docsBundle`, a download path that had no model dependency at all before.
 * `../../models/GitHubConnection` is the same pattern `refreshRepoDocuments`
 * already uses for `Project`, and it keeps the blast radius to the one table
 * this question is about.
 */
export async function repoWriteAccessForProject(
  projectId: string,
  correlationId?: string | null,
): Promise<RepoWriteAccess | null> {
  try {
    const { default: GitHubConnection } = await import('../../models/GitHubConnection');
    const conn = await GitHubConnection.findOne({ where: { project_id: projectId } });
    if (!conn) return null;
    return writeAccessOf(conn);
  } catch (err: any) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'sbp-repo-write-access',
      event: 'sbp_repo_write_access_lookup_failed',
      correlation_id: correlationId ?? null,
      outcome: 'partial',
      error_class: err?.name ?? 'Error',
      context: {
        projectId,
        message: err?.message ?? String(err),
        effect: 'treated as unknown; STORY-000 renders the self-sufficient text',
      },
    }));
    return null;
  }
}
