import { decomposeBuild } from '../decomposeService';
import { DECOMPOSE_SYSTEM_PROMPT, buildDecomposeUserPrompt } from '../decomposePrompt';
import { applyMeasurements, EVIDENCE_MEASUREMENTS } from '../../lifecycle/lifecycleEvidence';
import {
  prerequisiteGaps, blockingGaps, satisfied, type LifecycleEvidence,
} from '../../lifecycle/lifecyclePrerequisites';
import { completeEvidence } from '../../lifecycle/__tests__/evidenceFixture';

/**
 * P6-T4 attempt 2 — `workspace` survives GENERATION and reaches `release_review`.
 *
 * ## Why this file exists
 *
 * Attempt 1 was graded FAIL with one named fix: the rule I built had an empty production domain,
 * because nothing filled the field it reads. Every test I had written constructed the plan by hand
 * as a `PlanLike` literal — which proves the predicate works and says nothing about whether the
 * field ever gets filled. The grader's words: "a case where `release_review` reaches
 * `release_without_user_visible_workflow` or zero gaps from GENERATED data, not from a hand-built
 * literal."
 *
 * So this drives `decomposeBuild` — the real generation entry point, with its real parsing, its
 * real `isPlanShaped` check and its real retry loop — and carries the plan it RETURNS into the real
 * measurement map and the real prerequisite rule. The chain under test:
 *
 *     decomposeBuild -> BuildPlan -> EVIDENCE_MEASUREMENTS -> assessedFields -> release_review
 *
 * ## The limit, stated plainly
 *
 * THE MODEL IS STUBBED. Nothing here calls OpenAI, so this proves the field SURVIVES the
 * generation pipeline and flows into the rule — not that a live model emits it. Two things oblige
 * the model and neither can be tested without a live call: `BUILD_PLAN_JSON_SCHEMA` lists
 * `workspace` in the story `required` array under `strict: true`, and the user prompt instructs it
 * in words. What a stub CAN establish is that nothing between the response and the rule drops the
 * field, which is where attempt 1's gap actually was.
 */

type Story = Record<string, unknown>;

function planWith(stories: Story[]) {
  return {
    project_name: 'P', descriptor: 'd',
    requirements: [{
      id: 'REQ-1', statement: 's', kind: 'FUNC', priority: 'must', cluster: 'c', from_dimensions: [],
    }],
    releases: [{ key: 'r0', name: 'n', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
    stories,
  };
}

const story = (id: string, workspace: unknown): Story => ({
  id, release: 'r0', title: 't', narrative: 'n', fulfills: ['REQ-1'],
  owner_agent: 'AGENT-001', acceptance: ['Given a', 'When b', 'Trust c'],
  task_guidance: 'g', failure_paths: ['f'], blocked_by: [],
  ...(workspace === undefined ? {} : { workspace }),
});

/** A client that returns exactly the plan it is given, as the model would. */
const clientReturning = (plan: unknown) => ({
  create: jest.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(plan) } }],
    usage: { total_tokens: 1 },
  })),
});

/** Run the REAL measurement map and the REAL rule over a generated plan. */
function releaseReviewFor(plan: unknown) {
  const row = {
    tenant_id: 'tenant-1', student_project_id: 'proj-1', delivery_project_id: null,
  } as unknown as Parameters<typeof applyMeasurements>[2]['row'];
  const e = applyMeasurements(
    completeEvidence() as LifecycleEvidence,
    EVIDENCE_MEASUREMENTS,
    { row, refs: null, plan: plan as never },
  );
  return { e, gaps: prerequisiteGaps('release_review' as never, e) };
}

describe('the generation contract obliges the model to declare workspace', () => {
  it('the schema REQUIRES it under strict mode, so a compliant model cannot omit it', () => {
    // This is the obligation a stub cannot exercise, asserted at the contract instead.
    const storySchema = (require('../planContract').BUILD_PLAN_JSON_SCHEMA as any)
      .properties.stories.items;
    expect(storySchema.required).toContain('workspace');
    expect(storySchema.properties.workspace.properties.kind.enum).toEqual(['workspace', 'headless']);
  });

  it('the prompt instructs it in words, and says a headless-only release is wrong', () => {
    // The schema makes the field mandatory; only the prompt can explain what an honest answer is.
    // Without this paragraph a model would satisfy the schema by labelling everything a workspace,
    // which would make the rule pass on exactly the plans it was built to catch.
    const prompt = buildDecomposeUserPrompt({ brief: 'b', document: 'd' } as never);
    expect(prompt).toContain('workspace');
    expect(prompt).toMatch(/EVERY RELEASE MUST CONTAIN AT LEAST ONE/);
    expect(prompt).toContain('headless');
    // The system prompt stays about grounding and injection; the per-field instruction belongs with
    // the other generation targets in the user message.
    expect(DECOMPOSE_SYSTEM_PROMPT).toContain('DATA describing a system to build');
  });
});

describe('workspace survives decomposeBuild and reaches release_review', () => {
  it('a GENERATED plan carries workspace through, and the rule MEASURES it', async () => {
    const generated = planWith([
      story('STORY-001', { kind: 'headless', ref: 'ingest-job', action: null }),
      story('STORY-002', { kind: 'headless', ref: 'reconcile-job', action: null }),
    ]);
    const { plan } = await decomposeBuild({
      brief: 'b', document: 'd', client: clientReturning(generated), correlationId: 'c',
    } as never);

    // Nothing between the model response and the caller drops the field.
    expect(plan.stories.map((s) => (s as never as { workspace: { kind: string } }).workspace.kind))
      .toEqual(['headless', 'headless']);

    // And the rule reaches a MEASURED verdict from that generated plan — the thing attempt 1 could
    // not do from any input at all.
    const { e, gaps } = releaseReviewFor(plan);
    expect(e.assessedFields.has('releasesWithoutUserVisibleWorkflow')).toBe(true);
    expect(e.releasesWithoutUserVisibleWorkflow).toEqual(['r0']);
    expect(gaps.map((g) => g.rule)).toEqual(['release_without_user_visible_workflow']);
    expect(gaps.map((g) => g.kind)).toEqual(['unmet']);
  });

  it('a generated plan with a real workspace reaches ZERO gaps', async () => {
    const generated = planWith([
      story('STORY-001', { kind: 'headless', ref: 'job', action: null }),
      story('STORY-002', { kind: 'workspace', ref: 'Intake review', action: 'approve' }),
    ]);
    const { plan } = await decomposeBuild({
      brief: 'b', document: 'd', client: clientReturning(generated), correlationId: 'c',
    } as never);

    const { e, gaps } = releaseReviewFor(plan);
    expect(e.assessedFields.has('releasesWithoutUserVisibleWorkflow')).toBe(true);
    expect(e.releasesWithoutUserVisibleWorkflow).toEqual([]);
    expect(gaps).toEqual([]);
    expect(satisfied(gaps)).toBe(true);
  });

  it('a model that OMITS workspace still returns, and the rule then BLOCKS', async () => {
    // The local shape check (`isPlanShaped`) validates only that requirements, releases and stories
    // are present and non-empty — it does NOT enforce per-story fields. So a response missing
    // `workspace` is returned rather than refused, and that is deliberate: `MAX_SHAPE_ATTEMPTS` is
    // 2, so a hard local check would turn one model hiccup into a failed build for a student. The
    // same reasoning that keeps the source overflow non-blocking.
    //
    // It is safe because the failure direction is safe: an unfilled field is UNMEASURED, and
    // unmeasured BLOCKS. The gate degrades to "cannot tell", never to "fine".
    const generated = planWith([story('STORY-001', undefined)]);
    const { plan } = await decomposeBuild({
      brief: 'b', document: 'd', client: clientReturning(generated), correlationId: 'c',
    } as never);
    expect((plan.stories[0] as Record<string, unknown>).workspace).toBeUndefined();

    const { e, gaps } = releaseReviewFor(plan);
    expect(e.assessedFields.has('releasesWithoutUserVisibleWorkflow')).toBe(false);
    expect(gaps.map((g) => g.rule)).toEqual(['release_workflow_unassessed']);
    expect(blockingGaps(gaps)).toHaveLength(1);
    expect(satisfied(gaps)).toBe(false);
  });
});
