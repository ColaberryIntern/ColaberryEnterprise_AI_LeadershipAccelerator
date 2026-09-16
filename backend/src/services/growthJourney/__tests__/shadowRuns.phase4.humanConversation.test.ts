jest.mock('../../../models', () => require('./fixtures/phase3Harness').modelsMock);
jest.mock('../../../models/BrandOfferPolicy', () => require('./fixtures/phase3Harness').policyModelMock);
jest.mock('../../../models/Brand', () => ({ __esModule: true, default: { findAll: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../subjectResolver', () => ({ resolveSubject: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveSubject(...a) }));
jest.mock('../governor/contactEvidence', () => ({
  ...jest.requireActual('../governor/contactEvidence'),
  resolveContactEvidence: (...a: unknown[]) => require('./fixtures/phase3Harness').m.resolveContactEvidence(...a),
}));
jest.mock('../decision/lifecycleInputs', () => ({ loadLifecycleSourceCounts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLifecycleSourceCounts(...a) }));
jest.mock('../strategies/learnerFacts', () => ({ loadLearnerFacts: (...a: unknown[]) => require('./fixtures/phase3Harness').m.loadLearnerFacts(...a) }));
jest.mock('../profileService', () => ({ upsertProfile: (...a: unknown[]) => require('./fixtures/phase3Harness').m.upsertProfile(...a) }));
jest.mock('../classificationService', () => ({
  ...jest.requireActual('../classificationService'),
  latestClassification: (...a: unknown[]) => require('./fixtures/phase3Harness').m.classificationFindOne(...a),
}));

import { decideForSubjectAndRecord } from '../decisionService';
import type { HumanConversation } from '../governor/types';
import { AS_OF, anchorOf, arrange, flags, m, persisted } from './fixtures/phase3Harness';
import { brandRow, contactFor, type ShadowFixture } from './fixtures/phase3Fixtures';
import { allFixtures } from './fixtures/phase3Scenarios';

/**
 * T402 at decision level — the real pipeline (loader, strategies, arbiter,
 * contact policy, content gate, writer) over Phase 3's fixtures, with the one
 * boundary this task changed set three ways: a human owns the thread ('yes'),
 * nobody does ('no'), the lookup failed ('unknown'). The row that lands in
 * `growth_journey_decisions` is what is asserted, because that is what a
 * reviewer of the Why reads.
 */

const fixtures = allFixtures();
const fx = (key: string): ShadowFixture => {
  const f = fixtures.find((x) => x.key === key);
  if (!f) throw new Error(`no fixture ${key}`);
  return f;
};

type Row = { human_conversation: HumanConversation; human_conversation_reason?: string; selected_action: string | null; reason: string; candidates: unknown[]; suppressed: { action_type: string; reason: string }[]; eligibility: { not_emitted: { generator: string; reason: string }[] } };

async function runWith(f: ShadowFixture, value: HumanConversation, reason: string): Promise<Row> {
  arrange(f);
  m.resolveContactEvidence.mockResolvedValue({ ...contactFor(f.contact), human_conversation: value, human_conversation_reason: reason });
  const r = await decideForSubjectAndRecord({ anchor: anchorOf(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags(), asOf: AS_OF });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  expect(persisted.size).toBe(1);
  return [...persisted.values()][0] as unknown as Row;
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe('a business subject whose thread a human owns', () => {
  const KEY = 'colaberry-enterprise/EXPLORING_SOLUTIONS';

  it("the row records human_conversation 'yes' with the source-bearing reason, every commercial candidate is not_emitted: human_in_conversation, and the refusal names it", async () => {
    const row = await runWith(fx(KEY), 'yes', 'open_human_conversation:handoff_accepted');
    expect(row.human_conversation).toBe('yes');
    expect(row.candidates).toEqual([]);
    expect(row.selected_action).toBe('WAIT');
    expect(row.reason).toBe('no_candidate:human_in_conversation');
    const ne = row.eligibility.not_emitted;
    expect(ne.filter((n) => n.reason === 'human_in_conversation').map((n) => n.generator)).toEqual(['capabilityEducation']);
    // Nothing else was silenced by the pause: the other generators declined for their own reasons.
    expect(ne.length).toBeGreaterThan(1);
  });

  it("the control: with nobody in the thread the same subject gets its education email back, and the row says 'no'", async () => {
    const row = await runWith(fx(KEY), 'no', 'no open human conversation');
    expect(row.human_conversation).toBe('no');
    expect(row.candidates.length).toBe(1);
    expect((row.candidates[0] as { action_type: string }).action_type).toBe('SEND_EMAIL');
    expect(row.eligibility.not_emitted.some((n) => n.reason === 'human_in_conversation')).toBe(false);
    // Phase 3's seeded fact still holds: the winner has no approved content, so it waits on the gap.
    expect(row.reason).toMatch(/^content_gap:/);
  });

  it("'no' unlocks nothing by itself: a commercial state's human task stays deferred, never emitted", async () => {
    const row = await runWith(fx('colaberry-enterprise/DISCOVERY_READY'), 'no', 'no open human conversation');
    expect(row.human_conversation).toBe('no');
    expect(row.candidates.map((c) => (c as { action_type: string }).action_type)).not.toContain('CREATE_HUMAN_TASK');
    expect(row.reason).toMatch(/^no_candidate:commercial_state_needs_layer_4:/);
  });

  it("the lookup failing is recorded as 'unknown' with its class, and pauses nothing", async () => {
    const row = await runWith(fx(KEY), 'unknown', 'lookup_failed:UpstreamUnavailable');
    expect(row.human_conversation).toBe('unknown');
    expect(row.candidates.length).toBe(1);
    expect(row.eligibility.not_emitted.some((n) => n.reason === 'human_in_conversation')).toBe(false);
  });
});

describe('a learner whose thread a human owns', () => {
  it('Training, engaged: the email and lesson candidates are withheld by name; the rest of Explorer\'s set stands', async () => {
    const f = fx('colaberry-training/ENGAGED_LEARNER');
    const free = await runWith(f, 'no', 'no open human conversation');
    const paused = await runWith(f, 'yes', 'open_human_conversation:human_activity');
    const actions = (row: Row) => row.candidates.map((c) => (c as { action_type: string }).action_type);
    expect(actions(free).some((a) => a === 'SEND_EMAIL' || a === 'RECOMMEND_LESSON')).toBe(true); // non-vacuity
    expect(actions(paused).filter((a) => a === 'SEND_EMAIL' || a === 'RECOMMEND_LESSON')).toEqual([]);
    expect(actions(paused)).toEqual(actions(free).filter((a) => a !== 'SEND_EMAIL' && a !== 'RECOMMEND_LESSON'));
    expect(paused.eligibility.not_emitted.filter((n) => n.reason === 'human_in_conversation')).toHaveLength(
      actions(free).filter((a) => a === 'SEND_EMAIL' || a === 'RECOMMEND_LESSON').length,
    );
    expect(paused.human_conversation).toBe('yes');
  });

  it('CPN, classification only: the grounded nurture is withheld and the refusal says which fact silenced it', async () => {
    const row = await runWith(fx('cpn/NO_LEARNER_PROFILE'), 'yes', 'open_human_conversation:ali_personal_outreach');
    expect(row.candidates).toEqual([]);
    expect(row.reason).toBe('no_candidate:no_learner_profile:human_in_conversation');
    expect(row.eligibility.not_emitted.find((n) => n.generator === 'classificationNurture')?.reason).toBe('human_in_conversation');
  });
});
