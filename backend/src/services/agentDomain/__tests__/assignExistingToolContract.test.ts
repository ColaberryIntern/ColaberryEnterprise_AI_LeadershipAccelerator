/**
 * AF11.4 — is there a decision to carry out, and is this the person who made it.
 *
 * The gate is pure, so every refusal is driven both ways here without a database. Positive
 * controls first, because a gate that refuses everything passes a suite of refusal tests exactly
 * as well as a correct one does.
 *
 * ## What is deliberately NOT asserted in this file
 *
 * Nothing about who may approve a grant. That is AF3.5's contract — a recorded human, a
 * configured approver, not the proposer — and the ticket says not to invent a second notion of
 * it. If an assertion about an approver roster appeared here, this gate would have grown a
 * second opinion about the same question, and two gates that can disagree about who may grant
 * are worse than one.
 */

import {
  acceptAssignment,
  gateAssignment,
  latestAssignment,
  type ProposedAssignment,
  type RecordedDecisionRow,
} from '../assignExistingToolContract';

const ALI = 'ali@colaberry.com';
const INTERN = 'mihretnetsereab@gmail.com';
const AGENT = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';

function decision(over: Partial<RecordedDecisionRow> = {}): RecordedDecisionRow {
  return {
    verb: 'assign_existing_tool',
    decided_by_identity: ALI,
    decided_at: '2026-11-06T12:00:00.000Z',
    assigned_tool_name: 'send_email',
    ...over,
  };
}

function proposed(over: Partial<ProposedAssignment> = {}): ProposedAssignment {
  return {
    changeRequestId: REQUEST,
    requestKind: 'tool',
    requestedByIdentity: INTERN,
    detail: { agentId: AGENT, capabilityId: 'marketing.CAP.outreach' },
    decisions: [decision()],
    calledBy: ALI,
    ...over,
  };
}

function rules(p: ProposedAssignment): string[] {
  return gateAssignment(p).map((i) => i.rule);
}

describe('POSITIVE CONTROL — a complete assignment is accepted', () => {
  it('carries the tool from the DECISION and the agent from the REQUEST', () => {
    const verdict = acceptAssignment(proposed());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.assignment).toEqual({
      changeRequestId: REQUEST,
      agentId: AGENT,
      capabilityId: 'marketing.CAP.outreach',
      toolName: 'send_email',
      approvedBy: ALI,
      proposedBy: INTERN,
      decidedAt: '2026-11-06T12:00:00.000Z',
    });
  });

  it('the accepted object CANNOT express an autonomy level, an enabled flag or a tool list', () => {
    // The real protection is structural: a value that could carry one of these is one refactor
    // away from carrying it into the write. `toEqual` above already pins the shape; this says
    // out loud which keys must never appear, so adding one fails here with its own sentence.
    const verdict = acceptAssignment(proposed());
    if (!verdict.ok) throw new Error('fixture should be accepted');
    const keys = Object.keys(verdict.assignment);
    for (const forbidden of ['autonomyLevel', 'autonomy_level', 'enabled', 'toolsGranted',
      'tools_granted', 'abacMode', 'abac_mode_override', 'verdict', 'riskTier']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('the approver and the proposer are different people, which is what AF3.5 then checks', () => {
    // This gate does not judge it. It carries both through so the grant CAN judge it, and that
    // pass-through is the thing worth pinning: drop `proposedBy` and the grant loses its
    // "the proposer does not approve their own grant" check without any test going red.
    const verdict = acceptAssignment(proposed());
    if (!verdict.ok) throw new Error('fixture should be accepted');
    expect(verdict.assignment.approvedBy).toBe(ALI);
    expect(verdict.assignment.proposedBy).toBe(INTERN);
  });
});

describe('there has to be a decision, and it has to name a tool', () => {
  it('refuses a request nobody has decided to assign a tool on', () => {
    expect(rules(proposed({ decisions: [] }))).toEqual(['no_assignment_decision']);
  });

  it('refuses when the only decisions are other verbs', () => {
    const others = [
      decision({ verb: 'send_back', assigned_tool_name: null }),
      decision({ verb: 'approve_to_build', assigned_tool_name: null }),
      decision({ verb: 'deny', assigned_tool_name: null }),
    ];
    expect(rules(proposed({ decisions: others }))).toEqual(['no_assignment_decision']);
  });

  it('refuses an assignment decision that names no tool', () => {
    // AF11.3's contract makes this unreachable through the console. A row written before that
    // contract existed, by a migration, or by hand, is not unreachable — and this step would
    // otherwise hand an empty tool name to the grant, which refuses it in a different
    // vocabulary further away from the person reading it.
    expect(rules(proposed({ decisions: [decision({ assigned_tool_name: null })] })))
      .toEqual(['assignment_names_no_tool']);
    expect(rules(proposed({ decisions: [decision({ assigned_tool_name: '   ' })] })))
      .toEqual(['assignment_names_no_tool']);
  });
});

describe('the person carrying it out is the person who decided it', () => {
  it('refuses a different human, however senior', () => {
    const issues = gateAssignment(proposed({ calledBy: 'ram@colaberry.com' }));
    expect(issues.map((i) => i.rule)).toEqual(['caller_is_not_the_decider']);
    // The sentence names BOTH people, because "you did not decide this" without saying who did
    // leaves the reader with no next step.
    expect(issues[0].detail).toContain('ram@colaberry.com');
    expect(issues[0].detail).toContain(ALI);
  });

  it('refuses an empty caller rather than reading it as a match', () => {
    // The controller passes the token's identity through INCLUDING empty, on purpose. An empty
    // caller must never satisfy a comparison — and it would, against a decision row whose
    // `decided_by_identity` was also empty, if this compared the two without requiring a value.
    expect(rules(proposed({ calledBy: '' }))).toEqual(['caller_is_not_the_decider']);
    expect(rules(proposed({
      calledBy: '',
      decisions: [decision({ decided_by_identity: '' })],
    }))).toEqual(['caller_is_not_the_decider']);
  });

  it('accepts the same person written in a different case', () => {
    // Email identities arrive from a JWT and from a hand-typed roster, and they disagree about
    // case constantly. Refusing on case alone would read to Ali as "you did not decide this"
    // about a decision he had just made.
    expect(rules(proposed({ calledBy: 'Ali@Colaberry.COM' }))).toEqual([]);
  });
});

describe('the request has to be the kind of thing a tool grant can answer', () => {
  it('refuses a change request', () => {
    expect(rules(proposed({ requestKind: 'change' }))).toContain('not_a_tool_request');
  });

  it('refuses a request with no detail row — no agent, no capability, nothing to grant', () => {
    expect(rules(proposed({ detail: null }))).toEqual(['request_details_missing']);
  });

  it('refuses a detail row with no agent, and says so separately from the capability', () => {
    expect(rules(proposed({ detail: { agentId: '', capabilityId: 'c1' } })))
      .toEqual(['request_names_no_agent']);
    expect(rules(proposed({ detail: { agentId: AGENT, capabilityId: '  ' } })))
      .toEqual(['request_names_no_capability']);
  });
});

describe('every reason, not the first', () => {
  it('reports all four when all four apply', () => {
    // A caller who fixes one problem, resubmits and meets a second has been told half the truth.
    const issues = rules(proposed({
      requestKind: 'change',
      detail: null,
      decisions: [],
      calledBy: 'someone@else.com',
    }));
    expect(issues.sort()).toEqual([
      'no_assignment_decision',
      'not_a_tool_request',
      'request_details_missing',
    ]);
    // `caller_is_not_the_decider` is absent on purpose: with no decision there is nobody to
    // compare the caller to, and inventing a refusal about a decision that does not exist would
    // send the reader to fix the wrong thing.
    expect(issues).not.toContain('caller_is_not_the_decider');
  });

  it('acceptAssignment returns the issues and NO assignment when anything is wrong', () => {
    const verdict = acceptAssignment(proposed({ decisions: [] }));
    expect(verdict.ok).toBe(false);
    expect(verdict).not.toHaveProperty('assignment');
  });
});

describe('latestAssignment — which decision is carried out', () => {
  it('takes the most recent assignment, not the first', () => {
    // `send_back` leaves a request `submitted`, so a history of send-backs followed by an
    // assignment is ordinary. Two assignments is not, but if the data ever holds two the newest
    // is the one that stands, and a reader of the ledger should not have to guess which.
    const rows = [
      decision({ decided_at: '2026-11-01T00:00:00.000Z', assigned_tool_name: 'read_attachments' }),
      decision({ verb: 'send_back', decided_at: '2026-11-02T00:00:00.000Z' }),
      decision({ decided_at: '2026-11-05T00:00:00.000Z', assigned_tool_name: 'send_email' }),
    ];
    expect(latestAssignment(rows)?.assigned_tool_name).toBe('send_email');
  });

  it('returns null when no row is an assignment', () => {
    expect(latestAssignment([decision({ verb: 'deny' })])).toBeNull();
    expect(latestAssignment([])).toBeNull();
  });

  it('does not fall over on an unparseable timestamp', () => {
    // `Date.parse` of rubbish is NaN and every comparison with NaN is false, so the reduce keeps
    // its accumulator. The guarantee worth having is that it returns SOMETHING rather than
    // throwing on data nobody validated.
    const rows = [decision({ decided_at: 'not a date' }), decision({ decided_at: 'also not' })];
    expect(latestAssignment(rows)).not.toBeNull();
  });
});
