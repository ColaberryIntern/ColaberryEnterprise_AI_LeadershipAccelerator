/**
 * cockpitModel — PURE front-end read-model for the Build Cockpit. It merges the two things an intern works — the
 * AI build stories and the human proposal tasks — into ONE unified task list the board, drawer and copilot all read,
 * and rolls them up into the summary counts. No React, no IO: unit-tested on its own.
 *
 * The backend already sends each task's `stage`/`owner`/`mine`; this module trusts those when present and otherwise
 * derives them (an older backend that predates the cockpit still renders a correct board). The honesty rail is the
 * backend's and is preserved here: a commit reaches `matched` at most — only reviewer-verified evidence is `done`.
 */
import type {
  StudentGovProjectView, StudentGovBuildStory, StudentSubmissionChecklistItem, GovBuildEvidenceView,
} from '../../../../services/govProjectPortalApi';

export type Stage = 'todo' | 'build' | 'matched' | 'done';

export interface CockpitTask {
  key: string;                 // the requirement / canonical req id shown on the card
  storyId: string | null;      // STORY-<key> for a build story (needed to hand in evidence); null for a proposal task
  title: string;
  statement: string;
  owner: 'ai' | 'human';
  track: 'build' | 'proposal';
  stage: Stage;
  mine: boolean;
  acceptance: string[];
  prompt: string | null;       // build only
  commit: { sha: string; message: string } | null; // the latest matched commit (build only)
  evidence: GovBuildEvidenceView[];                 // build only
  openGapCount: number;        // proposal only (0 for build)
  orphaned: boolean;
  status: string;              // raw lifecycle label (for the drawer)
}

export const STAGES: Array<{ id: Stage; name: string; hint: string }> = [
  { id: 'todo', name: 'Not started', hint: 'Ready to hand to Claude Code' },
  { id: 'build', name: 'In build', hint: 'Being worked in the build repo' },
  { id: 'matched', name: 'Commit matched', hint: 'Review against acceptance, then verify' },
  { id: 'done', name: 'Verified', hint: 'Counts toward the requirement total' },
];

/** Fallback build-story stage when the backend did not send one. Mirrors the backend: verified ⇒ done · any
 *  evidence ⇒ matched · assigned ⇒ build · else todo. A commit never self-verifies. */
function deriveBuildStage(story: StudentGovBuildStory): Stage {
  const ev = Array.isArray(story.evidence) ? story.evidence : [];
  if (ev.some((e) => e.status === 'verified')) return 'done';
  if (ev.length > 0) return 'matched';
  if (story.status === 'assigned') return 'build';
  return 'todo';
}

/** Fallback proposal stage when the backend did not send one: approved ⇒ done · unanswered ⇒ todo · else build. */
function deriveProposalStage(item: StudentSubmissionChecklistItem): Stage {
  if (item.approved) return 'done';
  const status = String(item.status ?? 'unanswered').trim().toLowerCase();
  return !status || status === 'unanswered' ? 'todo' : 'build';
}

function latestCommit(story: StudentGovBuildStory): { sha: string; message: string } | null {
  if (story.commit) return story.commit;
  const push = (Array.isArray(story.evidence) ? story.evidence : []).find((e) => e.source === 'github_push' && e.commitSha);
  return push && push.commitSha ? { sha: push.commitSha, message: push.description } : null;
}

function buildStoryToTask(story: StudentGovBuildStory): CockpitTask {
  return {
    key: story.requirementId,
    storyId: story.id,
    title: story.title,
    statement: story.statement,
    owner: 'ai',
    track: 'build',
    stage: story.stage ?? deriveBuildStage(story),
    mine: story.mine === true,
    acceptance: Array.isArray(story.acceptance) ? story.acceptance : [],
    prompt: story.prompt ?? null,
    commit: latestCommit(story),
    evidence: Array.isArray(story.evidence) ? story.evidence : [],
    openGapCount: 0,
    orphaned: story.orphaned === true,
    status: story.status,
  };
}

function proposalItemToTask(item: StudentSubmissionChecklistItem): CockpitTask {
  return {
    key: item.requirementId,
    storyId: null,
    title: item.statement,
    statement: item.statement,
    owner: 'human',
    track: 'proposal',
    stage: item.stage ?? deriveProposalStage(item),
    mine: item.mine === true,
    acceptance: [],
    prompt: null,
    commit: null,
    evidence: [],
    openGapCount: item.openGapCount ?? 0,
    orphaned: false,
    status: item.status,
  };
}

/**
 * The unified task list for the board: every build story (including preserved/orphaned ones) plus every proposal
 * checklist item. Total — a missing section yields fewer tasks, never a throw.
 */
export function buildTasks(view: StudentGovProjectView | null | undefined): CockpitTask[] {
  if (!view) return [];
  const stories = (view.build && Array.isArray(view.build.stories) ? view.build.stories : []).map(buildStoryToTask);
  const orphans = (view.build && Array.isArray(view.build.orphanedStories) ? view.build.orphanedStories : []).map(buildStoryToTask);
  const proposals = (view.submissionChecklist && Array.isArray(view.submissionChecklist.items) ? view.submissionChecklist.items : []).map(proposalItemToTask);
  return [...stories, ...orphans, ...proposals];
}

export interface CockpitSummary {
  total: number;
  counts: Record<Stage, number>;
  /** Percent of tasks verified (0 when there are none). */
  pct: number;
  aiCount: number;
  humanCount: number;
  /** Tasks sitting in `matched` — the "waiting on a reviewer" number. */
  reviewCount: number;
}

/** Roll the unified task list into the summary panel numbers. Pure + total. */
export function summarize(tasks: CockpitTask[]): CockpitSummary {
  const list = Array.isArray(tasks) ? tasks : [];
  const counts: Record<Stage, number> = { todo: 0, build: 0, matched: 0, done: 0 };
  for (const t of list) counts[t.stage] = (counts[t.stage] ?? 0) + 1;
  const total = list.length;
  return {
    total,
    counts,
    pct: total ? Math.round((counts.done / total) * 100) : 0,
    aiCount: list.filter((t) => t.owner === 'ai').length,
    humanCount: list.filter((t) => t.owner === 'human').length,
    reviewCount: counts.matched,
  };
}
