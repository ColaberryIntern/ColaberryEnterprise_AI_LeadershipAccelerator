jest.mock('../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
import * as fs from 'fs';
import * as path from 'path';
import { OFFER_FAMILIES } from '../../../models/OfferFamily';
import {
  DEFERRED_OVERLAYS,
  DEFERRED_STATES,
  FLOTATION_ALLOWED_FAMILIES,
  FLOTATION_EXCLUDED_FAMILIES,
  FLOTATION_OVERLAYS,
  FLOTATION_STATES,
  classifyFlotationState,
  flotationExclusionReason,
  isFamilyAllowedForFlotation,
  offerCatalogueIsPartitioned,
  type ClassifyFlotationInput,
  type FlotationState,
} from '../lifecycle/aiFlotationLifecycle';

/**
 * T308 — §5.4's nine states, and the hard exclusion as a partition.
 *
 * Same properties as T307's suite, because it is the same machinery: the highest
 * supported state wins, knowledge never steps down, a project may cool,
 * `PROJECT_STARTED` is terminal, and `state_entered_at` moves only on a real
 * change. What is new here is the exclusion, and the fact that two state
 * vocabularies now share one column.
 */

const AS_OF = new Date('2026-09-14T12:00:00Z');

const input = (over: Partial<ClassifyFlotationInput> = {}): ClassifyFlotationInput => ({
  previous: { state: null, state_entered_at: null },
  lead: null,
  classification: null,
  inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
  appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
  hasDeliveryEngagement: false,
  isCustomer: false,
  asOf: AS_OF,
  ...over,
});

const stateOf = (over: Partial<ClassifyFlotationInput> = {}): FlotationState =>
  classifyFlotationState(input(over)).state;

describe('the nine states are §5.4 exactly', () => {
  it('names them in order, both directions', () => {
    expect([...FLOTATION_STATES]).toEqual([
      'NEW_PROJECT_LEAD',
      'IDEA_OR_PROBLEM_CAPTURED',
      'PROBLEM_CLARIFIED',
      'SOLUTION_VISUALIZED',
      'BUILD_QUALIFIED',
      'DISCOVERY_READY',
      'SCOPE_IN_PROGRESS',
      'PROPOSAL_OR_PAYMENT_READY',
      'PROJECT_STARTED',
    ]);
  });

  it('declares the state nothing here can evidence, with its second reason', () => {
    expect(DEFERRED_STATES.map((d) => d.state)).toEqual(['SCOPE_IN_PROGRESS']);
    expect(DEFERRED_STATES[0].reason).toContain('delivery_engagements');
    expect(DEFERRED_STATES[0].reason).toContain('after scoping');
  });
});

describe('evidence from now: one case per reachable state', () => {
  it('nothing at all is NEW_PROJECT_LEAD', () => {
    expect(stateOf()).toBe('NEW_PROJECT_LEAD');
  });

  it('a captured idea is IDEA_OR_PROBLEM_CAPTURED', () => {
    expect(stateOf({ lead: { idea_input: 'we want to automate invoice matching' } })).toBe(
      'IDEA_OR_PROBLEM_CAPTURED',
    );
  });

  it('an intent AND named systems is PROBLEM_CLARIFIED', () => {
    expect(
      stateOf({
        lead: { selected_systems: 'netsuite,stripe' },
        classification: { primary_path: 'workflow_automation', secondary_paths: [], intent: 'automation_request', requires_human_review: false },
      }),
    ).toBe('PROBLEM_CLARIFIED');
  });

  it('an intent WITHOUT systems is only IDEA_OR_PROBLEM_CAPTURED', () => {
    // Clarity needs both halves: a classified intent on its own is the idea,
    // not the clarified problem.
    expect(
      stateOf({
        classification: { primary_path: null, secondary_paths: [], intent: 'automation_request', requires_human_review: false },
      }),
    ).toBe('IDEA_OR_PROBLEM_CAPTURED');
  });

  it('a produced recommendation is SOLUTION_VISUALIZED — and says it is not engagement', () => {
    // The caveat that keeps the state honest: the advisory sync produced a
    // concept. Whether the lead ever looked at it has no source at all.
    const r = classifyFlotationState(input({ lead: { maturity_score: 7 } }));
    expect(r.state).toBe('SOLUTION_VISUALIZED');
    expect(r.evidence[0]).toContain('not the same as the lead engaging with it');
  });

  it('an unparseable maturity score does NOT reach SOLUTION_VISUALIZED', () => {
    // The same rule T306's retry learned: a non-number is not a measurement.
    expect(stateOf({ lead: { maturity_score: 'n/a' } })).toBe('NEW_PROJECT_LEAD');
    expect(stateOf({ lead: { maturity_score: '' } })).toBe('NEW_PROJECT_LEAD');
  });

  it('an inbound outcome is BUILD_QUALIFIED', () => {
    expect(stateOf({ inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 } })).toBe(
      'BUILD_QUALIFIED',
    );
  });

  it('a scheduled appointment is DISCOVERY_READY', () => {
    expect(stateOf({ appointments: { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 } })).toBe(
      'DISCOVERY_READY',
    );
  });

  it.each(['proposal_sent', 'negotiation'])('pipeline_stage=%s is PROPOSAL_OR_PAYMENT_READY', (stage) => {
    expect(stateOf({ lead: { pipeline_stage: stage } })).toBe('PROPOSAL_OR_PAYMENT_READY');
  });

  it('a delivery engagement is PROJECT_STARTED — the existing process, read not rebuilt', () => {
    const r = classifyFlotationState(input({ hasDeliveryEngagement: true }));
    expect(r.state).toBe('PROJECT_STARTED');
    expect(r.evidence[0]).toContain('delivery engagement');
  });

  it('a payment is PROJECT_STARTED too', () => {
    expect(stateOf({ isCustomer: true })).toBe('PROJECT_STARTED');
  });

  it('SCOPE_IN_PROGRESS is never produced, by any input this test can build', () => {
    const combinations: Partial<ClassifyFlotationInput>[] = [
      {},
      { lead: { idea_input: 'x', selected_systems: 'y', maturity_score: 5, pipeline_stage: 'contacted' } },
      { inbound: { replied: 4, booked_meeting: 2, answered: 1, declined: 0 } },
      { appointments: { scheduled: 2, completed: 3, no_show: 1, cancelled: 1 } },
      { previous: { state: 'SCOPE_IN_PROGRESS', state_entered_at: AS_OF } },
      { lead: { pipeline_stage: 'negotiation' } },
      { hasDeliveryEngagement: true },
    ];
    for (const over of combinations) {
      expect(classifyFlotationState(input(over)).state).not.toBe('SCOPE_IN_PROGRESS');
    }
  });

  it('takes the HIGHEST supported state when several apply', () => {
    const r = classifyFlotationState(
      input({
        lead: { idea_input: 'an idea', selected_systems: 'crm', maturity_score: 8, pipeline_stage: 'proposal_sent' },
        inbound: { replied: 2, booked_meeting: 1, answered: 0, declined: 0 },
        appointments: { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 },
        hasDeliveryEngagement: true,
      }),
    );
    expect(r.state).toBe('PROJECT_STARTED');
  });
});

describe('the same monotonicity, on a different vocabulary', () => {
  const CANDIDATE_INPUTS: Record<string, Partial<ClassifyFlotationInput>> = {
    NEW_PROJECT_LEAD: {},
    IDEA_OR_PROBLEM_CAPTURED: { lead: { idea_input: 'we want to automate invoicing' } },
    PROBLEM_CLARIFIED: {
      lead: { selected_systems: 'netsuite' },
      classification: { primary_path: 'workflow_automation', secondary_paths: [], intent: 'automation_request', requires_human_review: false },
    },
    SOLUTION_VISUALIZED: { lead: { maturity_score: 6 } },
  };

  it.each([
    ['IDEA_OR_PROBLEM_CAPTURED', 'NEW_PROJECT_LEAD'],
    ['PROBLEM_CLARIFIED', 'IDEA_OR_PROBLEM_CAPTURED'],
    ['SOLUTION_VISUALIZED', 'PROBLEM_CLARIFIED'],
    ['BUILD_QUALIFIED', 'SOLUTION_VISUALIZED'],
    ['BUILD_QUALIFIED', 'NEW_PROJECT_LEAD'],
  ])('holds at %s when the evidence now reads as %s', (previous, candidateState) => {
    // T307's lesson, applied from the start here: each row drives an input that
    // really produces the lower state, and asserts that it does.
    const over = CANDIDATE_INPUTS[candidateState];
    expect(classifyFlotationState(input(over)).state).toBe(candidateState);

    const r = classifyFlotationState(
      input({ ...over, previous: { state: previous, state_entered_at: AS_OF } }),
    );
    expect(r.state).toBe(previous);
    expect(r.evidence[r.evidence.length - 1]).toContain('knowledge does not step down');
  });

  it('an upward step is always allowed', () => {
    const r = classifyFlotationState(
      input({
        previous: { state: 'IDEA_OR_PROBLEM_CAPTURED', state_entered_at: AS_OF },
        lead: { maturity_score: 6 },
      }),
    );
    expect(r.state).toBe('SOLUTION_VISUALIZED');
  });

  it('a cooling project floors at BUILD_QUALIFIED, not at NEW', () => {
    const r = classifyFlotationState(
      input({
        previous: { state: 'DISCOVERY_READY', state_entered_at: AS_OF },
        appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 1 },
      }),
    );
    expect(r.state).toBe('BUILD_QUALIFIED');
  });

  it('PROJECT_STARTED is terminal in both directions', () => {
    for (const over of [
      {},
      { inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 3 } },
      { lead: { pipeline_stage: 'contacted' } },
    ] as Partial<ClassifyFlotationInput>[]) {
      expect(
        classifyFlotationState(input({ ...over, previous: { state: 'PROJECT_STARTED', state_entered_at: AS_OF } })).state,
      ).toBe('PROJECT_STARTED');
    }
    expect(
      classifyFlotationState(input({ previous: { state: 'NEW_PROJECT_LEAD', state_entered_at: AS_OF }, isCustomer: true })).state,
    ).toBe('PROJECT_STARTED');
  });

  it.each([
    ['a recent subject', 'IDEA_OR_PROBLEM_CAPTURED', new Date('2026-09-10T00:00:00Z'), { lead: { idea_input: 'x' } }],
    ['one past the stall line', 'IDEA_OR_PROBLEM_CAPTURED', new Date('2026-06-01T00:00:00Z'), { lead: { idea_input: 'x' } }],
    ['a started project', 'PROJECT_STARTED', new Date('2026-05-01T00:00:00Z'), { isCustomer: true }],
  ] as [string, string, Date, Partial<ClassifyFlotationInput>][])(
    'leaves state_entered_at alone for %s',
    (_label, previous, enteredAt, over) => {
      const r = classifyFlotationState(input({ ...over, previous: { state: previous, state_entered_at: enteredAt } }));
      expect(r.state).toBe(previous);
      expect(r.state_entered_at).toEqual(enteredAt);
    },
  );

  it('and moves it on a real change', () => {
    const r = classifyFlotationState(
      input({
        previous: { state: 'IDEA_OR_PROBLEM_CAPTURED', state_entered_at: new Date('2026-09-01T00:00:00Z') },
        lead: { maturity_score: 6 },
      }),
    );
    expect(r.state_entered_at).toEqual(AS_OF);
  });
});

describe('the hard exclusion is a PARTITION of the whole catalogue', () => {
  it('allowed and excluded together cover every family, with no overlap', () => {
    // A denylist silently permits whatever is added to the catalogue next. This
    // fails the build until somebody decides which side a new family is on —
    // and this is the brand where getting that wrong means selling training
    // from a consultancy.
    expect(offerCatalogueIsPartitioned()).toEqual({ missing: [], overlapping: [] });
    expect(FLOTATION_ALLOWED_FAMILIES.length + FLOTATION_EXCLUDED_FAMILIES.length).toBe(
      OFFER_FAMILIES.length,
    );
  });

  it('allows exactly §5.4 four service paths plus the paid discovery its purpose names', () => {
    expect([...FLOTATION_ALLOWED_FAMILIES].sort()).toEqual([
      'ai_consulting',
      'ai_project',
      'application_build',
      'paid_discovery',
      'workflow_automation',
    ]);
  });

  it('excludes business training and every learner family', () => {
    expect([...FLOTATION_EXCLUDED_FAMILIES].sort()).toEqual([
      'business_training',
      'learner_certification',
      'learner_community_subscription',
      'learner_free_training',
      'learner_internship',
      'learner_paid_training',
    ]);
  });

  it.each([...FLOTATION_EXCLUDED_FAMILIES])('refuses %s, naming it', (family) => {
    expect(isFamilyAllowedForFlotation(family)).toBe(false);
    expect(flotationExclusionReason(family)).toBe(`flotation_excludes:${family}`);
  });

  it.each([...FLOTATION_ALLOWED_FAMILIES])('allows %s, with no reason to report', (family) => {
    expect(isFamilyAllowedForFlotation(family)).toBe(true);
    expect(flotationExclusionReason(family)).toBeNull();
  });

  it('refuses an UNKNOWN family rather than letting it through', () => {
    // A typo, or a catalogue entry added after this file was written, must not
    // reach a Flotation subject because it matched neither list.
    expect(isFamilyAllowedForFlotation('business_trainingg')).toBe(false);
    expect(flotationExclusionReason('business_trainingg')).toBe(
      'flotation_excludes:unknown_family:business_trainingg',
    );
    expect(isFamilyAllowedForFlotation(null)).toBe(false);
    expect(flotationExclusionReason(undefined)).toBe('flotation_excludes:no_family_named');
  });
});

describe('overlays, and the one §5.4 asks for that has no source', () => {
  it('names only what can be derived, and declares the rest', () => {
    expect([...FLOTATION_OVERLAYS]).toEqual([
      'STALLED',
      'NO_RESPONSE',
      'MEETING_NO_SHOW',
      'DECLINED',
      'HUMAN_REVIEW',
    ]);
    // §5.4 asks for "engagement with generated concepts" as a score dimension;
    // T306 found no source, and neither is there one for an overlay.
    expect(DEFERRED_OVERLAYS.map((o) => o.overlay)).toContain('CONCEPT_IGNORED');
    for (const o of DEFERRED_OVERLAYS) expect(o.reason.length).toBeGreaterThan(40);
  });

  it('STALLED needs 28 days AND silence, and never applies to a started project', () => {
    const old = new Date('2026-07-01T00:00:00Z');
    expect(
      classifyFlotationState(input({ previous: { state: 'BUILD_QUALIFIED', state_entered_at: old }, inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 } })).overlays,
    ).toContain('STALLED');
    expect(
      classifyFlotationState(input({ previous: { state: 'BUILD_QUALIFIED', state_entered_at: old }, inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 } })).overlays,
    ).not.toContain('STALLED');
    expect(
      classifyFlotationState(input({ previous: { state: 'PROJECT_STARTED', state_entered_at: old }, isCustomer: true })).overlays,
    ).not.toContain('STALLED');
  });

  it('NO_RESPONSE skips the first state and a started project', () => {
    expect(classifyFlotationState(input()).overlays).not.toContain('NO_RESPONSE');
    expect(classifyFlotationState(input({ lead: { idea_input: 'x' } })).overlays).toContain('NO_RESPONSE');
    expect(classifyFlotationState(input({ hasDeliveryEngagement: true })).overlays).not.toContain('NO_RESPONSE');
  });

  it('are derived fresh, never accumulated', () => {
    const declined = classifyFlotationState(
      input({ lead: { idea_input: 'x' }, inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 1 } }),
    );
    expect(declined.overlays).toContain('DECLINED');
    const recovered = classifyFlotationState(
      input({ lead: { idea_input: 'x' }, inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 } }),
    );
    expect(recovered.overlays).not.toContain('DECLINED');
  });
});

describe('purity and the shared rule', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'lifecycle', 'aiFlotationLifecycle.ts'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('is pure: no I/O, no clock, no model client', () => {
    for (const forbidden of ['sequelize', 'findAll', 'findOne', 'Date.now', 'new Date()', 'console.', 'process.env']) {
      expect({ forbidden, present: CODE.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  it('writes no lead column, and never touches pipeline_stage', () => {
    expect(CODE).not.toMatch(/pipeline_stage\s*[:=]\s*['"]/);
    expect(CODE).not.toMatch(/\.update\(/);
    expect(CODE).toContain('lead?.pipeline_stage');
  });

  it('uses the SHARED monotonicity rule rather than its own copy', () => {
    // The whole reason T308 extracted it: one ladder rule in the codebase, not
    // two that agree today.
    expect(CODE).toContain('applyLadderMonotonicity');
    expect(CODE).toContain('settleEnteredAt');
    expect(CODE).not.toContain('function applyMonotonicity');
    expect(CODE).not.toMatch(/indexOf\(previous/);
  });
});
