/**
 * govBuildCommitSync — the gov build cockpit's completion loop: a push to a bound BUILD REPO whose commit message
 * cites a story's requirement key files that commit as evidence for the story (`source: 'github_push'`).
 *
 * THE RAILS (all load-bearing):
 *  - A commit NEVER verifies. It files evidence as `submitted` — a CLAIM. Only a reviewer with `evidence.verify`
 *    moves it to verified/rejected (fileGithubPushEvidence hard-codes 'submitted', same rail as a manual hand-in).
 *  - Credit ONLY the bound project. The repo is bound to a STUDENT project (GitHubConnection.project_id); the gov
 *    delivery project is the one whose `solution_build` track links that student project. A push is never credited
 *    to whatever project happens to be active — same reasoning as resolveProjectForPush.
 *  - Idempotent. GitHub retries deliveries; fileGithubPushEvidence dedupes on (story_id, commit_sha).
 *  - No invented identity. There is no system principal in this codebase and `submitted_by_identity_id` is NOT NULL,
 *    so a commit is credited to the story's ASSIGNEE; an UNASSIGNED story's match is logged and skipped, never
 *    attributed to a fabricated actor.
 *  - Gov keys are the project's OWN requirement ids (any shape the solicitation uses), matched on word boundaries —
 *    not the student path's fixed `PREFIX.###` KEY_PATTERN.
 *
 * Pure matching (citedKeys) is exported for tests; the IO (resolve + file) is best-effort and fire-and-forget from
 * the webhook. It never throws into the webhook — the caller logs and moves on.
 */

export interface CommitInput { sha: string; message: string; authorLogin?: string | null; }
export interface GovCommitMatchResult {
  deliveryProjectId: string | null;
  /** (commit, story) pairs where a commit cited a story's key. */
  matched: number;
  /** evidence rows newly filed (deduped — a redelivered push counts 0). */
  filed: number;
  /** matches skipped because the story has no assignee to credit (logged). */
  skippedNoIdentity: number;
}

/**
 * Which of `keys` the commit message cites. Case-insensitive, on word-ish boundaries (the key is not flanked by an
 * id character), each key regex-escaped. PURE + total. Gov canonical req ids can be any shape, so we match the
 * PROJECT's actual keys rather than assume a fixed pattern.
 */
export function citedKeys(message: string, keys: string[]): string[] {
  const text = String(message ?? '');
  if (!text) return [];
  const hit = new Set<string>();
  for (const raw of Array.isArray(keys) ? keys : []) {
    const key = String(raw ?? '').trim();
    if (!key || hit.has(key)) continue;
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A real citation is the key not run together with a longer id token (so REQ-10 does not match REQ-100).
    const re = new RegExp(`(?<![A-Za-z0-9_.\\-])${esc}(?![A-Za-z0-9_.\\-])`, 'i');
    if (re.test(text)) hit.add(key);
  }
  return [...hit];
}

/**
 * Resolve a build repo (owner/name) to its gov DELIVERY project id, or null. Hop 1 (repo → student project) reuses
 * the canonical findRepoBinding (FR-037). Hop 2 (student project → gov delivery project) is the reverse of the
 * materialize link: the `solution_build` ContractTrack whose `solution_student_project_id` is that student project.
 */
export async function resolveGovDeliveryProjectForRepo(owner: string, repo: string): Promise<string | null> {
  if (!owner || !repo) return null;
  const { findRepoBinding } = await import('../githubIntegrationService');
  const binding = await findRepoBinding(owner, repo);
  const studentProjectId = binding?.projectId ?? null;
  if (!studentProjectId) return null;
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const track: any = await ContractTrack.findOne({ where: { solution_student_project_id: studentProjectId, track_type: 'solution_build' } });
  return track && track.delivery_project_id ? String(track.delivery_project_id) : null;
}

/** The solution_build story keys for a delivery project (= each story's canonical_req_id), with the story id
 *  (STORY-<key>) each resolves to. Mirrors the projection's derivation (pricing dropped, solution_build only). */
async function loadStoryKeys(deliveryProjectId: string): Promise<Array<{ key: string; storyId: string; canonicalReqId: string }>> {
  const { default: ContractRequirement } = await import('../../models/ContractRequirement');
  const { deriveGovBuildPlan } = await import('./proposal/govBuildPlan');
  const reqs: any[] = await ContractRequirement.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const reqRows = reqs
    .filter((r) => String(r?.kind ?? '').trim().toLowerCase() !== 'pricing')
    .map((r) => ({
      canonicalReqId: String(r?.canonical_req_id ?? ''),
      statement: String(r?.statement ?? ''),
      priority: String(r?.priority ?? ''),
      tracks: Array.isArray(r?.tracks) ? r.tracks.map((x: any) => String(x)) : [],
      evidenceState: String(r?.evidence_state ?? ''),
    }));
  return deriveGovBuildPlan(reqRows).stories
    .map((s) => ({ key: s.requirementId, storyId: s.id, canonicalReqId: s.requirementId }))
    .filter((s) => s.key);
}

/**
 * Match a push's commits to this gov project's build stories and file each citation as evidence. Idempotent,
 * assigned-only (an unassigned story's match is logged + skipped), credit-bound to the passed delivery project.
 * Best-effort over individual commits — one bad commit never aborts the batch.
 */
export async function matchCommitsToGovStories(
  deliveryProjectId: string,
  commits: CommitInput[],
  repo: { owner: string; name: string },
): Promise<GovCommitMatchResult> {
  const result: GovCommitMatchResult = { deliveryProjectId: deliveryProjectId || null, matched: 0, filed: 0, skippedNoIdentity: 0 };
  if (!deliveryProjectId || !Array.isArray(commits) || commits.length === 0) return result;

  const stories = await loadStoryKeys(deliveryProjectId);
  if (stories.length === 0) return result;
  const storyByKey = new Map(stories.map((s) => [s.key, s]));
  const keys = stories.map((s) => s.key);

  const { listBuildStoryAssignments } = await import('./govBuildAssignment');
  const assignments = await listBuildStoryAssignments(deliveryProjectId);
  const assigneeByStory = new Map<string, string>();
  for (const a of assignments) if (a.assigneeIdentityId) assigneeByStory.set(a.storyId, a.assigneeIdentityId);

  const { fileGithubPushEvidence } = await import('./govBuildEvidence');
  for (const c of Array.isArray(commits) ? commits : []) {
    const sha = String(c?.sha ?? '').trim();
    if (!sha) continue;
    for (const key of citedKeys(c?.message ?? '', keys)) {
      const story = storyByKey.get(key);
      if (!story) continue;
      result.matched++;
      const assignee = assigneeByStory.get(story.storyId) ?? null;
      if (!assignee) {
        console.error(JSON.stringify({
          level: 'warn', service: 'backend', event: 'gov_commit_match_skipped_no_identity', outcome: 'partial',
          context: { delivery_project_id: deliveryProjectId, story_id: story.storyId, commit_sha: sha },
        }));
        result.skippedNoIdentity++;
        continue;
      }
      try {
        const created = await fileGithubPushEvidence({
          deliveryProjectId,
          storyId: story.storyId,
          canonicalReqId: story.canonicalReqId,
          description: String(c?.message ?? '').split('\n')[0].slice(0, 500),
          artifactRef: `https://github.com/${repo.owner}/${repo.name}/commit/${sha}`,
          submittedByIdentityId: assignee,
          commitSha: sha,
        });
        if (created) result.filed++;
      } catch (err: any) {
        console.error(JSON.stringify({
          level: 'error', service: 'backend', event: 'gov_commit_match_file_failed', outcome: 'failure',
          error_class: err?.constructor?.name ?? 'Error',
          context: { delivery_project_id: deliveryProjectId, story_id: story.storyId, commit_sha: sha, message: err?.message },
        }));
      }
    }
  }
  return result;
}

/**
 * Manual-sync fallback for the gov completion loop. The push webhook (webhookRoutes step 5)
 * catches each push live, but a repo whose hook was registered AFTER its pushes - or never -
 * never fires it, and "Sync from GitHub" is the documented fallback trigger for the SBP path.
 * It was NOT a trigger here, so a gov student whose hook missed their pushes got no commit
 * evidence from the button. This resolves the repo to its gov delivery project, reads recent
 * commits with FULL shas (so dedup matches the webhook), and runs the same idempotent,
 * assigned-only, credit-bound matcher. Returns null when the repo is not a gov build repo (the
 * common SBP case) so the caller can no-op quietly. Best-effort: the reader and matcher both
 * classify their own failures and never throw into the sync.
 */
export async function syncGovCommitsFromRepo(
  owner: string,
  repo: string,
  correlationId?: string,
): Promise<GovCommitMatchResult | null> {
  if (!owner || !repo) return null;
  const deliveryProjectId = await resolveGovDeliveryProjectForRepo(owner, repo);
  if (!deliveryProjectId) return null;
  const { listRepoCommitsForMatch } = await import('../sbp/verification/repoProgressReader');
  const commits = await listRepoCommitsForMatch(owner, repo, correlationId);
  return matchCommitsToGovStories(deliveryProjectId, commits, { owner, name: repo });
}
