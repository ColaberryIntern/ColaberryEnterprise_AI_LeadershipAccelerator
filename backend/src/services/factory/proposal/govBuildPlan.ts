/**
 * govBuildPlan — the DETERMINISTIC projection of a won proposal's established requirements into the Build track's
 * releases → stories → prompts. It is the gov analogue of responseSlots: a pure read-model over the SAME
 * `established` requirements the workspace already shows, so it is stable across refresh and fabricates nothing.
 *
 * THE RULE (spec §1, reused from Phase-1 T4): build stories appear "where relevant", NOT for every requirement.
 * Only a requirement that classifyRequirementTracks puts on the `solution_build` track becomes a story — an
 * ADMINISTRATIVE requirement (a pricing schedule, an execution-of-offer form, a SAM registration) is
 * proposal-only and MUST NOT generate an invented software feature. Each story CITES its requirement verbatim
 * and carries a stable id derived from the requirement id, so a regeneration preserves story identity.
 *
 * HONESTY RAIL: a story is `unassigned` and is never fabricated into an assigned/built/executed state — plan
 * review, assignment, the student prompt hand-in, and (disabled) execution are later steps. Pure + total.
 */
import { classifyRequirementTracks } from '../govDeliveryProject';

export interface GovBuildStory {
  /** Stable id derived from the requirement id, so regeneration preserves identity (no renumber churn). */
  id: string;
  /** The established requirement this story builds — traceability back to the proposal/compliance spine. */
  requirementId: string;
  title: string;
  /** The requirement text verbatim — the citation; never paraphrased or invented. */
  statement: string;
  release: string;
  acceptance: string[];
  /** First-pass: never a fabricated assigned/built/done — assignment + execution are later, gated steps. */
  status: 'unassigned';
}

export interface GovBuildRelease {
  key: string;
  name: string;
  storyIds: string[];
}

export interface GovBuildPlan {
  releases: GovBuildRelease[];
  stories: GovBuildStory[];
  buildStoryCount: number;
}

const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * Derive the Build-track plan from the established requirements. Only `solution_build`-classified requirements
 * become stories (admin/proposal-only ones never do); stories are de-duplicated by requirement id, in order.
 */
export function deriveGovBuildPlan(established: any[]): GovBuildPlan {
  const rows = Array.isArray(established) ? established : [];
  const stories: GovBuildStory[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    if (!classifyRequirementTracks(r).includes('solution_build')) continue; // never a story for a non-build requirement
    const requirementId = String(r.id ?? r.canonicalReqId ?? '').trim();
    if (!requirementId || seen.has(requirementId)) continue;
    seen.add(requirementId);
    const statement = String(r.text ?? r.statement ?? '').trim();
    stories.push({
      id: `STORY-${requirementId}`,
      requirementId,
      title: truncate(statement, 80) || requirementId,
      statement,
      release: 'r0',
      acceptance: statement ? [`The solution demonstrably satisfies: ${truncate(statement, 240)}`] : [],
      status: 'unassigned',
    });
  }
  const releases: GovBuildRelease[] = stories.length
    ? [{ key: 'r0', name: 'Release 0 — initial build', storyIds: stories.map((s) => s.id) }]
    : [];
  return { releases, stories, buildStoryCount: stories.length };
}

/**
 * The student's Claude Code prompt for one build story — DETERMINISTIC and non-fabricating: it cites the
 * requirement verbatim, scopes the task to it, and asks for requirement-traced evidence. It references NO files
 * (there is no committed manifest here), so it can never point a student at code that does not exist.
 */
export function buildGovStoryPrompt(story: GovBuildStory): string {
  return [
    `# ${story.id}: ${story.title}`,
    '',
    '## The requirement (verbatim, from the solicitation)',
    story.statement || '(no requirement text captured — review the source before building)',
    '',
    '## Your task',
    'Build the part of the solution that satisfies the requirement above. Do NOT invent scope beyond it — an administrative or compliance item is not a software feature.',
    '',
    '## Acceptance',
    ...(story.acceptance.length ? story.acceptance.map((a) => `- ${a}`) : ['- Derive the acceptance from the requirement above and confirm it with your reviewer.']),
    '',
    '## Evidence to hand in',
    `A short description and screenshot(s) showing the requirement is met, traced back to ${story.requirementId}.`,
  ].join('\n');
}
