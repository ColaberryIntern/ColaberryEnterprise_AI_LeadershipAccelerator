jest.mock('../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
import * as fs from 'fs';
import * as path from 'path';
import { scoreSubject } from '../scoring/scoreVector';
import {
  BUSINESS_OVERLAYS,
  BUSINESS_STATES,
  DEFERRED_OVERLAYS,
  DEFERRED_STATES,
  classifyBusinessState,
  type BusinessState,
  type ClassifyBusinessInput,
} from '../lifecycle/businessLifecycle';

/**
 * T307 — §5.3's eight business states.
 *
 * The properties under test: the highest state the evidence supports wins,
 * knowledge never steps down, a deal may, `CUSTOMER` is terminal, and
 * `state_entered_at` moves only on a real change. Every transition has a case,
 * and so does every refusal to step down.
 */

const AS_OF = new Date('2026-09-14T12:00:00Z');

const input = (over: Partial<ClassifyBusinessInput> = {}): ClassifyBusinessInput => ({
  previous: { state: null, state_entered_at: null },
  lead: null,
  classification: null,
  inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
  appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
  isCustomer: false,
  asOf: AS_OF,
  ...over,
});

const stateOf = (over: Partial<ClassifyBusinessInput> = {}): BusinessState =>
  classifyBusinessState(input(over)).state;

describe('the eight states are §5.3 exactly', () => {
  it('names them in order, both directions', () => {
    expect([...BUSINESS_STATES]).toEqual([
      'NEW_BUSINESS_LEAD',
      'PROBLEM_IDENTIFIED',
      'EXPLORING_SOLUTIONS',
      'QUALIFIED_OPPORTUNITY',
      'DISCOVERY_READY',
      'SOLUTION_SCOPING',
      'PROPOSAL_OR_PAYMENT_READY',
      'CUSTOMER',
    ]);
  });

  it('declares the one state nothing here can evidence', () => {
    // A state nobody can reach is far better declared than silently unreachable.
    expect(DEFERRED_STATES.map((d) => d.state)).toEqual(['SOLUTION_SCOPING']);
    expect(DEFERRED_STATES[0].reason.length).toBeGreaterThan(60);
    expect(DEFERRED_STATES[0].reason).toContain('scope');
  });
});

describe('evidence from now: one case per entry', () => {
  it('nothing at all is NEW_BUSINESS_LEAD', () => {
    const r = classifyBusinessState(input());
    expect(r.state).toBe('NEW_BUSINESS_LEAD');
    expect(r.evidence).toEqual(['no evidence beyond the lead existing']);
  });

  it('a stated problem is PROBLEM_IDENTIFIED', () => {
    expect(stateOf({ lead: { idea_input: 'our onboarding takes three weeks' } })).toBe('PROBLEM_IDENTIFIED');
  });

  it('a classified intent alone also reaches PROBLEM_IDENTIFIED', () => {
    expect(
      stateOf({
        classification: { primary_path: null, secondary_paths: [], intent: 'automation_request', requires_human_review: false },
      }),
    ).toBe('PROBLEM_IDENTIFIED');
  });

  it('named systems are EXPLORING_SOLUTIONS', () => {
    expect(stateOf({ lead: { selected_systems: 'crm,warehouse' } })).toBe('EXPLORING_SOLUTIONS');
  });

  it('a classified path also reaches EXPLORING_SOLUTIONS', () => {
    expect(
      stateOf({
        classification: { primary_path: 'workflow_automation', secondary_paths: [], intent: null, requires_human_review: false },
      }),
    ).toBe('EXPLORING_SOLUTIONS');
  });

  it('a reply is QUALIFIED_OPPORTUNITY — the buyer acted', () => {
    // What separates a qualified opportunity from one we merely like.
    const r = classifyBusinessState(input({ inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 } }));
    expect(r.state).toBe('QUALIFIED_OPPORTUNITY');
    expect(r.evidence[0]).toContain('inbound outcome');
  });

  it('a scheduled appointment is DISCOVERY_READY', () => {
    expect(stateOf({ appointments: { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 } })).toBe('DISCOVERY_READY');
  });

  it('pipeline_stage=meeting_scheduled also reaches DISCOVERY_READY, as a signal', () => {
    const r = classifyBusinessState(input({ lead: { pipeline_stage: 'meeting_scheduled' } }));
    expect(r.state).toBe('DISCOVERY_READY');
    expect(r.evidence[0]).toContain('(signal)');
  });

  it.each(['proposal_sent', 'negotiation'])('pipeline_stage=%s is PROPOSAL_OR_PAYMENT_READY', (stage) => {
    expect(stateOf({ lead: { pipeline_stage: stage } })).toBe('PROPOSAL_OR_PAYMENT_READY');
  });

  it('an enrolment is CUSTOMER', () => {
    expect(stateOf({ isCustomer: true })).toBe('CUSTOMER');
  });

  it('pipeline_stage=enrolled is CUSTOMER too', () => {
    expect(stateOf({ lead: { pipeline_stage: 'enrolled' } })).toBe('CUSTOMER');
  });

  it('SOLUTION_SCOPING is never produced, by any input this test can build', () => {
    // The declared gap, asserted rather than assumed.
    const combinations: Partial<ClassifyBusinessInput>[] = [
      {},
      { lead: { idea_input: 'x', selected_systems: 'y', pipeline_stage: 'contacted' } },
      { inbound: { replied: 3, booked_meeting: 2, answered: 1, declined: 0 } },
      { appointments: { scheduled: 1, completed: 4, no_show: 1, cancelled: 2 } },
      { previous: { state: 'SOLUTION_SCOPING', state_entered_at: AS_OF } },
      { lead: { pipeline_stage: 'proposal_sent' }, isCustomer: false },
    ];
    for (const over of combinations) {
      expect(classifyBusinessState(input(over)).state).not.toBe('SOLUTION_SCOPING');
    }
  });

  it('takes the HIGHEST supported state when several apply', () => {
    const r = classifyBusinessState(
      input({
        lead: { idea_input: 'a problem', selected_systems: 'crm', pipeline_stage: 'proposal_sent' },
        inbound: { replied: 2, booked_meeting: 0, answered: 0, declined: 0 },
        appointments: { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 },
      }),
    );
    expect(r.state).toBe('PROPOSAL_OR_PAYMENT_READY');
    expect(r.evidence).toEqual(['pipeline_stage=proposal_sent (signal)']);
  });
});

describe('knowledge never steps down; a deal may; a customer is terminal', () => {
  /**
   * Every downward pair on the ladder, each driven by evidence that really
   * produces the lower state.
   *
   * Attempt 1 drove all three rows with NO evidence, so the candidate was always
   * rung 0 — and a mutation allowing every downward step except a fall to the
   * bottom rung survived all 573 tests. The `it.each` labels named these very
   * pairs while the callback ignored the second element, so the label claimed a
   * property the test did not check. Each row now carries the input that
   * produces its candidate, and asserts that it does.
   */
  const CANDIDATE_INPUTS: Record<string, Partial<ClassifyBusinessInput>> = {
    NEW_BUSINESS_LEAD: {},
    PROBLEM_IDENTIFIED: { lead: { idea_input: 'our onboarding takes three weeks' } },
    EXPLORING_SOLUTIONS: { lead: { selected_systems: 'crm,warehouse' } },
  };

  it.each([
    ['PROBLEM_IDENTIFIED', 'NEW_BUSINESS_LEAD'],
    ['EXPLORING_SOLUTIONS', 'NEW_BUSINESS_LEAD'],
    ['EXPLORING_SOLUTIONS', 'PROBLEM_IDENTIFIED'],
    ['QUALIFIED_OPPORTUNITY', 'NEW_BUSINESS_LEAD'],
    ['QUALIFIED_OPPORTUNITY', 'PROBLEM_IDENTIFIED'],
    ['QUALIFIED_OPPORTUNITY', 'EXPLORING_SOLUTIONS'],
  ])('holds at %s when the evidence now reads as %s', (previous, candidateState) => {
    const over = CANDIDATE_INPUTS[candidateState];

    // First: the input really does produce the lower state on its own. Without
    // this the row below could be passing for the wrong reason.
    expect(classifyBusinessState(input(over)).state).toBe(candidateState);

    // Then: with that previous state, the ladder refuses to step down.
    const r = classifyBusinessState(
      input({ ...over, previous: { state: previous, state_entered_at: AS_OF } }),
    );
    expect(r.state).toBe(previous);
    expect(r.evidence[r.evidence.length - 1]).toContain('knowledge does not step down');
  });

  it('a real-world demotion: the replies age out but the systems remain', () => {
    // The concrete failure the weak test would have missed. A subject reached
    // QUALIFIED on inbound outcomes; those rows are archived, `selected_systems`
    // is still there, and the evidence now reads EXPLORING_SOLUTIONS.
    const r = classifyBusinessState(
      input({
        previous: { state: 'QUALIFIED_OPPORTUNITY', state_entered_at: AS_OF },
        lead: { selected_systems: 'crm' },
        inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
      }),
    );
    expect(r.state).toBe('QUALIFIED_OPPORTUNITY');
  });

  it('and an UPWARD step on the ladder is always allowed', () => {
    // The other direction: monotonicity must not become "never changes".
    const r = classifyBusinessState(
      input({
        previous: { state: 'PROBLEM_IDENTIFIED', state_entered_at: AS_OF },
        lead: { selected_systems: 'crm' },
      }),
    );
    expect(r.state).toBe('EXPLORING_SOLUTIONS');
  });

  it('a discovery-ready deal that cools falls back — but not below QUALIFIED', () => {
    // A cancelled meeting means they are no longer discovery-ready, and
    // pretending otherwise keeps proposal-stage messages going to someone who
    // walked away. But the knowledge they earned stays.
    const r = classifyBusinessState(
      input({
        previous: { state: 'DISCOVERY_READY', state_entered_at: AS_OF },
        appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 1 },
      }),
    );
    expect(r.state).toBe('QUALIFIED_OPPORTUNITY');
  });

  it('a proposal-stage deal that cools also floors at QUALIFIED', () => {
    const r = classifyBusinessState(input({ previous: { state: 'PROPOSAL_OR_PAYMENT_READY', state_entered_at: AS_OF } }));
    expect(r.state).toBe('QUALIFIED_OPPORTUNITY');
  });

  it('a commercial state may still move UP freely', () => {
    const r = classifyBusinessState(
      input({
        previous: { state: 'DISCOVERY_READY', state_entered_at: AS_OF },
        lead: { pipeline_stage: 'negotiation' },
      }),
    );
    expect(r.state).toBe('PROPOSAL_OR_PAYMENT_READY');
  });

  it('CUSTOMER is terminal: no input demotes one', () => {
    for (const over of [
      {},
      { appointments: { scheduled: 0, completed: 0, no_show: 3, cancelled: 3 } },
      { inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 5 } },
      { lead: { pipeline_stage: 'contacted' } },
    ] as Partial<ClassifyBusinessInput>[]) {
      const r = classifyBusinessState(input({ ...over, previous: { state: 'CUSTOMER', state_entered_at: AS_OF } }));
      expect(r.state).toBe('CUSTOMER');
    }
  });

  it('and becoming a customer overrides any previous state', () => {
    const r = classifyBusinessState(
      input({ previous: { state: 'NEW_BUSINESS_LEAD', state_entered_at: AS_OF }, isCustomer: true }),
    );
    expect(r.state).toBe('CUSTOMER');
  });
});

describe('state_entered_at moves only on a real change', () => {
  const entered = new Date('2026-09-01T00:00:00Z');

  /**
   * Preserved in every case where the state does not change — not just the one.
   *
   * Attempt 1 tested a single 13-day-old non-customer, so resetting the clock
   * for a CUSTOMER, or for anyone already past the 21-day line, survived all 573
   * tests. That is the exact hazard this file's own comment names: a stalled
   * subject whose clock resets nightly flips STALLED on and off forever.
   */
  it.each([
    ['a recent subject', 'PROBLEM_IDENTIFIED', new Date('2026-09-01T00:00:00Z'), { lead: { idea_input: 'x' } }],
    ['one past the stall line', 'PROBLEM_IDENTIFIED', new Date('2026-07-01T00:00:00Z'), { lead: { idea_input: 'x' } }],
    ['a CUSTOMER', 'CUSTOMER', new Date('2026-05-01T00:00:00Z'), { isCustomer: true }],
    ['a commercial state', 'DISCOVERY_READY', new Date('2026-08-20T00:00:00Z'), { appointments: { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 } }],
  ] as [string, string, Date, Partial<ClassifyBusinessInput>][])(
    'is left alone for %s whose state does not change',
    (_label, previous, enteredAt, over) => {
      const r = classifyBusinessState(input({ ...over, previous: { state: previous, state_entered_at: enteredAt } }));
      expect(r.state).toBe(previous);
      expect(r.state_entered_at).toEqual(enteredAt);
    },
  );

  it('and a STALLED subject keeps its clock, so the overlay does not flicker', () => {
    // Two runs a day apart over the same unchanged state: the overlay must stay
    // on, which it only can if the clock did not move.
    const old = new Date('2026-08-01T00:00:00Z');
    const monday = classifyBusinessState(
      input({ previous: { state: 'QUALIFIED_OPPORTUNITY', state_entered_at: old }, lead: { selected_systems: 'crm' } }),
    );
    const tuesday = classifyBusinessState(
      input({
        previous: { state: monday.state, state_entered_at: monday.state_entered_at },
        lead: { selected_systems: 'crm' },
        asOf: new Date('2026-09-15T12:00:00Z'),
      }),
    );
    expect(monday.overlays).toContain('STALLED');
    expect(tuesday.overlays).toContain('STALLED');
    expect(tuesday.state_entered_at).toEqual(old);
  });

  it('moves to asOf when the state does change', () => {
    const r = classifyBusinessState(
      input({
        previous: { state: 'PROBLEM_IDENTIFIED', state_entered_at: entered },
        lead: { selected_systems: 'crm' },
      }),
    );
    expect(r.state).toBe('EXPLORING_SOLUTIONS');
    expect(r.state_entered_at).toEqual(AS_OF);
  });

  it('is asOf for a brand-new subject', () => {
    expect(classifyBusinessState(input()).state_entered_at).toEqual(AS_OF);
  });

  it('is asOf when a previous state exists with no timestamp', () => {
    // A row written before this column meant anything: treat it as entering now
    // rather than as having been there forever.
    const r = classifyBusinessState(input({ previous: { state: 'NEW_BUSINESS_LEAD', state_entered_at: null } }));
    expect(r.state_entered_at).toEqual(AS_OF);
  });
});

describe('overlays are derived fresh, never accumulated', () => {
  it('names only overlays this repo can derive, and declares the rest', () => {
    // §5.3 names NO overlays — it lists states and score dimensions. These six
    // do not pretend to be the spec's vocabulary.
    expect([...BUSINESS_OVERLAYS]).toEqual([
      'STALLED',
      'NO_RESPONSE',
      'MEETING_NO_SHOW',
      'DECLINED',
      'MULTI_PATH',
      'HUMAN_REVIEW',
    ]);
    expect(DEFERRED_OVERLAYS.map((o) => o.overlay).sort()).toEqual([
      'BUDGET_CONFIRMED',
      'SECURITY_REVIEW',
      'SPONSOR_IDENTIFIED',
    ]);
    for (const o of DEFERRED_OVERLAYS) expect(o.reason.length).toBeGreaterThan(40);
  });

  it('STALLED needs 21 days in one state AND nothing coming back', () => {
    const old = new Date('2026-08-01T00:00:00Z');
    const stalled = classifyBusinessState(
      input({ previous: { state: 'QUALIFIED_OPPORTUNITY', state_entered_at: old }, lead: { selected_systems: 'crm' } }),
    );
    expect(stalled.overlays).toContain('STALLED');

    const recentReply = classifyBusinessState(
      input({
        previous: { state: 'QUALIFIED_OPPORTUNITY', state_entered_at: old },
        inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 },
      }),
    );
    expect(recentReply.overlays).not.toContain('STALLED');
  });

  it('a customer is never STALLED', () => {
    const old = new Date('2026-08-01T00:00:00Z');
    const r = classifyBusinessState(input({ previous: { state: 'CUSTOMER', state_entered_at: old } }));
    expect(r.overlays).not.toContain('STALLED');
  });

  it('NO_RESPONSE does not apply to a CUSTOMER who paid without replying', () => {
    // Someone who bought without ever sending a reply is not unresponsive.
    const r = classifyBusinessState(input({ isCustomer: true }));
    expect(r.state).toBe('CUSTOMER');
    expect(r.overlays).not.toContain('NO_RESPONSE');
  });

  it('NO_RESPONSE applies past the first state only', () => {
    // A brand-new lead has not failed to respond to anything yet.
    expect(classifyBusinessState(input()).overlays).not.toContain('NO_RESPONSE');
    expect(classifyBusinessState(input({ lead: { idea_input: 'x' } })).overlays).toContain('NO_RESPONSE');
  });

  it('derives MEETING_NO_SHOW, DECLINED, MULTI_PATH and HUMAN_REVIEW from their own sources', () => {
    const r = classifyBusinessState(
      input({
        appointments: { scheduled: 0, completed: 0, no_show: 1, cancelled: 0 },
        inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 2 },
        classification: {
          primary_path: 'workflow_automation',
          secondary_paths: ['application_build'],
          intent: 'automation_request',
          requires_human_review: true,
        },
      }),
    );
    expect(r.overlays).toEqual(
      expect.arrayContaining(['MEETING_NO_SHOW', 'DECLINED', 'MULTI_PATH', 'HUMAN_REVIEW']),
    );
  });

  it('are NOT accumulated: a resolved condition simply stops being derived', () => {
    const withOverlays = classifyBusinessState(
      input({ inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 1 }, lead: { idea_input: 'x' } }),
    );
    expect(withOverlays.overlays).toContain('DECLINED');

    const resolved = classifyBusinessState(
      input({ inbound: { replied: 1, booked_meeting: 0, answered: 0, declined: 0 }, lead: { idea_input: 'x' } }),
    );
    expect(resolved.overlays).not.toContain('DECLINED');
    expect(resolved.overlays).not.toContain('NO_RESPONSE');
  });
});

describe('pipeline_stage is read and never written', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'lifecycle', 'businessLifecycle.ts'), 'utf8');

  /**
   * Comments removed. The scan below bans `advancePipelineStage`, and this
   * file's own header NAMES it while explaining why the column is read-only
   * here — so a prose-inclusive scan fails on the explanation. Fourth instance
   * of this shape in the run: T304's cutoff rule and T306's zero-default rule
   * hit it too, and the resolution is always the same. Prose may name what the
   * code must not do.
   */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const CODE = stripComments(SRC);

  it('the stripper leaves code and removes prose — both directions', () => {
    expect(stripComments('// advancePipelineStage in a comment\nconst x = 1;')).not.toContain(
      'advancePipelineStage',
    );
    expect(stripComments('const y = advancePipelineStage;')).toContain('advancePipelineStage');
    // And the real file still has its code after stripping.
    expect(CODE).toContain('export function classifyBusinessState');
  });

  it('this lifecycle contains no write to it', () => {
    // It advances on an OUTBOUND SEND, so it records what we did rather than
    // where the buyer is. A signal, never a destination.
    expect(CODE).not.toMatch(/pipeline_stage\s*[:=]\s*['"]/);
    expect(CODE).not.toMatch(/\.update\(/);
    expect(CODE).not.toMatch(/advancePipelineStage/);
    // Non-vacuity: it really does READ the column.
    expect(CODE).toContain('lead?.pipeline_stage');
  });

  it('is pure: no I/O, no clock, no model client', () => {
    for (const forbidden of ['sequelize', 'findAll', 'findOne', 'Date.now', 'new Date()', 'console.', 'process.env']) {
      expect({ forbidden, present: CODE.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });
});

describe('a signal-less subject: the acceptance clause, both halves', () => {
  it('lands in NEW_BUSINESS_LEAD with a null summary and its gaps named', () => {
    // Attempt 1 tested the state half and passed a hand-built vector for the
    // score half. This composes the REAL T306 scorer, which is the only way the
    // clause is actually covered.
    const state = classifyBusinessState(input());
    const scores = scoreSubject({ lead: null, observed: null, inbound: null, appointments: null, computed_at: AS_OF }, 'business');

    expect(state.state).toBe('NEW_BUSINESS_LEAD');
    expect(scores.summary).toBeNull();
    expect(scores.available).toBe(false);
    // Four sourceless dimensions (T407 wired three) plus the six that had no value
    // for this subject - no lead, no counts: every one named, none defaulted.
    expect(scores.gaps.filter((g) => g.endsWith(':no_source'))).toHaveLength(4);
    expect(scores.gaps).toContain('urgency:default_not_distinguishable_from_unasked');
    expect(scores.gaps).toEqual(expect.arrayContaining(['relationship_engagement:counts_unavailable', 'friction_risk:counts_unavailable', 'authority_stakeholder_readiness:no_value_for_subject']));
    expect(scores.dimensions.every((d) => d.value === null)).toBe(true);
  });
});
