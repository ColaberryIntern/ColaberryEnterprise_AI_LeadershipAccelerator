/**
 * releaseStories — stage 4 of staged generation: the stories for ONE release.
 *
 * Split out of `stagedGeneration.ts` (which had passed the 500-line ceiling)
 * when ShiftFill v8 (2026-11-22) showed the stage needed a second guard.
 *
 * ## The v8 break
 *
 * The outline named r3 "Safety and Approval Mechanisms" before
 * `pullGuardsForward` moved its approval requirements into r1 and r2. The r3
 * writer, holding a release named for approvals and one leftover requirement
 * (REQ-019, "offer shifts to the two temp agencies"), wrote the approvals again:
 * STORY-010 re-did REQ-007 (already STORY-003) and STORY-011 re-did REQ-020
 * (already STORY-009), citing REQ-019 on the way. The plan gained two duplicate
 * stories and lost the only story that would ever contact an agency.
 *
 * Two halves, so neither the prompt nor the code is trusted alone:
 *   - the prompt says which release owns every other requirement, and that the
 *     release's name may predate those moves;
 *   - `keepStoriesInTheirRelease` removes what the model wrote anyway.
 *
 * PURE. No I/O.
 */
import { BUILD_PLAN_JSON_SCHEMA, PlanRelease, PlanRequirement, PlanStory } from './planContract';
import { DecomposeInputs, sourceBlocks } from './decomposePrompt';

const storyItems = (BUILD_PLAN_JSON_SCHEMA as unknown as {
  properties: { stories: { items: unknown } };
}).properties.stories.items;

export const RELEASE_STORIES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stories'],
  properties: { stories: { type: 'array', items: storyItems } },
} as const;

/**
 * @param releaseOf requirement id → the release key it is assigned to. Optional so
 *   older callers keep working; without it the other releases are listed unlabelled.
 */
export function buildReleaseStoriesPrompt(
  inputs: DecomposeInputs,
  release: PlanRelease,
  mine: PlanRequirement[],
  all: PlanRequirement[],
  previousKeyStory: string | null,
  releaseOf?: ReadonlyMap<string, string>,
): string {
  const others = all.filter((r) => !mine.some((m) => m.id === r.id));
  const where = (r: PlanRequirement): string => {
    if (r.kind === 'CONSTRAINT') return ' (constraint)';
    const k = releaseOf?.get(r.id);
    return k ? ` (written in ${k})` : '';
  };
  return [
    `Write the vertical-slice stories for ONE release of a larger plan: ${release.key} "${release.name}".`,
    `Goal: ${release.goal}`,
    `Demo: ${release.demo}`,
    '',
    'Write as many stories as it takes to deliver EVERY requirement assigned to this release, and no',
    'more: usually one story per one to three closely related requirements. Every requirement below',
    'must appear in some story\'s `fulfills`. Never pad, never write a story for a requirement that is',
    'not assigned here, and never a story that only bundles others.',
    // ShiftFill v8: r3's name still said "Safety and Approval" after its approval
    // requirements moved to r1/r2, and its writer did them again.
    'This release\'s name and goal were chosen before some requirements moved to other releases. Go',
    'by the ASSIGNED list, not the name: a requirement listed below as written in another release',
    'already has its story there. Never cite it in `fulfills` and never repeat its behaviour; if an',
    'assigned requirement depends on it (contacting an agency only after approval), build on it.',
    'Every acceptance line of a story must test something its own `fulfills` asks for.',
    'Ids: number your stories S1, S2, … within this release. `blocked_by` may cite only earlier',
    'stories of THIS release (by those S ids) or be empty; gating between releases is added for you.',
    `Every story's \`release\` is "${release.key}".`,
    // Named ids, not "every requirement": live (2026-11-20) the story writer skipped all four
    // NFR targets it was given, which leaves `must_uncovered` for repair to clean up.
    `Before you answer, check that each of these ids appears in at least one story's \`fulfills\`: ${mine.map((r) => r.id).join(', ')}.`,
    'An NFR (a target, a volume, a time limit, a way users must be able to use it) is not a story of',
    'its own: cite it in the `fulfills` of the story whose behaviour it constrains, and make one of',
    'that story\'s acceptance lines test the number.',
    release.key === 'r0'
      ? 'This is r0: it must include the story that proves the guardrail or correctness guarantee end to end. That story\'s "Trust" acceptance line names the audit log entry it writes.'
      : `The previous release ends with ${previousKeyStory ?? 'its last story'}; do not repeat its work.`,
    'Use CONSTRAINT requirements as context in task_guidance (the tools to use), and you may cite them',
    'in `fulfills` alongside the work they serve.',
    // ShiftFill v5: STORY-012 told the student to "integrate with the temp agencies' APIs";
    // nothing the student wrote says the agencies have one. An invented integration is a
    // build task nobody can do.
    'Reach outside parties (agencies, vendors, customers) only through a tool the requirements name',
    '(for example, email them through Gmail). Never invent an API, portal or system the inputs do not name.',
    // ShiftFill v6: STORY-002 said "integrate with the leave management system" when nothing
    // the student wrote says where approved leave is recorded. The rule above covered
    // outside parties, not data whose home is unstated.
    'When the inputs do not say where some data lives (who is on leave, who is licensed where),',
    'do not name a system for it: say in task_guidance to ask the named person where it is kept,',
    'and use a tool the requirements name (such as a Google Sheet) only if the inputs say it is kept there.',
    // ShiftFill v3: one story said "As a scheduler … alert the scheduler" while every other
    // story, and every requirement, named Dana. Two names for one person reads as two people.
    'When the requirements name a person ("Dana"), write for that person by name ("As Dana, …") and',
    'alert, page or escalate to them by name. Never swap in a job title for someone already named.',
    '',
    '<ASSIGNED_TO_THIS_RELEASE>',
    ...mine.map((r) => `- ${r.id} [${r.kind}/${r.priority}] ${r.statement}`),
    '</ASSIGNED_TO_THIS_RELEASE>',
    '',
    '<CONSTRAINTS_AND_OTHER_RELEASES (context only, do not write stories for these)>',
    ...others.map((r) => `- ${r.id} [${r.kind}]${where(r)} ${r.statement}`),
    '</CONSTRAINTS_AND_OTHER_RELEASES>',
    '',
    sourceBlocks(inputs),
  ].join('\n');
}

export interface ReleaseStories {
  release: PlanRelease;
  stories: PlanStory[];
}

/**
 * Remove another release's work from each release's stories.
 *
 * A `fulfills` id assigned to a DIFFERENT release is dropped, but only when that
 * release has a story citing it, so this can never uncover a requirement. A
 * story left citing nothing but constraints is that other release's story
 * written twice, and is dropped, along with any `blocked_by` pointing at it.
 * Ids unknown to the outline (constraints, ids the model invented) are left for
 * `assembleStories`, which already filters unknown ids.
 *
 * Deterministic: same input, same output; the input is not mutated.
 */
export function keepStoriesInTheirRelease(
  perRelease: readonly ReleaseStories[],
  releaseOf: ReadonlyMap<string, string>,
  requirements: readonly PlanRequirement[],
): ReleaseStories[] {
  const constraint = new Set(requirements.filter((r) => r.kind === 'CONSTRAINT').map((r) => r.id));
  const citedIn = (key: string, id: string): boolean =>
    perRelease.some((p) => p.release.key === key && p.stories.some((s) => (s.fulfills ?? []).includes(id)));
  return perRelease.map(({ release, stories }) => {
    const foreign = (id: string): boolean => {
      const home = releaseOf.get(id);
      return !!home && home !== release.key && citedIn(home, id);
    };
    const trimmed = stories.map((s) => ({ ...s, fulfills: (s.fulfills ?? []).filter((f) => !foreign(f)) }));
    const drop = trimmed.map((s, i) => (stories[i].fulfills ?? []).some(foreign) && !s.fulfills.some((f) => !constraint.has(f)));
    const droppedIds = new Set(trimmed.filter((_, i) => drop[i]).map((s) => String(s.id ?? '').trim()).filter(Boolean));
    const kept = trimmed
      .filter((_, i) => !drop[i])
      .map((s) => ({ ...s, blocked_by: (s.blocked_by ?? []).filter((b) => !droppedIds.has(String(b).trim())) }));
    return { release, stories: kept };
  });
}
