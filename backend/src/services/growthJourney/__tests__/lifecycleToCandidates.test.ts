jest.mock('../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
import { classifyBusinessState, DEFERRED_STATES as BUSINESS_DEFERRED } from '../lifecycle/businessLifecycle';
import { classifyFlotationState, DEFERRED_STATES as FLOTATION_DEFERRED } from '../lifecycle/aiFlotationLifecycle';
import { B2B_GENERATORS, discoveryFlowKeyFor, generateB2b, type B2bProgramme } from '../strategies/b2bCandidates';
import { BUSINESS_PROGRAMME } from '../strategies/businessCandidates';
import { FLOTATION_PROGRAMME } from '../strategies/aiFlotationCandidates';
import type { JourneySubjectContext } from '../governor/types';
import { AS_OF, contact } from './fixtures/learnerFixtures';
import { bizCtx, flotCtx, withClassification } from './fixtures/b2bFixtures';

/**
 * T310 close-out — the T307/T308 -> T310 seam, driven end to end.
 *
 * The verifier of T310's first attempt drove the REAL lifecycle classifiers
 * into the generators and found three of six could never fire: the generators
 * had been tested on hand-typed states and overlays, and the lifecycle does not
 * produce those combinations. `NO_RESPONSE` is on for every pre-commercial
 * non-fresh state by construction (a reply evidences the qualified state), and
 * Enterprise's `PROBLEM_IDENTIFIED` never carries a path (a path evidences
 * `EXPLORING_SOLUTIONS`). A generator gated on either was dead code.
 *
 * So this suite builds contexts the way T311 will: classify with the real
 * machine, put its `state` and `overlays` on the context, generate. Every
 * generator must fire for at least one lifecycle-produced context, and the two
 * facts above are pinned so nobody re-introduces a gate on them by accident.
 */

const ENTERED_LONG_AGO = new Date('2026-07-01T00:00:00Z');

/** Realistic lifecycle inputs, crossed. */
const LEADS = [
  {},
  { idea_input: 'we need to automate invoicing' },
  { idea_input: 'x', selected_systems: ['salesforce'] },
  { maturity_score: 61, estimated_roi: 120000 },
  { pipeline_stage: 'meeting_scheduled' },
  { pipeline_stage: 'proposal_sent' },
];
const CLASSIFICATIONS = [null, { intent: 'automation_request', path: 'workflow_automation' }, { intent: 'build_request', path: 'application_build' }];
const INBOUND = [
  { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
  { replied: 1, booked_meeting: 0, answered: 0, declined: 0 },
  { replied: 0, booked_meeting: 0, answered: 0, declined: 1 },
];
const APPOINTMENTS = [
  { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
  { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 },
  { scheduled: 0, completed: 0, no_show: 1, cancelled: 0 },
];
const PREVIOUS = [
  { state: null, state_entered_at: null },
  { state: null, state_entered_at: ENTERED_LONG_AGO },
];
const RECENT_CONTACT = [0, 1];
const ENROLLMENT = [null, 'enr-1'];

interface Produced {
  state: string;
  overlays: string[];
  ctx: JourneySubjectContext;
}

function produce(
  p: B2bProgramme,
  classify: (input: never) => { state: string; overlays: readonly string[] },
  base: (o?: Partial<JourneySubjectContext>) => JourneySubjectContext,
  extra: Record<string, unknown>,
): Produced[] {
  const out: Produced[] = [];
  for (const lead of LEADS)
    for (const cls of CLASSIFICATIONS)
      for (const inbound of INBOUND)
        for (const appointments of APPOINTMENTS)
          for (const previous of PREVIOUS)
            for (const recent of RECENT_CONTACT)
              for (const enrollment_id of ENROLLMENT) {
                const r = classify({
                  previous,
                  lead,
                  classification: cls ? { intent: cls.intent } : null,
                  inbound,
                  appointments,
                  isCustomer: false,
                  asOf: AS_OF,
                  ...extra,
                } as never);
                const c = contact();
                const ctx = base({
                  state: r.state,
                  overlays: [...r.overlays],
                  classification: cls ? withClassification({ intent: cls.intent, primary_path: cls.path, brand_relationship: p.brand_slug }) : null,
                  enrollment_id,
                  contact: { ...c, recent_contact_count: recent },
                });
                out.push({ state: r.state, overlays: [...r.overlays], ctx });
              }
  return out;
}

const PROGRAMMES: Array<[string, B2bProgramme, () => Produced[]]> = [
  ['Colaberry Enterprise', BUSINESS_PROGRAMME, () => produce(BUSINESS_PROGRAMME, classifyBusinessState as never, bizCtx, {})],
  ['AI Flotation', FLOTATION_PROGRAMME, () => produce(FLOTATION_PROGRAMME, classifyFlotationState as never, flotCtx, { hasDeliveryEngagement: false })],
];

describe.each(PROGRAMMES)('%s: the real lifecycle into the real generators', (_name, p, produceAll) => {
  const all = produceAll();

  it('drives a cross-product large enough to reach every reachable state', () => {
    expect(all.length).toBeGreaterThan(1000);
    const states = new Set(all.map((x) => x.state));
    // The lifecycles DECLARE the states nothing can evidence (T307's
    // SOLUTION_SCOPING, T308's SCOPE_IN_PROGRESS); those are expected absent.
    const declaredUnreachable = new Set([...BUSINESS_DEFERRED, ...FLOTATION_DEFERRED].map((d) => d.state as string));
    const expected = [...p.states.fresh, ...p.states.problemKnown, ...p.states.exploring, ...p.states.qualified, ...p.states.commercial].filter(
      (s) => !declaredUnreachable.has(s),
    );
    const unreached = expected.filter((s) => !states.has(s));
    expect(unreached).toEqual([]);
    expect(expected.length).toBeGreaterThanOrEqual(6); // non-vacuity
  });

  it('the fact that broke the first draft: NO_RESPONSE is on for EVERY pre-qualified non-fresh state', () => {
    const nurtureStates = [...p.states.problemKnown, ...p.states.exploring];
    const inNurture = all.filter((x) => nurtureStates.includes(x.state));
    expect(inNurture.length).toBeGreaterThan(0);
    expect(inNurture.every((x) => x.overlays.includes('NO_RESPONSE'))).toBe(true);
  });

  it('EVERY generator fires for at least one context the lifecycle actually produced', () => {
    const fired = new Map<string, number>(B2B_GENERATORS.map((g) => [g.name, 0]));
    // T506: the discovery generator needs the brand's flow APPROVED, so every context is also driven with it.
    const flow = discoveryFlowKeyFor(p);
    const contexts = all.flatMap((x) => [x.ctx, { ...x.ctx, approvedFlows: flow ? [flow] : [] }]);
    for (const ctx of contexts) {
      const g = generateB2b(p, ctx);
      for (const c of g.candidates) {
        const which = B2B_GENERATORS.find((gen) => {
          const r = gen.run(p, ctx);
          return typeof r !== 'string' && r.action_type === c.action_type && r.priority_tier === c.priority_tier && r.required_assets[0]?.asset_type === c.required_assets[0]?.asset_type;
        });
        if (which) fired.set(which.name, (fired.get(which.name) ?? 0) + 1);
      }
    }
    const silent = [...fired.entries()].filter(([, n]) => n === 0).map(([name]) => name);
    expect({ silent, counts: Object.fromEntries(fired) }).toEqual({ silent: [], counts: Object.fromEntries(fired) });
  });

  it('T506: discovery questions fire in EVERY qualified state once the flow is approved, in NO other state, and never without the approval', () => {
    const flow = discoveryFlowKeyFor(p)!;
    expect(flow).toMatch(/^gj_.*_discovery_questions$/);
    const isDiscovery = (ctx: JourneySubjectContext) => generateB2b(p, ctx).candidates.some((c) => c.campaign_key === flow);
    const qualified = all.filter((x) => p.states.qualified.includes(x.state));
    const others = all.filter((x) => !p.states.qualified.includes(x.state));
    expect(qualified.length).toBeGreaterThan(0);
    // Without the approval: never, anywhere - the deferral stays, with its gap named.
    expect(all.some((x) => isDiscovery(x.ctx))).toBe(false);
    for (const x of qualified) {
      const g = generateB2b(p, x.ctx);
      expect(g.deferred.find((d) => d.would === 'discovery_questions')?.payload).toMatchObject({ gap: 'no_approved_flow:discovery_questions' });
      expect(g.not_emitted.find((n) => n.generator === 'discoveryQuestions')?.reason).toBe('no_approved_flow:discovery_questions');
    }
    // With it: every qualified state whose email is not otherwise blocked, and no other state.
    const approved = (ctx: JourneySubjectContext) => ({ ...ctx, approvedFlows: [flow] });
    const qualifiedFiring = qualified.filter((x) => isDiscovery(approved(x.ctx)));
    expect(new Set(qualifiedFiring.map((x) => x.state))).toEqual(new Set(p.states.qualified));
    for (const x of qualifiedFiring) expect(generateB2b(p, approved(x.ctx)).deferred.some((d) => d.would === 'discovery_questions')).toBe(false);
    expect(others.some((x) => isDiscovery(approved(x.ctx)))).toBe(false);
  });

  it('education fires under NO_RESPONSE — a lead who never replied is who nurture is for', () => {
    const hits = all.filter((x) => x.overlays.includes('NO_RESPONSE') && generateB2b(p, x.ctx).candidates.some((c) => c.required_assets[0]?.asset_type === 'capability_education'));
    expect(hits.length).toBeGreaterThan(0);
  });

  it('education and the case study are exclusive by EVIDENCE in an exploring state, never both', () => {
    for (const x of all.filter((y) => p.states.exploring.includes(y.state))) {
      const purposes = generateB2b(p, x.ctx).candidates.map((c) => c.required_assets[0]?.asset_type).filter(Boolean);
      const both = purposes.includes('capability_education') && purposes.includes('case_study');
      expect(both).toBe(false);
      if (purposes.includes('case_study')) expect(x.ctx.contact.recent_contact_count).toBeGreaterThan(0);
      if (purposes.includes('capability_education')) expect(x.ctx.contact.recent_contact_count).toBe(0);
    }
  });

  it('a qualified state names Layer-2 shapes and never a handoff; discovery onward names the handoff', () => {
    for (const x of all) {
      const d = generateB2b(p, x.ctx).deferred.map((y) => y.would);
      if (p.states.qualified.includes(x.state)) {
        expect(d).toEqual(expect.arrayContaining(['discovery_questions', 'scheduling_offer']));
        expect(d).not.toContain('create_handoff');
      }
      if (p.states.commercial.includes(x.state)) expect(d).toContain('create_handoff');
    }
  });
});

describe('Enterprise\'s PROBLEM_IDENTIFIED never carries a path — pinned, because education was gated on one', () => {
  it('a classification with a path is EXPLORING_SOLUTIONS, so problem-known-with-path is not a real context', () => {
    const r = classifyBusinessState({
      previous: { state: null, state_entered_at: null },
      lead: { idea_input: 'x' },
      classification: { primary_path: 'workflow_automation' },
      inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
      appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
      isCustomer: false,
      asOf: AS_OF,
    } as never);
    expect(r.state).toBe('EXPLORING_SOLUTIONS');
  });

  it('and at PROBLEM_IDENTIFIED the honest candidate is the path-finding clarification', () => {
    const g = generateB2b(BUSINESS_PROGRAMME, bizCtx({ state: 'PROBLEM_IDENTIFIED', overlays: ['NO_RESPONSE'], classification: withClassification({ primary_path: null }) }));
    expect(g.candidates.map((c) => [c.action_type, c.priority_tier, c.required_assets[0]?.asset_type])).toEqual([['SEND_EMAIL', 8, 'clarification_question']]);
    expect(g.candidates[0].rationale[0]).toContain('the problem is known but no path is');
  });
});
