/**
 * The agent-domain Command Center as REPO DOCUMENTS -- the half that was missing.
 *
 * ## The defect this closes (AF3.9, found by Quincy Nkwain Ninying, 31 Oct 2026)
 *
 * AF3.6's backfill wrote `<domain>.STORY-000` into `student_tasks` with six acceptance criteria,
 * and that is the row the portal renders. The REPO side renders from the project's published
 * BuildPlan instead, and no domain plan contains a STORY-000 of either shape -- measured in
 * production 1 Nov 2026: 10 of 10 domains have the task row, 0 of 10 have it in the plan, and all
 * 10 DO have a published plan, so this was never `refreshRepoDocuments` bailing at `no_plan`.
 *
 * `renderDocs` then tested `plan.stories.some(s => s.id === 'STORY-000')` against the BARE id,
 * found nothing, and helpfully supplied the SBP's generic FIVE-line Command Center seed. So every
 * domain builder's repo received a confident, well-formed story about the wrong assignment: the
 * SBP five are about tabs, sample mode and committing `.colaberry` files, while the domain six are
 * about six named panels, the ten-rung ladder, `effectiveAuthority()` and `no_tool_grants`. A
 * builder reading their repo was reading a different brief from the one the portal grades.
 *
 * A second sync could not fix it either: `repoWriter` is content-addressed, so the stable-and-wrong
 * bytes produced `sbp_repo_write_noop` and Quincy correctly concluded nothing was happening.
 *
 * ## Why the content is GENERATED here and not retyped
 *
 * Everything below comes out of `planForDomain(domainKey)` -- the same generator the provisioner
 * and the backfill use -- plus `COMMAND_CENTER_ACCEPTANCE`, which the backfill binds as `$7`. So
 * the story in the repo and the row on the portal are the same story by construction. Retyping any
 * of it here would create a second copy to drift, which is the failure mode this whole workstream
 * keeps paying for.
 *
 * ## Why the bare path gets a tombstone
 *
 * `repoWriter` writes the paths it renders; it does not delete. Every domain builder's repo already
 * holds a `docs/stories/STORY-000.md` containing the wrong five criteria, and leaving it beside the
 * correct `docs/stories/<domain>.STORY-000.md` would leave two plausible briefs in one repo with
 * nothing to say which is live. The progress file self-heals (`mergeProgressFile` maps over the
 * RENDERED stories, so the stale bare entry is dropped) but the markdown does not. So the bare path
 * is overwritten with a pointer. Deleting it would be the other option and is worse: a builder who
 * has read that file deserves to find out why it changed, not to find it gone.
 *
 * Pure functions only. `planForDomain` reads the capability records off disk synchronously, the
 * same way the provisioner does, and is deterministic for a given domain key.
 */
import { FOUNDATION_STAGE } from './agentDomainReleaseLadder';
import {
  COMMAND_CENTER_ACCEPTANCE,
  COMMAND_CENTER_SHARED_FOUNDATION_REASON,
  COMMAND_CENTER_STORY_ID,
  COMMAND_CENTER_TITLE,
  COMMAND_CENTER_VALIDATION_DEPENDENCY,
  domainCommandCenterStoryId,
} from './agentDomainCommandCenterStory';
import { planForDomain } from './agentDomainStoryTemplates';

/** Where the bare SBP story doc sits in a repo -- the file that is now wrong for these ten. */
export const BARE_COMMAND_CENTER_DOC_PATH = `docs/stories/${COMMAND_CENTER_STORY_ID}.md`;

/** Repo-relative path of the domain Command Center doc. */
export function domainCommandCenterDocPath(domainKey: string): string {
  return `docs/stories/${domainCommandCenterStoryId(domainKey)}.md`;
}

/**
 * The story doc a domain builder reads in their own repo.
 *
 * Acceptance criteria render as UNTICKED checkboxes because that is the progress signal: a ticked
 * box here is one of the three checks that unlocks mark-done, exactly as for every other story.
 *
 * @throws if `domainKey` is not a registered domain -- `planForDomain` owns that check, and the
 *   caller is a best-effort bridge that catches it.
 */
export function domainCommandCenterDoc(domainKey: string): string {
  const storyId = domainCommandCenterStoryId(domainKey);
  const planned = planForDomain(domainKey).stories.find((s) => s.story_id === storyId);
  if (!planned) {
    throw new Error(
      `the generator produced no Command Center for '${domainKey}' -- `
      + 'agentDomainStoryTemplates.ts and agentDomainCommandCenterDoc.ts disagree about the story id',
    );
  }

  return [
    `# ${COMMAND_CENTER_TITLE}`,
    '',
    `**Story id:** \`${storyId}\``,
    `**Rung:** \`${FOUNDATION_STAGE}\` -- the first story of the first rung, before any of this`,
    'domain\'s own work',
    '**Owner:** you, with Claude Code',
    '**Blocked by:** nothing -- this is the first thing you build',
    '',
    '---',
    '',
    '## The brief',
    '',
    planned.body,
    '',
    '## The capability this fulfils',
    '',
    COMMAND_CENTER_SHARED_FOUNDATION_REASON,
    '',
    '## Acceptance -- your stop condition',
    '',
    'Every one of these is checkable by looking at the page. None of them can be satisfied by',
    'marking this story complete.',
    '',
    ...COMMAND_CENTER_ACCEPTANCE.map((a) => `- [ ] ${a}`),
    '',
    '## Who closes this story',
    '',
    COMMAND_CENTER_VALIDATION_DEPENDENCY,
    '',
    '---',
    '',
    '## The build prompt',
    '',
    'This is the prompt attached to this story on the portal. It is reproduced here so a Claude Code',
    'session opening this repository cold has the whole brief locally and does not have to author it',
    'from memory of a page it has never seen.',
    '',
    planned.claude_code_prompt,
    '',
  ].join('\n');
}

/**
 * The pointer left at the bare `docs/stories/STORY-000.md`.
 *
 * States plainly that the file it replaces was wrong and why, because a builder who has already
 * read the five generic criteria and started work on them needs to know that, not to find the file
 * silently different.
 */
export function supersededBareCommandCenterDoc(domainKey: string): string {
  const storyId = domainCommandCenterStoryId(domainKey);
  return [
    `# ${COMMAND_CENTER_STORY_ID} -- superseded`,
    '',
    `**Read \`${domainCommandCenterDocPath(domainKey)}\` instead.**`,
    '',
    `Your Command Center story is \`${storyId}\`, and it has SIX acceptance criteria about the six`,
    'panels, the ten-rung autonomy ladder, `effectiveAuthority()` and your governance queue.',
    '',
    'This file previously held a different story with five criteria -- about tabs, sample mode and',
    'committing `.colaberry` files. That is the Student Build Pipeline\'s Command Center, and it was',
    'written into this repository in error: the renderer looked for the bare id `STORY-000`, did not',
    'find your namespaced one in the plan, and supplied the generic version instead. Your portal',
    'board was correct the whole time; this file was not.',
    '',
    '**If you built against the five criteria, nothing you did is wasted** -- a Command Center that',
    'renders honestly still renders honestly. Read the six criteria and the brief in the file above,',
    'and carry on from there.',
    '',
    `Fixed under AF3.9, reported by the builder who noticed the two did not match.`,
    '',
  ].join('\n');
}

/** The seed that puts the SIX criteria into `.colaberry/progress.json`, unticked. */
export function domainCommandCenterSeed(domainKey: string): {
  id: string;
  release: string;
  acceptance: string[];
} {
  return {
    id: domainCommandCenterStoryId(domainKey),
    release: FOUNDATION_STAGE,
    acceptance: [...COMMAND_CENTER_ACCEPTANCE],
  };
}
