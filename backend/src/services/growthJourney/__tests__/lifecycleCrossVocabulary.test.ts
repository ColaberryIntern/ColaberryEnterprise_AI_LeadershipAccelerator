import { classifyBusinessState, BUSINESS_STATES } from '../lifecycle/businessLifecycle';
import { classifyFlotationState, FLOTATION_STATES } from '../lifecycle/aiFlotationLifecycle';
import { applyLadderMonotonicity } from '../lifecycle/monotonicity';

/**
 * T308 — two state vocabularies, ONE column.
 *
 * `growth_journey_profiles.state` is shared by every programme, so from T308
 * onwards a business machine really can be handed a Flotation state and vice
 * versa: a mis-routed subject, a re-classification that moved brands, a hand
 * edit, or a row written before either vocabulary existed.
 *
 * T307's verifier found two mutations that survived its whole suite, both on
 * exactly this — an unknown previous state treated as a HOLD, and a
 * `SOLUTION_SCOPING` row falling to the bottom rung instead of flooring. The
 * behaviour was already correct; nothing pinned it. This file pins it once, for
 * both machines, because the property belongs to neither of them alone.
 *
 * It also keeps `businessLifecycle.test.ts` under CLAUDE.md's 500-line ceiling,
 * which it was 25 lines away from.
 */

const AS_OF = new Date('2026-09-14T12:00:00Z');

const businessInput = (previousState: string | null) => ({
  previous: { state: previousState, state_entered_at: new Date('2026-08-01T00:00:00Z') },
  lead: { idea_input: 'we need to automate invoicing' },
  classification: null,
  inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
  appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
  isCustomer: false,
  asOf: AS_OF,
});

const flotationInput = (previousState: string | null) => ({
  previous: { state: previousState, state_entered_at: new Date('2026-08-01T00:00:00Z') },
  lead: { idea_input: 'we need to automate invoicing' },
  classification: null,
  inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 },
  appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 },
  hasDeliveryEngagement: false,
  isCustomer: false,
  asOf: AS_OF,
});

/** Every state the OTHER programme owns, plus the shapes a database can hold. */
const FOREIGN_TO_BUSINESS = FLOTATION_STATES.filter((s) => !(BUSINESS_STATES as readonly string[]).includes(s));
const FOREIGN_TO_FLOTATION = BUSINESS_STATES.filter((s) => !(FLOTATION_STATES as readonly string[]).includes(s));
const JUNK = ['LEGACY_HOT_LEAD', 'problem_identified', '', '   ', 'NEW_BUSINESS_LEAD_v2'];

describe('the two vocabularies really do overlap, and mostly do not', () => {
  it('shares exactly the states both specs name identically', () => {
    // Worth asserting: the foreign-state lists below are only meaningful if the
    // overlap is what we think it is. §5.3 and §5.4 share two state names.
    const shared = BUSINESS_STATES.filter((s) => (FLOTATION_STATES as readonly string[]).includes(s));
    expect([...shared].sort()).toEqual(['DISCOVERY_READY', 'PROPOSAL_OR_PAYMENT_READY']);
    expect(FOREIGN_TO_BUSINESS.length).toBe(7);
    expect(FOREIGN_TO_FLOTATION.length).toBe(6);
  });
});

describe('a previous state from the OTHER programme is never held', () => {
  it.each([...FOREIGN_TO_BUSINESS])('the business machine does not hold %s', (foreign) => {
    // Holding it would write a §5.4 state into a §5.3 projection and freeze the
    // subject in a state the business machine cannot reason about.
    const r = classifyBusinessState(businessInput(foreign));
    expect(r.state).toBe('PROBLEM_IDENTIFIED');
    expect(BUSINESS_STATES).toContain(r.state);
    expect(r.evidence[r.evidence.length - 1]).toContain('not one of this programme');
  });

  it.each([...FOREIGN_TO_FLOTATION])('the Flotation machine does not hold %s', (foreign) => {
    const r = classifyFlotationState(flotationInput(foreign));
    expect(r.state).toBe('IDEA_OR_PROBLEM_CAPTURED');
    expect(FLOTATION_STATES).toContain(r.state);
    expect(r.evidence[r.evidence.length - 1]).toContain('not one of this programme');
  });

  it.each(JUNK)('nor a legacy or malformed value like %p', (junk) => {
    expect(classifyBusinessState(businessInput(junk)).state).toBe('PROBLEM_IDENTIFIED');
    expect(classifyFlotationState(flotationInput(junk)).state).toBe('IDEA_OR_PROBLEM_CAPTURED');
  });

  it('and a null previous state is simply the first classification', () => {
    const r = classifyBusinessState(businessInput(null));
    expect(r.state).toBe('PROBLEM_IDENTIFIED');
    expect(r.evidence.join(' ')).not.toContain('not one of this programme');
  });
});

describe('a SHARED state name is still honoured by both machines', () => {
  it('DISCOVERY_READY is a real commercial state in each, not a foreign one', () => {
    // The trap the foreign-state rule could create: treating a name both specs
    // use as unknown, which would let a discovery-ready subject fall to the
    // bottom rung in either programme.
    const business = classifyBusinessState(businessInput('DISCOVERY_READY'));
    expect(business.state).toBe('QUALIFIED_OPPORTUNITY');
    expect(business.evidence.join(' ')).not.toContain('not one of this programme');

    const flotation = classifyFlotationState(flotationInput('DISCOVERY_READY'));
    expect(flotation.state).toBe('BUILD_QUALIFIED');
    expect(flotation.evidence.join(' ')).not.toContain('not one of this programme');
  });

  it('and each floors at its OWN rung rather than the rung the other programme uses', () => {
    expect(classifyBusinessState(businessInput('PROPOSAL_OR_PAYMENT_READY')).state).toBe('QUALIFIED_OPPORTUNITY');
    expect(classifyFlotationState(flotationInput('PROPOSAL_OR_PAYMENT_READY')).state).toBe('BUILD_QUALIFIED');
  });
});

describe("a state the machine cannot write can still ARRIVE — T307's L2", () => {
  it('a hand-edited SOLUTION_SCOPING floors at QUALIFIED_OPPORTUNITY', () => {
    // The business machine never writes this state, and a test in T307 proves
    // it. A human editing the table can still put it there, and the verifier
    // showed that dropping it from the commercial group would send such a
    // subject to the bottom rung with nothing noticing.
    const r = classifyBusinessState(businessInput('SOLUTION_SCOPING'));
    expect(r.state).toBe('QUALIFIED_OPPORTUNITY');
    expect(r.evidence.join(' ')).not.toContain('not one of this programme');
  });

  it('and a hand-edited SCOPE_IN_PROGRESS floors at BUILD_QUALIFIED', () => {
    const r = classifyFlotationState(flotationInput('SCOPE_IN_PROGRESS'));
    expect(r.state).toBe('BUILD_QUALIFIED');
    expect(r.evidence.join(' ')).not.toContain('not one of this programme');
  });
});

describe('the shared rule reports WHICH case it took', () => {
  const rule = {
    ladder: ['A', 'B', 'C'] as const,
    commercial: ['X', 'Y'] as const,
    terminal: 'Z' as const,
    floor: 'C' as const,
  };

  it('distinguishes a hold from a foreign previous state', () => {
    // Both keep the subject moving sensibly, but they are different facts and
    // the evidence string says which — so a reviewer can tell "we protected
    // earned knowledge" from "we did not recognise that value".
    expect(applyLadderMonotonicity('A', 'B', rule)).toEqual({ state: 'B', held: true, foreignPrevious: false });
    expect(applyLadderMonotonicity('A', 'WHATEVER', rule)).toEqual({ state: 'A', held: false, foreignPrevious: true });
  });

  it('a terminal previous state holds, and arriving at terminal never does', () => {
    expect(applyLadderMonotonicity('A', 'Z', rule)).toEqual({ state: 'Z', held: true, foreignPrevious: false });
    expect(applyLadderMonotonicity('Z', 'A', rule)).toEqual({ state: 'Z', held: false, foreignPrevious: false });
    // Terminal to terminal is not a "hold": nothing was refused.
    expect(applyLadderMonotonicity('Z', 'Z', rule)).toEqual({ state: 'Z', held: false, foreignPrevious: false });
  });

  it('a commercial previous state with an off-ladder candidate takes the candidate', () => {
    // The edge the business machine had before the extraction, preserved: a
    // commercial previous and a candidate that is on neither list.
    expect(applyLadderMonotonicity('Y', 'X', rule)).toEqual({ state: 'Y', held: false, foreignPrevious: false });
  });

  it('and the floor applies only below it', () => {
    expect(applyLadderMonotonicity('A', 'X', rule)).toEqual({ state: 'C', held: true, foreignPrevious: false });
    expect(applyLadderMonotonicity('C', 'X', rule)).toEqual({ state: 'C', held: false, foreignPrevious: false });
  });
});
