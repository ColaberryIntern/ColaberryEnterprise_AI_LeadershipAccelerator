jest.mock('../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
import type { JourneySubjectContext } from '../governor/types';
import { B2B_GENERATORS, discoveryFlowKeyFor, generateB2b, type B2bProgramme } from '../strategies/b2bCandidates';
import { BUSINESS_PROGRAMME } from '../strategies/businessCandidates';
import { FLOTATION_PROGRAMME } from '../strategies/aiFlotationCandidates';
import { FLOW_CAMPAIGN_KEYS } from '../execution/campaignKeys';
import { channel, contact } from './fixtures/learnerFixtures';
import { bizCtx, flotCtx } from './fixtures/b2bFixtures';

/**
 * T506 — the one Layer 2 generator, at the generator: `discoveryQuestions` fires
 * only in a qualified state, only for the brand's OWN registered flow, only when
 * that flow is on `ctx.approvedFlows`, and still under `emailBlock`. The tier is
 * pinned by value because a mutation that borrowed the nudge's tier survived the
 * first run. The lifecycle cross-product is `lifecycleToCandidates.test.ts`; the
 * real pipeline over the Phase 4 world is `flowRuns.phase5.test.ts`.
 */

const PROGRAMMES: Array<[string, B2bProgramme, (o?: Partial<JourneySubjectContext>) => JourneySubjectContext, string]> = [
  ['Colaberry Enterprise', BUSINESS_PROGRAMME, bizCtx, FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions],
  ['AI Flotation', FLOTATION_PROGRAMME, flotCtx, FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions],
];
const OTHER_BRANDS_KEY = (own: string) => Object.values(FLOW_CAMPAIGN_KEYS).find((k) => k !== own)!;

describe.each(PROGRAMMES)('%s', (_name, p, ctx, own) => {
  const qualified = p.states.qualified[0];
  const reasonFor = (g: ReturnType<typeof generateB2b>) => g.not_emitted.find((n) => n.generator === 'discoveryQuestions')?.reason;

  it('the programme resolves to its own registered flow key, and the generator is registered last', () => {
    expect(discoveryFlowKeyFor(p)).toBe(own);
    expect(B2B_GENERATORS.at(-1)?.name).toBe('discoveryQuestions');
  });

  it('qualified + the OWN flow approved: ONE SEND_EMAIL through that key at tier 5 / 60, no assets, the deferral gone', () => {
    const g = generateB2b(p, ctx({ state: qualified, approvedFlows: [own] }));
    expect(g.candidates).toHaveLength(1);
    const [c] = g.candidates;
    expect([c.action_type, c.priority_tier, c.intra_tier_score, c.channel, c.campaign_key]).toEqual(['SEND_EMAIL', 5, 60, 'email', own]);
    expect(c.required_assets).toEqual([]);
    expect(c.rationale.join(' ')).toContain(own);
    // The other Layer 2 shapes stay deferrals with their own gaps named; only discovery's deferral is gone.
    expect(g.deferred.map((d) => [d.would, d.payload.gap])).toEqual([
      ['scheduling_offer', 'no_approved_flow:scheduling_offer'],
      ['reply_aware_sequence', 'no_approved_flow:reply_aware_sequence'],
    ]);
    expect(reasonFor(g)).toBeUndefined();
  });

  it('qualified, nothing approved: no candidate, the deferral stays with its gap named, and the reason is the gap', () => {
    for (const approvedFlows of [undefined, [] as string[]]) {
      const g = generateB2b(p, ctx({ state: qualified, approvedFlows }));
      expect(g.candidates).toEqual([]);
      expect(g.deferred.find((d) => d.would === 'discovery_questions')?.payload).toMatchObject({ layer: 2, gap: 'no_approved_flow:discovery_questions' });
      expect(reasonFor(g)).toBe('no_approved_flow:discovery_questions');
    }
  });

  it('the brand boundary at the generator: the OTHER brand\'s approved key unlocks nothing here', () => {
    const g = generateB2b(p, ctx({ state: qualified, approvedFlows: [OTHER_BRANDS_KEY(own)] }));
    expect(g.candidates).toEqual([]);
    expect(reasonFor(g)).toBe('no_approved_flow:discovery_questions');
  });

  it('the approval does not override emailBlock: a human in the thread, a decline, an ineligible address each withhold it', () => {
    const cases: Array<[Partial<JourneySubjectContext>, string]> = [
      [{ contact: { ...contact(), human_conversation: 'yes' } }, 'human_in_conversation'],
      [{ overlays: ['DECLINED'] }, 'declined_overlay'],
      [{ contact: contact({ email: channel(false, 'unsubscribed') }) }, 'email_ineligible:unsubscribed'],
    ];
    for (const [over, reason] of cases) {
      const g = generateB2b(p, ctx({ state: qualified, approvedFlows: [own], ...over }));
      expect(g.candidates.some((c) => c.campaign_key === own)).toBe(false);
      expect(reasonFor(g)).toBe(reason);
    }
  });

  it('outside a qualified state the approval is inert: predicate_false, never the gap', () => {
    for (const state of [...p.states.fresh, ...p.states.exploring, ...p.states.commercial]) {
      const g = generateB2b(p, ctx({ state, approvedFlows: [own] }));
      expect(g.candidates.some((c) => c.campaign_key === own)).toBe(false);
      expect(reasonFor(g)).toBe('predicate_false');
    }
  });
});
