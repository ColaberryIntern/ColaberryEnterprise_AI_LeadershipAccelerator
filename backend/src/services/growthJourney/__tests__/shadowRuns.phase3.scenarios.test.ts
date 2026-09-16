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

import { sequelize } from '../../../config/database';
import { decideForSubjectAndRecord, productionDeps } from '../decisionService';
import { loadDecisionContext } from '../decision/loadDecisionContext';
import { decideForSubject } from '../governor/decideForSubject';
import type { JourneyCandidate, JourneyDecision } from '../governor/types';
import { AS_OF, anchorOf, arrange, flags, m } from './fixtures/phase3Harness';
import { allowedFor, brandRow, type ShadowFixture } from './fixtures/phase3Fixtures';
import { allFixtures } from './fixtures/phase3Scenarios';

/**
 * T313 — §16 A-L in their Phase 3 form, at decision level, on the harness of
 * `shadowRuns.phase3.test.ts` (which drives every fixture and asserts the exit
 * criterion over the run). Each scenario below re-runs its fixture and asserts
 * what the letter is about. K's queued-action half and L's routing half are
 * Phase 5 and Phase 4, and are stated as such where they come up.
 */

const fixtures = allFixtures();
const fx = (key: string): ShadowFixture => {
  const f = fixtures.find((x) => x.key === key);
  if (!f) throw new Error(`no fixture ${key}`);
  return f;
};

type Recorded = Extract<Awaited<ReturnType<typeof decideForSubjectAndRecord>>, { status: 'recorded' }>;
async function run(f: ShadowFixture, over: Partial<Parameters<typeof decideForSubjectAndRecord>[0]> = {}): Promise<Recorded> {
  const r = await decideForSubjectAndRecord({ anchor: anchorOf(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: flags(), asOf: AS_OF, ...over });
  if (r.status !== 'recorded') throw new Error(`${f.key}: ${r.status}`);
  return r;
}
const familiesOf = (d: JourneyDecision): string[] =>
  d.candidates.flatMap((c) => c.required_assets.map((q) => (q as { offer_family?: string }).offer_family).filter((x): x is string => typeof x === 'string'));
const winnerOf = (d: JourneyDecision): JourneyCandidate | undefined =>
  d.candidates.find((c) => !d.suppressed.some((s) => s.action_type === c.action_type && s.campaign_key === c.campaign_key && !/^content_gap:/.test(s.reason)));

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe('A and B — the learner brands', () => {
  it('A: a CPN learner is decided under CPN\'s programme by Explorer\'s own generators, and no candidate speaks for a service family', async () => {
    const f = fx('cpn/ACTIVATING');
    arrange(f);
    const r = await run(f);
    expect(r.row.brand_id).toBe(brandRow('cpn').id);
    expect(r.row.program_id).toBe('p-cpn');
    expect(r.decision.candidates.length).toBeGreaterThanOrEqual(1);
    for (const fam of familiesOf(r.decision)) expect(fam.startsWith('learner_')).toBe(true);
    // Explorer's generators ran (basis explorer_profile): nothing is recorded as withheld for want of a profile.
    const notEmitted = (r.row.eligibility as { not_emitted: Array<{ reason: string }> }).not_emitted;
    expect(notEmitted.every((n) => n.reason === 'predicate_false')).toBe(true);
    // A CPN learner with no profile is grounded on the classification alone, and the eight generators say why they did not run.
    const np = fx('cpn/NO_LEARNER_PROFILE');
    arrange(np);
    const r2 = await run(np);
    expect(r2.decision.candidates).toHaveLength(1);
    expect((r2.row.eligibility as { not_emitted: Array<{ reason: string }> }).not_emitted.filter((n) => n.reason === 'no_learner_profile')).toHaveLength(8);
  });

  it('B: a Training learner advances toward enrolment only with evidence — HIGH_INTENT proposes the enrolment offer, ACTIVATING never does', async () => {
    const ready = fx('colaberry-training/ENROLLMENT_READY');
    arrange(ready);
    const r = await run(ready);
    expect(winnerOf(r.decision)?.required_assets.map((q) => q.asset_type)).toContain('enrollment_offer');
    const activating = fx('colaberry-training/ACTIVATING');
    arrange(activating);
    const a = await run(activating);
    expect(a.decision.candidates.flatMap((c) => c.required_assets.map((q) => q.asset_type))).not.toContain('enrollment_offer');
    expect(a.decision.candidates.length).toBeGreaterThanOrEqual(1);
  });
});

describe('C, D, E — the service brands choose the classified family, never a neighbour', () => {
  it.each([
    ['colaberry-enterprise/C-business-training', 'business_training'],
    ['colaberry-enterprise/EXPLORING_SOLUTIONS', 'workflow_automation'],
    ['ai-flotation/SOLUTION_VISUALIZED', 'application_build'],
  ])('%s → the winner speaks for %s and the brand may offer it', async (key, family) => {
    const f = fx(key);
    arrange(f);
    const r = await run(f);
    const w = winnerOf(r.decision);
    expect(w?.required_assets.map((q) => (q as { offer_family?: string }).offer_family)).toEqual([family]);
    expect(allowedFor(f.brand)).toContain(family);
    // Refused for content, by name - not answered with a different family's content.
    expect(r.decision.selected_action).toBe('WAIT');
    expect(r.decision.content_gaps).toEqual(['content_not_approved']);
    expect(r.decision.selected_content).toBeNull();
  });
});

describe('F — business training never reaches an AI Flotation subject, at three layers', () => {
  it('a Phase 2 refusal (no path, review flagged): no candidate, the review overlay named', async () => {
    const f = fx('ai-flotation/F-training-refused');
    arrange(f);
    const r = await run(f);
    expect(r.decision.candidates).toEqual([]);
    expect(r.decision.reason).toBe('no_candidate:human_review_overlay');
    expect(r.decision.deferred_actions).toEqual(expect.arrayContaining([expect.objectContaining({ would: 'create_handoff', reason: 'human_review_overlay' })]));
  });

  it('a leaked path: the programme\'s family gate refuses at generation, and nothing is proposed', async () => {
    const f = fx('ai-flotation/F-training-path-leaked');
    arrange(f);
    const r = await run(f);
    expect(r.decision.candidates).toEqual([]);
    expect(r.decision.reason).toBe('no_candidate:flotation_excludes:business_training');
    expect(r.decision.selected_path).toBeNull();
  });

  it('the pipeline\'s own boundary: a candidate carrying a family the brand\'s policy lacks is suppressed by name, and a human is asked', async () => {
    const f = fx('cpn/F-learner-family-not-cpn');
    arrange(f);
    const r = await run(f);
    expect(r.decision.candidates).toHaveLength(1);
    expect(r.decision.suppressed).toEqual([expect.objectContaining({ action_type: 'SEND_EMAIL', reason: 'offer_not_eligible:no_policy' })]);
    expect(r.decision.reason).toBe('every_candidate_ineligible');
    expect(r.row.requires_human_review).toBe(true);
    expect(allowedFor('cpn')).not.toContain('learner_certification');
  });
});

describe('G, H, I, J', () => {
  it('G: a reply makes the opportunity qualified; layer 2 is recorded as a deferral, never applied', async () => {
    const f = fx('colaberry-enterprise/G-reply-to-campaign');
    arrange(f);
    const r = await run(f);
    expect(r.row.state_at_decision).toBe('QUALIFIED_OPPORTUNITY');
    expect(r.decision.deferred_actions.map((d) => d.would).sort()).toEqual(['discovery_questions', 'scheduling_offer']);
    expect(r.row.executed).toBe(false);
  });

  it('H: one person, two relationships - two rows under two brands, each with only its own kind of content', async () => {
    const [ent, trn] = [fx('colaberry-enterprise/H-same-person'), fx('colaberry-training/H-same-person')];
    arrange(ent);
    const e = await run(ent);
    arrange(trn);
    const t = await run(trn);
    expect(e.row.subject_ref).toBe(t.row.subject_ref);
    expect(e.row.brand_id).not.toBe(t.row.brand_id);
    expect(e.row.tenant_id).toBe(t.row.tenant_id); // both Colaberry brands
    expect(familiesOf(e.decision)).toEqual(['workflow_automation']);
    expect(familiesOf(t.decision)).toEqual(['learner_paid_training']);
  });

  it('I: competing actions - one winner at arbitration, every loser suppressed with the tier that beat it', async () => {
    const f = fx('colaberry-training/CONNECTED_TO_COMMUNITY');
    arrange(f);
    const r = await run(f);
    const d = r.decision;
    expect(d.candidates.length).toBeGreaterThanOrEqual(3);
    const losers = d.suppressed.filter((s) => !/^content_gap:/.test(s.reason));
    expect(losers).toHaveLength(d.candidates.length - 1);
    for (const l of losers) expect(l.reason).toMatch(/^(lower priority than tier \d+|outranked within tier \d+)/);
    expect(winnerOf(d)).toBeDefined();
    // And where the winner needs no content, it stands: the DECLINED subject's suppression is a real decision.
    const declined = fx('colaberry-enterprise/I-declined-competing');
    arrange(declined);
    const w = await run(declined);
    expect(w.decision.selected_action).toBe('SUPPRESS_CONTACT');
    expect(w.decision.suppressed).toEqual([]);
    expect(w.row.overlays_at_decision).toEqual(expect.arrayContaining(['DECLINED', 'STALLED']));
  });

  it('J: an untrusted signal is evidence of a stated problem and nothing more, and its text never reaches the record', async () => {
    const f = fx('colaberry-enterprise/J-untrusted-signal');
    arrange(f);
    const r = await run(f);
    expect(r.row.state_at_decision).toBe('PROBLEM_IDENTIFIED');
    expect(r.decision.selected_path).toBeNull();
    const text = JSON.stringify(r.row);
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('DROP TABLE');
    expect(text).not.toContain('@');
  });
});

describe('K — the kill switch: the decision half', () => {
  it('a subject pause (opt-out, DND, revoked consent) is a hard stop before anything is generated, with the reason on the row', async () => {
    for (const [key, reason] of [['colaberry-enterprise/K-subject-opted-out', 'hard_stop:unsubscribed'], ['ai-flotation/K-subject-dnd', 'hard_stop:dnc'], ['colaberry-enterprise/K-consent-revoked', 'hard_stop:consent_revoked']]) {
      const f = fx(key);
      arrange(f);
      const r = await run(f);
      expect({ key, action: r.decision.selected_action, reason: r.decision.reason, candidates: r.decision.candidates.length }).toEqual({ key, action: 'WAIT', reason, candidates: 0 });
      expect(m.decisionCreate).toHaveBeenCalledTimes(1);
    }
  });

  it('a global pause (the capability or the master off) decides nothing and writes nothing', async () => {
    const f = fx('colaberry-enterprise/EXPLORING_SOLUTIONS');
    arrange(f);
    expect(await decideForSubjectAndRecord({ anchor: anchorOf(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: { ...flags(), journeyDecisions: false }, asOf: AS_OF })).toEqual({ status: 'disabled' });
    expect(await decideForSubjectAndRecord({ anchor: anchorOf(f), brandId: brandRow(f.brand).id, trigger: 'nightly', flags: { ...flags(), growthJourneyEnabled: false }, asOf: AS_OF })).toEqual({ status: 'disabled' });
    expect(m.decisionCreate).not.toHaveBeenCalled();
    expect(m.brandFindByPk).not.toHaveBeenCalled();
  });

  it('a brand or programme pause reaches the pipeline as the builder\'s two stops, and each is a named refusal', async () => {
    const f = fx('colaberry-enterprise/EXPLORING_SOLUTIONS');
    arrange(f);
    const loaded = await loadDecisionContext({ anchor: anchorOf(f), brandId: brandRow(f.brand).id, asOf: AS_OF });
    if (loaded.status !== 'loaded') throw new Error(loaded.status);
    for (const [flag, reason] of [['killSwitch', 'hard_stop:kill_switch'], ['campaignInactive', 'hard_stop:campaign_inactive']] as const) {
      const ctx = { ...loaded.ctx, hardStop: { ...loaded.ctx.hardStop, [flag]: true } };
      const out = await decideForSubject(ctx, loaded.strategy, productionDeps(), flags());
      if (out.status !== 'decided') throw new Error(out.status);
      expect({ flag, action: out.decision.selected_action, reason: out.decision.reason }).toEqual({ flag, action: 'WAIT', reason });
    }
  });

  it('in shadow mode the loader sets neither stop: a paused programme is RECORDED on the row and not enforced - the executor gate is Phase 5', async () => {
    const f = fx('colaberry-enterprise/EXPLORING_SOLUTIONS');
    arrange(f);
    m.programFindOne.mockResolvedValue({ id: 'p-colaberry-enterprise', slug: 'business-growth', kind: 'business', status: 'paused', brand_id: brandRow(f.brand).id });
    const r = await run(f);
    expect(r.row.eligibility).toMatchObject({ program_status: 'paused', program_active: false });
    expect(r.decision.reason).not.toMatch(/^hard_stop:/);
    // The queued-action half of K (pausing what is already queued) has no queue to act on until Phase 5.
  });

  it('a channel pause: every generator declines for the channel, the first decline is the refusal\'s reason', async () => {
    const f = fx('colaberry-enterprise/K-channel-paused');
    arrange(f);
    const r = await run(f);
    expect(r.decision.reason).toBe('no_candidate:email_ineligible:brand_channel_paused');
    const notEmitted = (r.row.eligibility as { not_emitted: Array<{ generator: string; reason: string }> }).not_emitted;
    expect(notEmitted.some((n) => n.reason === 'email_ineligible:brand_channel_paused')).toBe(true);
  });
});

describe('L — sales capacity: the ranking half', () => {
  it('more candidates than capacity: one explainable winner, every loser\'s reason recorded, and the human task suppressed for the unknowns rather than routed', async () => {
    const f = fx('colaberry-training/L-in-conversation');
    arrange(f);
    const r = await run(f);
    const d = r.decision;
    expect(d.candidates.length).toBeGreaterThanOrEqual(2);
    expect(d.candidates.some((c) => c.action_type === 'CREATE_HUMAN_TASK')).toBe(true);
    expect(d.suppressed).toEqual(expect.arrayContaining([expect.objectContaining({ action_type: 'CREATE_HUMAN_TASK', reason: 'human_conversation_unknown,sales_capacity_unknown' })]));
    expect(winnerOf(d)?.action_type).not.toBe('CREATE_HUMAN_TASK');
    expect(r.row.sales_capacity).toBe('unknown');
    expect(r.row.human_conversation).toBe('unknown');
    expect(String((r.row.contact_evidence as { sales_capacity_reason: string }).sales_capacity_reason)).toMatch(/no source/);
  });

  it('the handoff for a commercial state is a deferral with its owner - recorded, never routed (routing is Phase 4)', async () => {
    const f = fx('ai-flotation/DISCOVERY_READY');
    arrange(f);
    const r = await run(f);
    expect(r.decision.deferred_actions).toEqual([expect.objectContaining({ would: 'create_handoff', payload: expect.objectContaining({ layer: 4, owner: 'solution_architect' }) })]);
    expect(r.row.executed).toBe(false);
  });
});

describe('the second content gate, reached only when a policy is content-ready', () => {
  // ACTIVE_LEARNER's winner asks for `lesson_recommendation`, one of Explorer's
  // four SUPPORTED purposes, so with a content-ready policy the run reaches the
  // registry SQL and then the per-asset gate. (ENROLLMENT_READY's `enrollment_offer`
  // is a declared gap and never gets that far - which the seeded-state suite shows.)
  const own = () => brandRow('colaberry-training').id;
  const approvedOwn = () => ({ id: 'asset-own', brand_id: own(), offer_family: null, approval_status: 'approved', eligible_programs: null, eligible_paths: null });
  const foreign = () => ({ id: 'asset-foreign', brand_id: brandRow('colaberry-enterprise').id, offer_family: null, approval_status: 'approved', eligible_programs: null, eligible_paths: null });

  it('a registry that returns another brand\'s asset is refused per asset by name, the whole citation fails closed, and nothing foreign reaches the row', async () => {
    const f = fx('colaberry-training/ACTIVE_LEARNER');
    arrange(f, { contentReady: new Set(['colaberry-training']) });
    // Two rows back from the SQL, one foreign to the brand - as if the SQL brand predicate had failed.
    const sql = jest.spyOn(sequelize, 'query').mockResolvedValue([{ id: 'asset-foreign', kind: 'LESSON' }, { id: 'asset-own', kind: 'LESSON' }] as never);
    m.contentAssetFindAll.mockResolvedValue([foreign(), approvedOwn()]);
    const r = await run(f);
    expect(sql).toHaveBeenCalledTimes(1);
    expect((sql.mock.calls[0][1] as { replacements: { brand_id: string } }).replacements.brand_id).toBe(own());
    expect(r.decision.selected_action).toBe('WAIT');
    expect(r.decision.content_gaps).toEqual(['asset_other_brand']);
    expect(r.decision.selected_content).toBeNull();
    expect(JSON.stringify(r.row)).not.toContain('asset-foreign');
    sql.mockRestore();
  });

  it('and with only the brand\'s own approved asset, the winner stands with the asset cited: the content path is real, not only its refusals', async () => {
    const f = fx('colaberry-training/ACTIVE_LEARNER');
    arrange(f, { contentReady: new Set(['colaberry-training']) });
    const sql = jest.spyOn(sequelize, 'query').mockResolvedValue([{ id: 'asset-own', kind: 'LESSON' }] as never);
    m.contentAssetFindAll.mockResolvedValue([approvedOwn()]);
    const r = await run(f);
    expect(r.decision.selected_action).toBe('RECOMMEND_LESSON');
    expect(r.decision.content_gaps).toEqual([]);
    expect((r.decision.selected_content as { assets: Array<{ id: string }> }).assets.map((a) => a.id)).toEqual(['asset-own']);
    expect(r.decision.suppressed).toHaveLength(r.decision.candidates.length - 1);
    expect(r.row.executed).toBe(false);
    sql.mockRestore();
  });
});

describe('the two facts carried from T311, pinned', () => {
  it('the REAL resolver, given a lead anchor, never consults an enrolment: isCustomer is false for every lead: ref', async () => {
    const f = fx('colaberry-enterprise/CUSTOMER');
    arrange(f);
    m.leadFindByPk.mockResolvedValue({ id: f.lead!.id, email: f.lead!.email });
    const actual = jest.requireActual('../subjectResolver') as { resolveSubject: (a: { leadId: number }) => Promise<{ status: string; subject?: { enrollment_id: string | null } }> };
    const r = await actual.resolveSubject({ leadId: f.lead!.id });
    expect(r.status).toBe('resolved');
    expect(r.subject?.enrollment_id).toBeNull();
    expect(m.enrollmentFindByPk).not.toHaveBeenCalled();
    // So the CUSTOMER fixture reaches its state by the pipeline_stage signal alone.
    expect(f.lead!.pipeline_stage).toBe('enrolled');
  });

  it('asked.evaluating_90_days is not wired: the urgency dimension is a named gap on every service-brand decision', async () => {
    for (const key of ['colaberry-enterprise/EXPLORING_SOLUTIONS', 'ai-flotation/SOLUTION_VISUALIZED']) {
      const f = fx(key);
      arrange(f);
      const r = await run(f);
      expect(r.row.score_gaps.some((g) => g.endsWith(':default_not_distinguishable_from_unasked'))).toBe(true);
    }
  });
});
