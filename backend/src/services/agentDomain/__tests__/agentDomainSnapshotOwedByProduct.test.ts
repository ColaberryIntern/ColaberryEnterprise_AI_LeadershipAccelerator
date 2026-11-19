/**
 * The gap board: what the PLATFORM owes a builder before they can go further.
 *
 * ## Why this is a snapshot section rather than a filter the page applies
 *
 * "Who is blocked on Ali" has to read the same on every surface that asks it. A client-side filter
 * over the candidate list guarantees it does not: two pages filtering the same list by slightly
 * different stage sets is how two dashboards end up disagreeing about the same builder, and
 * neither is wrong in a way anybody can see.
 *
 * ## Why only two stages count
 *
 * `platform_owed` is the fork Ali named: the app has the endpoints and nobody built the page, or it
 * half does the job and the ruling is his. `screen_built` is the other side: he built it, and a
 * screen delivered and never used is the failure mode that looks like success.
 *
 * The plan named a third, "screen-tested". There is no such stage, deliberately — once the builder
 * has tested the screen the candidate is at `by_hand_pending` and the product owes nothing. A
 * stage for "tested" would be a stage nobody is ever in.
 */

import { buildAgentDomainSnapshot, serialiseAgentDomainSnapshot } from '../agentDomainSnapshot';
import {
  OWED_BY_PRODUCT_STAGES,
  owedByProductSection,
  type CandidateListResult,
  type CandidateView,
} from '../candidateSection';
import { CANDIDATE_STAGES, type CandidateStage } from '../candidateStages';
import type { DomainCapabilityMatrix } from '../capabilityRecord';

function matrix(): DomainCapabilityMatrix {
  return {
    domain_key: 'marketing',
    capabilities: [{
      capability_id: 'marketing.a',
      human_decision: false,
      starting_autonomy: 'autonomy:R0',
      max_permitted_autonomy: 'autonomy:R4',
      blocked_by: [],
      release_behaviour: [],
    }],
    legacy_dispositions: [],
  } as unknown as DomainCapabilityMatrix;
}

/** One candidate parked at a named stage. Everything else is the same, so the stage is the test. */
function at(stage: CandidateStage, over: Partial<CandidateView> = {}): CandidateView {
  return {
    id: `cand-${stage}`,
    domain_key: 'marketing',
    title: `A candidate at ${stage}`,
    source: 'owner',
    source_note: null,
    product_state: stage === 'platform_owed' ? 'api_only' : 'in_app',
    matched_feature_key: null,
    proven_by_hand_at: null,
    screen_request_id: null,
    screen_request_status: null,
    tool_request_id: null,
    tool_request_status: null,
    step: {
      stage,
      turn: stage === 'platform_owed' || stage === 'tool_requested' ? 'owner' : 'builder',
      action: `do the thing for ${stage}`,
      blocked_reason: stage === 'platform_owed' ? 'Ali owes you the screen.' : null,
      artifact_path: `artifacts/capability/x/${stage}.md`,
    },
    ...over,
  };
}

/** A fixture covering ALL EIGHT stages, so the filter is tested against everything it must reject. */
const EVERY_STAGE: CandidateListResult = {
  candidates: CANDIDATE_STAGES.map((s) => at(s)),
  scoped_to_domains: ['marketing'],
  reason: 'one candidate at every stage',
};

const build = (candidates?: CandidateListResult) => buildAgentDomainSnapshot({
  domain_key: 'marketing',
  agent: null,
  matrix: matrix(),
  governance: [],
  candidates,
}) as Record<string, Record<string, unknown>>;

describe('it lists only the stages the product owes', () => {
  it('POSITIVE CONTROL: the fixture really does cover all eight stages', () => {
    expect(EVERY_STAGE.candidates).toHaveLength(8);
    expect(EVERY_STAGE.candidates.map((c) => c.step.stage).sort())
      .toEqual([...CANDIDATE_STAGES].sort());
  });

  it('keeps platform_owed and screen_built, and nothing else', () => {
    const section = owedByProductSection(EVERY_STAGE);
    const owed = section.owed as Array<{ stage: CandidateStage }>;
    expect(owed.map((o) => o.stage).sort()).toEqual(['platform_owed', 'screen_built']);
  });

  it('rejects the six stages the product owes nothing for, named individually', () => {
    const owed = new Set(
      (owedByProductSection(EVERY_STAGE).owed as Array<{ stage: string }>).map((o) => o.stage),
    );
    for (const s of [
      'proposed', 'scope_sheet_owed', 'by_hand_pending',
      'proven_by_hand', 'tool_requested', 'agent_watched',
    ]) {
      expect(owed.has(s)).toBe(false);
    }
  });

  it('tool_requested is NOT owed by the product, which is the easy mistake', () => {
    // It is the owner's turn, so it looks like it belongs here. It does not: Ali owes a DECISION,
    // not a screen, and mixing the two would make the gap board a to-do list for two different
    // things and useful for neither.
    const owed = owedByProductSection({
      candidates: [at('tool_requested')], scoped_to_domains: ['marketing'], reason: 'x',
    });
    expect(owed.owed).toEqual([]);
    expect((owed.summary as Record<string, number>).owed).toBe(0);
  });

  it('the stage list it filters on is exported, so a page cannot invent its own', () => {
    expect([...OWED_BY_PRODUCT_STAGES]).toEqual(['platform_owed', 'screen_built']);
    for (const s of OWED_BY_PRODUCT_STAGES) expect(CANDIDATE_STAGES).toContain(s);
  });

  it('counts the two halves apart, because different people clear them', () => {
    const summary = owedByProductSection(EVERY_STAGE).summary as Record<string, number>;
    expect(summary.owed).toBe(2);
    expect(summary.waiting_for_a_screen_or_a_ruling).toBe(1);
    expect(summary.built_and_not_yet_used).toBe(1);
  });
});

describe('empty and absent are different answers', () => {
  it('an ABSENT list says the platform did not supply one', () => {
    const section = build().owed_by_product;
    expect(section.known).toBe(false);
    expect(String(section.note)).toMatch(/NOT a statement that nothing is owed/);
    expect(section.owed).toEqual([]);
  });

  it('an EMPTY list says nothing is owed, and says it in words', () => {
    const section = owedByProductSection({
      candidates: [at('by_hand_pending')], scoped_to_domains: ['marketing'], reason: 'one',
    });
    expect(section.known).toBe(true);
    expect(section.owed).toEqual([]);
    expect(String(section.reason)).toMatch(/Nothing is waiting on the platform/);
  });

  it('a non-empty list says you are not blocked on yourself', () => {
    const section = owedByProductSection(EVERY_STAGE);
    expect(String(section.reason)).toMatch(/not blocked on yourself/);
    expect(String(section.reason)).toContain('2 of your 8');
  });
});

describe('the snapshot carries it, and the six sources keep their names', () => {
  it('owed_by_product is always present as a key', () => {
    expect(Object.keys(build())).toContain('owed_by_product');
    expect(Object.keys(build(EVERY_STAGE))).toContain('owed_by_product');
  });

  it('all six sources, compared as a SET rather than counted', () => {
    expect(new Set(Object.keys(build().sources))).toEqual(new Set([
      'agent', 'capabilities', 'capability_ladder', 'governance', 'candidates', 'owed_by_product',
    ]));
  });

  it('the four pre-existing endpoints are byte-identical', () => {
    const { sources } = build();
    expect(sources.agent).toBe('GET /api/admin/agent-domains-mine');
    expect(sources.capabilities).toBe('GET /api/admin/agent-domains-mine/marketing');
    expect(sources.capability_ladder).toBe('GET /api/admin/agent-domains-mine/marketing/coverage');
    expect(sources.governance).toBe('GET /api/admin/agent-domain-change-requests-mine');
  });

  it('owed_by_product names its endpoint', () => {
    expect(build().sources.owed_by_product).toBe('GET /api/admin/agent-domain-candidates-mine');
  });
});

describe('serialisation stays stable', () => {
  it('round-trips byte-identically through serialiseAgentDomainSnapshot', () => {
    const once = serialiseAgentDomainSnapshot(build(EVERY_STAGE));
    const twice = serialiseAgentDomainSnapshot(build(EVERY_STAGE));
    expect(once).toBe(twice);
    expect(once.endsWith('\n')).toBe(true);
    // And it really is parseable JSON carrying the new section, not a string that merely matches.
    expect(Object.keys(JSON.parse(once))).toContain('owed_by_product');
  });

  it('carries no clock, so a sync does not commit a file whose only change is the time', () => {
    const section = build(EVERY_STAGE).owed_by_product;
    for (const key of Object.keys(section)) {
      expect(key).not.toMatch(/captured_at|generated_at|as_of|timestamp|checked_at/);
    }
    expect(serialiseAgentDomainSnapshot(build(EVERY_STAGE))).not.toMatch(/20\d\d-\d\d-\d\dT\d\d:/);
  });
});
