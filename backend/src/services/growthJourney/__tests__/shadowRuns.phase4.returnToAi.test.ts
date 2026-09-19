jest.mock('../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
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

import { Op } from 'sequelize';
import { decideForSubjectAndRecord } from '../decisionService';
import { RETURNED_TO_AI_OVERLAY, RETURNED_TO_AI_REASON } from '../handoffs/returnToAi';
import { AS_OF, anchorOf, arrange, flags, m, persisted } from './fixtures/phase3Harness';
import { brandRow, type ShadowFixture } from './fixtures/phase3Fixtures';
import { allFixtures } from './fixtures/phase3Scenarios';

/**
 * T405 at decision level — the real pipeline over Phase 3's fixtures with one
 * new input: the subject's newest `returned_to_ai` handoff row, as the loader
 * reads it. While its `cooldown_until` is ahead of the clock the decision
 * carries `RETURNED_TO_AI`, every generator declines by that name, and no
 * handoff is deferred; a clock past `cooldown_until` sees none of it. The row
 * in `growth_journey_decisions` is what is asserted.
 */

const DAY = 86_400_000;
const fixtures = allFixtures();
const fx = (key: string): ShadowFixture => {
  const f = fixtures.find((x) => x.key === key);
  if (!f) throw new Error(`no fixture ${key}`);
  return f;
};

type Row = {
  selected_action: string | null; reason: string; candidates: { action_type: string }[]; overlays_at_decision: string[];
  deferred_actions: { would: string; reason: string }[]; eligibility: { not_emitted: { generator: string; reason: string }[]; inputs_unavailable: string[] };
};

const returned = (cooldownUntil: Date) => ({ id: 'h-returned', return_to_ai: { program_slug: 'business-growth', cooldown_until: cooldownUntil.toISOString(), reason: 'not_ready:q1 budget' } });

async function runWith(f: ShadowFixture, handoffRow: unknown, asOf: Date = AS_OF): Promise<Row> {
  arrange(f);
  m.handoffFindOne.mockResolvedValue(handoffRow);
  const r = await decideForSubjectAndRecord({ anchor: anchorOf(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags(), asOf });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  expect(persisted.size).toBe(1);
  return [...persisted.values()][0] as unknown as Row;
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe('a business subject a human sent back', () => {
  const KEY = 'colaberry-enterprise/EXPLORING_SOLUTIONS';

  it('the decision carries RETURNED_TO_AI, proposes nothing, and every generator that would have run declines returned_to_ai_cooldown', async () => {
    const row = await runWith(fx(KEY), returned(new Date(AS_OF.getTime() + 10 * DAY)));
    expect(row.overlays_at_decision).toContain(RETURNED_TO_AI_OVERLAY);
    expect(row.candidates).toEqual([]);
    expect(row.selected_action).toBe('WAIT');
    expect(row.reason).toBe(`no_candidate:${RETURNED_TO_AI_REASON}`);
    const ne = row.eligibility.not_emitted;
    // The two generators that would have proposed for this subject (the control below shows the email; the
    // fixture has a portal account, so the nudge) decline by the cooldown's name; the rest declined on their own predicates.
    expect(ne.filter((n) => n.reason === RETURNED_TO_AI_REASON).map((n) => n.generator)).toEqual(['capabilityEducation', 'inAppNudge']);
    expect(ne).toHaveLength(6);
    // T502: any row carrying the record (a qualified one is `dispositioned`), found by the subject ref or the lead.
    const [{ where, order }] = m.handoffFindOne.mock.calls[0] as [{ where: Record<string | symbol, unknown>; order: unknown }];
    expect(order).toEqual([['updated_at', 'DESC']]);
    expect(where).toMatchObject({ brand_id: brandRow('colaberry-enterprise').id });
    expect(where).not.toHaveProperty('status');
    expect((where.return_to_ai as Record<symbol, unknown>)[Op.ne]).toBeNull();
    expect(where[Op.or]).toEqual([{ subject_ref: expect.stringMatching(/^lead:\d+$/) }, { lead_id: expect.any(Number) }]);
  });

  it('the control: the same subject with no returned row gets its education email back and no overlay', async () => {
    const row = await runWith(fx(KEY), null);
    expect(row.overlays_at_decision).not.toContain(RETURNED_TO_AI_OVERLAY);
    expect(row.candidates.map((c) => c.action_type)).toEqual(['SEND_EMAIL']);
    expect(row.eligibility.not_emitted.some((n) => n.reason === RETURNED_TO_AI_REASON)).toBe(false);
  });

  it('after cooldown_until the overlay is gone: the same returned row, a clock past the date, the email is back', async () => {
    const until = new Date(AS_OF.getTime() + 10 * DAY);
    const row = await runWith(fx(KEY), returned(until), new Date(until.getTime() + DAY));
    expect(row.overlays_at_decision).not.toContain(RETURNED_TO_AI_OVERLAY);
    expect(row.candidates.map((c) => c.action_type)).toEqual(['SEND_EMAIL']);
  });

  it('a commercial-state subject on cooldown is NOT handed back to a human: the create_handoff deferral waits with everything else', async () => {
    const f = fx('colaberry-enterprise/DISCOVERY_READY');
    const free = await runWith(f, null);
    expect(free.deferred_actions.some((d) => d.would === 'create_handoff')).toBe(true); // non-vacuity
    const held = await runWith(f, returned(new Date(AS_OF.getTime() + 10 * DAY)));
    expect(held.deferred_actions.some((d) => d.would === 'create_handoff')).toBe(false);
    expect(held.reason).toBe(`no_candidate:${RETURNED_TO_AI_REASON}`);
  });

  it('a failed handoff lookup is named in inputs_unavailable and the decision proceeds without the overlay (the Why shows the gap)', async () => {
    arrange(fx(KEY));
    m.handoffFindOne.mockRejectedValue(new Error('connection reset'));
    const r = await decideForSubjectAndRecord({ anchor: anchorOf(fx(KEY)), brandId: brandRow('colaberry-enterprise').id, trigger: 'nightly', flags: flags(), asOf: AS_OF });
    if (r.status !== 'recorded') throw new Error(r.status);
    const row = [...persisted.values()][0] as unknown as Row;
    expect(row.eligibility.inputs_unavailable).toContain('return_to_ai');
    expect(row.overlays_at_decision).not.toContain(RETURNED_TO_AI_OVERLAY);
  });
});

describe('a learner a human sent back', () => {
  it('Training, engaged: EVERY Explorer candidate is withheld by the cooldown\'s name, and nothing is deferred', async () => {
    const f = fx('colaberry-training/ENGAGED_LEARNER');
    const free = await runWith(f, null);
    expect(free.candidates.length).toBeGreaterThan(0); // non-vacuity
    const held = await runWith(f, returned(new Date(AS_OF.getTime() + 10 * DAY)));
    expect(held.candidates).toEqual([]);
    expect(held.overlays_at_decision).toContain(RETURNED_TO_AI_OVERLAY);
    expect(held.reason).toBe(`no_candidate:${RETURNED_TO_AI_REASON}`);
    expect(held.eligibility.not_emitted.filter((n) => n.reason === RETURNED_TO_AI_REASON)).toHaveLength(free.candidates.length);
    expect(held.deferred_actions).toEqual([]);
  });

  it('CPN, classification only: the grounded nurture is withheld and the refusal says which fact silenced it', async () => {
    const row = await runWith(fx('cpn/NO_LEARNER_PROFILE'), returned(new Date(AS_OF.getTime() + 10 * DAY)));
    expect(row.candidates).toEqual([]);
    expect(row.reason).toBe(`no_candidate:no_learner_profile:${RETURNED_TO_AI_REASON}`);
    expect(row.eligibility.not_emitted.find((n) => n.generator === 'classificationNurture')?.reason).toBe(RETURNED_TO_AI_REASON);
  });
});
