import { BUSINESS_STATES } from '../lifecycle/businessLifecycle';
import { FLOTATION_STATES } from '../lifecycle/aiFlotationLifecycle';
import { LEARNER_OFFER_FAMILIES } from '../../../models/OfferFamily';
import type { JourneySubjectContext } from '../governor/types';
import {
  ACTION_LAYER,
  B2B_GENERATORS,
  LAYER_ONE_CHANNELS,
  generateB2b,
  b2bEmptyReason,
  b2bHardStops,
  type B2bProgramme,
} from '../strategies/b2bCandidates';
import { BUSINESS_PROGRAMME, businessStrategy } from '../strategies/businessCandidates';
import { FLOTATION_PROGRAMME, flotationStrategy } from '../strategies/aiFlotationCandidates';
import { channel, contact } from './fixtures/learnerFixtures';
import { bizCtx, flotCtx, withClassification } from './fixtures/b2bFixtures';
import { phase2SourceFiles } from './phase2Sources';

/**
 * T310 — §8 Layer-1 candidates for the two business programmes.
 *
 * The properties that matter, in order: only Layer-1 actions and channels are
 * ever generated (the plan's control — a Layer-3 candidate — must fail here);
 * a candidate never names a channel the contact evidence closed; the state
 * groups partition each programme's vocabulary exactly; the family boundary is
 * enforced at generation for both brands; and everything beyond Layer 1 is
 * NAMED in `defer` and never emitted.
 */

const PROGRAMMES: Array<[string, B2bProgramme, (o?: Partial<JourneySubjectContext>) => JourneySubjectContext, readonly string[]]> = [
  ['Colaberry Enterprise', BUSINESS_PROGRAMME, bizCtx, BUSINESS_STATES],
  ['AI Flotation', FLOTATION_PROGRAMME, flotCtx, FLOTATION_STATES],
];

/* ── the layer rule ────────────────────────────────────────────────────────── */

describe('only Layer 1 is ever generated', () => {
  describe.each(PROGRAMMES)('%s', (_name, p, ctx, states) => {
    const overlays = [[], ['STALLED'], ['DECLINED'], ['NO_RESPONSE'], ['HUMAN_REVIEW'], ['MEETING_NO_SHOW'], ['MULTI_PATH']];
    const cases = states.flatMap((state) => overlays.map((o) => [state, o] as const));

    it.each(cases)('%s with overlays %p emits only Layer-1 actions on Layer-1 channels', (state, o) => {
      const g = generateB2b(p, ctx({ state, overlays: [...o], enrollment_id: 'enr-x' }));
      for (const c of g.candidates) {
        expect({ action: c.action_type, layer: ACTION_LAYER[c.action_type] }).toEqual({ action: c.action_type, layer: 1 });
        expect(LAYER_ONE_CHANNELS.has(c.channel)).toBe(true);
      }
    });

    it('the plan\'s control: a Layer-3 action anywhere in the output is a failure', () => {
      // Non-vacuity for the assertion above: the map really does put Ali
      // outreach at 3 and a human task at 4, so a generator emitting one would
      // be caught, not waved through as "layer undefined".
      expect(ACTION_LAYER.SEND_ALI_OUTREACH).toBe(3);
      expect(ACTION_LAYER.CREATE_HUMAN_TASK).toBe(4);
      expect(ACTION_LAYER.SEND_SMS).toBe(2);
      expect(LAYER_ONE_CHANNELS.has('sms')).toBe(false);
      expect(LAYER_ONE_CHANNELS.has('voice')).toBe(false);
    });
  });
});

/* ── the state partition ───────────────────────────────────────────────────── */

describe('the state groups partition the programme\'s vocabulary exactly', () => {
  it.each(PROGRAMMES)('%s', (_name, p, _ctx, states) => {
    const groups = [...p.states.fresh, ...p.states.problemKnown, ...p.states.exploring, ...p.states.commercial, p.states.terminal];
    expect([...groups].sort()).toEqual([...states].sort());
    expect(new Set(groups).size).toBe(groups.length);
  });
});

/* ── one happy path per candidate type per brand ───────────────────────────── */

describe('one happy path per candidate type, per brand, with its tier and a rationale', () => {
  describe.each(PROGRAMMES)('%s', (_name, p, ctx) => {
    const one = (over: Partial<JourneySubjectContext>) => {
      const g = generateB2b(p, ctx(over));
      expect(g.candidates).toHaveLength(1);
      return g.candidates[0];
    };

    it('a fresh lead gets a clarification question at tier 8', () => {
      const c = one({ state: p.states.fresh[0], classification: null });
      expect([c.action_type, c.priority_tier, c.channel]).toEqual(['SEND_EMAIL', 8, 'email']);
      expect(c.required_assets).toEqual([{ asset_type: 'clarification_question', program_slug: ctx().program_slug }]);
      expect(c.rationale.join(' ')).toMatch(/nothing is known yet.*no path classified yet/);
    });

    it('a lead whose problem is known gets capability education at tier 7, for its path', () => {
      const c = one({ state: p.states.problemKnown[0] });
      const path = ctx().classification?.primary_path;
      expect([c.action_type, c.priority_tier]).toEqual(['SEND_EMAIL', 7]);
      expect(c.required_assets[0]).toEqual({ asset_type: 'capability_education', offer_family: path, program_slug: ctx().program_slug });
      expect(c.rationale.join(' ')).toContain(`educate on the ${path} capability`);
    });

    it('a lead weighing options gets a case study at tier 7', () => {
      const c = one({ state: p.states.exploring[0] });
      expect([c.action_type, c.priority_tier]).toEqual(['SEND_EMAIL', 7]);
      expect(c.required_assets[0].asset_type).toBe('case_study');
    });

    it('a stalled conversation gets a re-engagement at tier 6, ahead of the state\'s own candidate', () => {
      const c = one({ state: p.states.problemKnown[0], overlays: ['STALLED'] });
      expect([c.action_type, c.priority_tier]).toEqual(['SEND_EMAIL', 6]);
      expect(c.required_assets[0].asset_type).toBe('clarification_question');
      expect(c.rationale.join(' ')).toContain('STALLED overlay');
    });

    it('a decline suppresses at tier 1 and nothing else is proposed', () => {
      const c = one({ state: p.states.problemKnown[0], overlays: ['DECLINED'] });
      expect([c.action_type, c.priority_tier, c.channel]).toEqual(['SUPPRESS_CONTACT', 1, 'none']);
    });

    it('a portal account gets the in-app nudge at tier 9, beside the state\'s email', () => {
      const g = generateB2b(p, ctx({ state: p.states.problemKnown[0], enrollment_id: 'enr-9' }));
      expect(g.candidates.map((c) => [c.action_type, c.priority_tier])).toEqual([
        ['SEND_EMAIL', 7],
        ['SHOW_IN_APP_NUDGE', 9],
      ]);
    });

    it('the rationale names what T306 measured, or that nothing was', () => {
      const c = one({ state: p.states.problemKnown[0] });
      expect(c.rationale[c.rationale.length - 1]).toMatch(/^scores: /);
    });

    it('every candidate carries its programme on the asset query, and never a campaign key', () => {
      for (const state of [...p.states.fresh, ...p.states.problemKnown, ...p.states.exploring]) {
        for (const c of generateB2b(p, ctx({ state })).candidates) {
          expect(c.campaign_key).toBeNull();
          for (const q of c.required_assets) expect(q.program_slug).toBe(ctx().program_slug);
        }
      }
    });
  });
});

/* ── no ineligible channel ─────────────────────────────────────────────────── */

describe('a candidate never names a channel the contact evidence closed', () => {
  describe.each(PROGRAMMES)('%s', (_name, p, ctx) => {
    it('email closed: no email candidate, and the reason is the evidence\'s own', () => {
      const g = generateB2b(p, ctx({ state: p.states.problemKnown[0], contact: contact({ email: channel(false, 'no_express_consent') }) }));
      expect(g.candidates.filter((c) => c.channel === 'email')).toEqual([]);
      expect(g.not_emitted.find((n) => n.generator === 'capabilityEducation')?.reason).toBe('email_ineligible:no_express_consent');
    });

    it('in-app closed: no nudge even with a portal account', () => {
      const g = generateB2b(p, ctx({ state: p.states.problemKnown[0], enrollment_id: 'enr-9', contact: contact({ in_app: channel(false, 'no_app', 'none') }) }));
      expect(g.candidates.filter((c) => c.channel === 'in_app')).toEqual([]);
    });

    it('every channel a candidate names was eligible on the evidence it was generated from', () => {
      for (const state of [...p.states.fresh, ...p.states.problemKnown, ...p.states.exploring]) {
        const c = ctx({ state, enrollment_id: 'enr-9' });
        for (const cand of generateB2b(p, c).candidates) {
          if (cand.channel === 'none') continue;
          expect(c.contact.channels[cand.channel].eligible).toBe(true);
        }
      }
    });
  });
});

/* ── the family boundary, at generation ────────────────────────────────────── */

describe('the family boundary is enforced at generation, per brand', () => {
  it('AI Flotation: business training is never proposed, and every generator says why', () => {
    const g = generateB2b(FLOTATION_PROGRAMME, flotCtx({ classification: withClassification({ primary_path: 'business_training' }) }));
    expect(g.candidates).toEqual([]);
    expect(g.not_emitted.find((n) => n.generator === 'capabilityEducation')?.reason).toBe('flotation_excludes:business_training');
  });

  it.each([...LEARNER_OFFER_FAMILIES])('AI Flotation: learner family %s is never proposed', (family) => {
    const g = generateB2b(FLOTATION_PROGRAMME, flotCtx({ classification: withClassification({ primary_path: family }) }));
    expect(g.candidates).toEqual([]);
  });

  it('Colaberry Enterprise: business training IS proposed — the positive control that the boundary is per brand', () => {
    const g = generateB2b(BUSINESS_PROGRAMME, bizCtx({ classification: withClassification({ primary_path: 'business_training' }) }));
    expect(g.candidates).toHaveLength(1);
    expect(g.candidates[0].required_assets[0].offer_family).toBe('business_training');
  });

  it('Colaberry Enterprise: a learner family is not its to offer', () => {
    const g = generateB2b(BUSINESS_PROGRAMME, bizCtx({ classification: withClassification({ primary_path: 'learner_free_training' }) }));
    expect(g.candidates).toEqual([]);
    expect(g.not_emitted.find((n) => n.generator === 'capabilityEducation')?.reason).toBe('family_not_offered_by_brand:learner_free_training');
  });

  it('the wrong programme kind or brand produces nothing, with the reason on every generator', () => {
    expect(generateB2b(BUSINESS_PROGRAMME, flotCtx()).not_emitted.every((n) => n.reason === 'program_kind_not_business:consulting')).toBe(true);
    expect(generateB2b(BUSINESS_PROGRAMME, bizCtx({ brand_slug: 'cpn' })).not_emitted.every((n) => n.reason === 'brand_not_colaberry-enterprise:cpn')).toBe(true);
  });
});

/* ── beyond Layer 1: named, never generated ────────────────────────────────── */

describe('what the strategy WOULD do beyond Layer 1 is named in defer and never generated', () => {
  describe.each(PROGRAMMES)('%s', (_name, p, ctx) => {
    it.each([...p.states.commercial])('%s: no candidate; a create_handoff to the owner §8 names', (state) => {
      const g = generateB2b(p, ctx({ state, enrollment_id: 'enr-9' }));
      expect(g.candidates).toEqual([]);
      expect(g.deferred).toEqual([
        { would: 'create_handoff', reason: `commercial_state:${state}`, payload: { brand: ctx().brand_slug, state, path: ctx().classification?.primary_path, layer: 4, owner: p.handoff.owner } },
      ]);
      expect(b2bEmptyReason(p, ctx({ state }), g)).toBe(`commercial_state_needs_layer_2_plus:${state}`);
    });

    it('HUMAN_REVIEW: no email at all, and a handoff to human review is named', () => {
      const g = generateB2b(p, ctx({ overlays: ['HUMAN_REVIEW'] }));
      expect(g.candidates).toEqual([]);
      expect(g.deferred.map((d) => [d.would, d.reason])).toEqual([['create_handoff', 'human_review_overlay']]);
      expect(b2bEmptyReason(p, ctx({ overlays: ['HUMAN_REVIEW'] }), g)).toBe('human_review_overlay');
    });

    it('NO_RESPONSE: nurture stops, and a reply-aware sequence (Layer 2) is named, not run', () => {
      const g = generateB2b(p, ctx({ overlays: ['NO_RESPONSE'] }));
      expect(g.candidates).toEqual([]);
      expect(g.deferred.map((d) => [d.would, d.payload.layer])).toEqual([['reply_aware_sequence', 2]]);
    });

    it('MEETING_NO_SHOW: a scheduling offer (Layer 2) is named beside the state\'s own candidate', () => {
      const g = generateB2b(p, ctx({ overlays: ['MEETING_NO_SHOW'] }));
      expect(g.deferred.map((d) => [d.would, d.payload.layer])).toEqual([['scheduling_offer', 2]]);
    });

    it('a create_handoff shape never appears as a candidate, only as a deferral', () => {
      for (const state of p.states.commercial) {
        const g = generateB2b(p, ctx({ state }));
        expect(g.candidates.map((c) => c.action_type)).not.toContain('CREATE_HUMAN_TASK');
        expect(g.deferred.some((d) => d.would === 'create_handoff')).toBe(true);
      }
    });
  });

  it('the two programmes hand off to different owners', () => {
    expect(BUSINESS_PROGRAMME.handoff.owner).toBe('sales');
    expect(FLOTATION_PROGRAMME.handoff.owner).toBe('solution_architect');
  });
});

/* ── hard stops ────────────────────────────────────────────────────────────── */

describe('the six stops', () => {
  it.each(PROGRAMMES)('%s: the terminal state is converted; a builder flag is never cleared', (_name, p, ctx) => {
    expect(b2bHardStops(p, ctx({ state: p.states.terminal })).converted).toBe(true);
    expect(b2bHardStops(p, ctx()).converted).toBe(false);
    const set = { converted: true, unsubscribed: true, dnc: true, consentRevoked: true, killSwitch: true, campaignInactive: true };
    expect(b2bHardStops(p, ctx({ hardStop: set }))).toEqual(set);
    expect(b2bHardStops(p, ctx({ contact: contact({ email: channel(false, 'lead_unsubscribed', 'lead_status') }) })).unsubscribed).toBe(true);
  });
});

/* ── the comparator property, re-asserted against real code that sets a tier ── */

describe('T303\'s read-ban, re-asserted here against real generators', () => {
  it('the new files are in the scanned tree, and they really do SET priority_tier', () => {
    const scanned = phase2SourceFiles().map((f) => f.replace(/\\/g, '/'));
    for (const f of ['strategies/b2bCandidates.ts', 'strategies/businessCandidates.ts', 'strategies/aiFlotationCandidates.ts', 'governor/contentGate.ts']) {
      expect(scanned.some((s) => s.endsWith('services/growthJourney/' + f))).toBe(true);
    }
    // Non-vacuity for T303's read-ban, which walks this same list: it is only
    // meaningful over code that NAMES the field, and b2bCandidates.ts writes it
    // as an object-literal key in every email candidate. The ban itself runs in
    // oneArbitrationPoint.test.ts over these files; a generator that READ the
    // field would fail there, and the T310 evidence shows that mutation.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'strategies', 'b2bCandidates.ts'), 'utf8');
    expect((src.match(/priority_tier:/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('every generator in the list is a real function, and the strategy exposes the hooks the pipeline reads', () => {
    expect(B2B_GENERATORS.map((g) => g.name)).toEqual(['declinedSuppress', 'stalledReengage', 'capabilityEducation', 'caseStudy', 'clarificationQuestion', 'inAppNudge']);
    for (const s of [businessStrategy, flotationStrategy]) {
      expect(typeof s.generate).toBe('function');
      expect(typeof s.emptyReason).toBe('function');
      expect(typeof s.defer).toBe('function');
      expect(typeof s.hardStops).toBe('function');
    }
  });
});
