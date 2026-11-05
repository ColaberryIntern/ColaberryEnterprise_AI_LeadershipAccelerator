import {
  SEND_BACK_FIELDS,
  TOOL_REQUEST_VERBS,
  acceptToolRequestDecision,
  gateToolRequestDecision,
  statusAfter,
  type GateDecisionArgs,
} from '../toolRequestDecisionContract';

/**
 * AF11.3 — the four verbs, and every reason a decision is refused.
 *
 * ## The refusal this ticket was CORRECTED about, and the one that carries the weight
 *
 * The obvious answer is "refuse the four-hour timer", and the ticket's own correction says that
 * is necessary and **not sufficient**: `system:auto_approve_timeout` is already refused three
 * separate ways by `NON_HUMAN_APPROVER`, while the identity that actually walks through is
 * **`unknown`** — because `approvalRequestController` writes `req.admin?.email || 'unknown'` and
 * `isNonHumanIdentity('unknown')` returns FALSE.
 *
 * So the test that matters most here is not the timer one. It is `unknown`, and the empty roster
 * beside it, because both defeat a denylist-only check and neither looks like a machine.
 *
 * ## Two checks, deliberately independent
 *
 * `recordedHumans` establishes a real person; `approverSet` decides which of those may settle a
 * tool grant. They are asserted separately, because a later widening of the approver set must not
 * be able to let somebody approve their own request.
 */

const INTERN = 'qninying@gmail.com';
const ALI = 'ali@colaberry.com';

function args(over: Partial<GateDecisionArgs> = {}): GateDecisionArgs {
  return {
    proposed: { verb: 'approve_to_build' },
    decidedBy: ALI,
    requestKind: 'tool',
    requestStatus: 'submitted',
    proposedByIdentity: INTERN,
    recordedHumans: [ALI, INTERN],
    approverSet: [ALI],
    knownToolNames: ['read_attachments', 'create_tickets'],
    ...over,
  };
}

const rules = (a: GateDecisionArgs) => gateToolRequestDecision(a).map((i) => i.rule);

describe('the four verbs, and only those four', () => {
  it('accepts each of the four when everything it needs is present', () => {
    const complete: Record<string, Partial<GateDecisionArgs['proposed']>> = {
      approve_to_build: {},
      deny: { reason: 'The platform already does this through the cron registry.' },
      assign_existing_tool: { assigned_tool_name: 'read_attachments' },
      send_back: { missing_field: 'side_effects' },
    };
    for (const verb of TOOL_REQUEST_VERBS) {
      const out = acceptToolRequestDecision(args({ proposed: { verb, ...complete[verb] } }));
      expect(out.ok).toBe(true);
      expect(out.ok && out.decision.verb).toBe(verb);
    }
  });

  it('refuses anything that is not one of the four', () => {
    for (const verb of ['approve', 'reject', 'grant', 'APPROVE_TO_BUILD', '', null]) {
      expect(rules(args({ proposed: { verb } }))).toContain('verb_unknown');
    }
  });

  it('refuses these verbs on a CHANGE request, which is decided the way it always was', () => {
    expect(rules(args({ requestKind: 'change' }))).toContain('not_a_tool_request');
  });

  it('refuses a second decision on a request already decided', () => {
    for (const status of ['approved', 'declined', 'withdrawn']) {
      expect(rules(args({ requestStatus: status }))).toContain('request_already_decided');
    }
  });
});

describe('WHO MAY DECIDE: the denylist is the first of two gates, not the only one', () => {
  it('REFUSES `unknown`, which is the identity that actually walks through', () => {
    // The ticket's correction in one assertion. `isNonHumanIdentity('unknown')` returns false, so
    // a denylist-only check reads it as a person. The positive roster is what stops it.
    const out = rules(args({ decidedBy: 'unknown', approverSet: ['unknown'] }));
    expect(out).toContain('decider_not_recorded');
  });

  it('refuses the four-hour timer identity by name', () => {
    const out = rules(args({
      decidedBy: 'system:auto_approve_timeout',
      approverSet: ['system:auto_approve_timeout'],
      recordedHumans: [ALI, INTERN, 'system:auto_approve_timeout'],
    }));
    // Even ON the roster and ON the approver set, the machine shape refuses it.
    expect(out).toContain('decider_is_non_human');
  });

  it('refuses an EMPTY roster as its own reason, never as a pass', () => {
    // Absence is not acceptance. With no roster a denylist-only check would wave Ali through.
    const out = rules(args({ recordedHumans: [] }));
    expect(out).toContain('decider_roster_absent');
  });

  it('tells "a machine" apart from "a stranger", because the log is read by a person', () => {
    expect(rules(args({ decidedBy: 'someone@elsewhere.test', approverSet: ['someone@elsewhere.test'] })))
      .toContain('decider_not_recorded');
    expect(rules(args({ decidedBy: 'cron:nightly', approverSet: ['cron:nightly'] })))
      .toContain('decider_is_non_human');
  });
});

describe("ALI'S RULING: the approver set is configuration, and it is a separate check", () => {
  it('refuses a real, recorded person who is not an approver', () => {
    // Quincy is a real person on the roster. He still may not settle a tool grant.
    const out = rules(args({ decidedBy: INTERN, proposedByIdentity: 'someone.else@colaberry.com' }));
    expect(out).toContain('decider_not_an_approver');
    expect(out).not.toContain('decider_not_recorded');
  });

  it('refuses EVERYBODY when no approver is configured, rather than permitting anybody', () => {
    // The fail-open shape this subtree keeps finding: an empty list read as "no restriction".
    expect(rules(args({ approverSet: [] }))).toContain('decider_not_an_approver');
  });

  it('is configuration, so widening it is a setting rather than a rewrite', () => {
    const widened = rules(args({ decidedBy: INTERN, proposedByIdentity: 'x@y.test', approverSet: [ALI, INTERN] }));
    expect(widened).toEqual([]);
  });

  it('matches an approver case-insensitively, since an email is not case sensitive', () => {
    expect(rules(args({ decidedBy: 'Ali@Colaberry.COM', recordedHumans: ['Ali@Colaberry.COM', INTERN] })))
      .toEqual([]);
  });
});

describe('THE INTERN PROPOSES AND MUST NOT APPROVE, checked independently', () => {
  it('refuses the person who filed the request, even if they are an approver', () => {
    // Independent of the approver set ON PURPOSE: widening that set later must not quietly let
    // somebody approve their own request.
    const out = rules(args({
      decidedBy: INTERN,
      proposedByIdentity: INTERN,
      approverSet: [ALI, INTERN],
    }));
    expect(out).toContain('proposer_cannot_decide');
  });

  it('refuses them regardless of case', () => {
    const out = rules(args({
      decidedBy: 'QNinying@Gmail.com',
      proposedByIdentity: INTERN,
      approverSet: [ALI, 'qninying@gmail.com'],
      recordedHumans: ['QNinying@Gmail.com'],
    }));
    expect(out).toContain('proposer_cannot_decide');
  });

  it('allows Ali to decide a request somebody else filed, which is the normal case', () => {
    expect(rules(args())).toEqual([]);
  });
});

describe('what each verb requires in writing', () => {
  it('refuses a denial with no reason', () => {
    expect(rules(args({ proposed: { verb: 'deny' } }))).toContain('deny_reason_missing');
    expect(rules(args({ proposed: { verb: 'deny', reason: '   ' } }))).toContain('deny_reason_missing');
  });

  it('refuses a send-back that does not name a field', () => {
    expect(rules(args({ proposed: { verb: 'send_back' } }))).toContain('send_back_field_missing');
  });

  it('refuses a send-back naming something that is not a field of the request', () => {
    // Stops "send back for detail" degrading into "needs more detail".
    expect(rules(args({ proposed: { verb: 'send_back', missing_field: 'more detail please' } })))
      .toContain('send_back_field_unknown');
  });

  it('accepts a send-back naming any of the six AF11.1 groups', () => {
    for (const field of SEND_BACK_FIELDS) {
      expect(rules(args({ proposed: { verb: 'send_back', missing_field: field } }))).toEqual([]);
    }
  });

  it('refuses assigning a tool without naming one', () => {
    expect(rules(args({ proposed: { verb: 'assign_existing_tool' } })))
      .toContain('assigned_tool_missing');
  });

  it('refuses assigning a tool the catalog does not have', () => {
    // A tool cannot be created from this screen: registration is compiled into the backend, and a
    // console that implied otherwise would promise what the runtime cannot do.
    expect(rules(args({ proposed: { verb: 'assign_existing_tool', assigned_tool_name: 'invent_me' } })))
      .toContain('assigned_tool_unknown');
  });

  it('does not demand a reason from the verbs that do not need one', () => {
    expect(rules(args({ proposed: { verb: 'approve_to_build' } }))).toEqual([]);
    expect(rules(args({ proposed: { verb: 'assign_existing_tool', assigned_tool_name: 'create_tickets' } })))
      .toEqual([]);
  });

  it('reports EVERY reason at once rather than the first', () => {
    const out = rules(args({
      proposed: { verb: 'deny' },
      decidedBy: INTERN,
      proposedByIdentity: INTERN,
      requestStatus: 'approved',
      approverSet: [],
    }));
    expect(out).toEqual(expect.arrayContaining([
      'request_already_decided', 'decider_not_an_approver', 'proposer_cannot_decide',
      'deny_reason_missing',
    ]));
  });
});

describe('what a decision does to the request, and what it must never do', () => {
  it('leaves a sent-back request OPEN, because the intern is expected to edit it', () => {
    expect(statusAfter('send_back')).toBe('submitted');
  });

  it('closes a denial and opens the two approving verbs', () => {
    expect(statusAfter('deny')).toBe('declined');
    expect(statusAfter('approve_to_build')).toBe('approved');
    expect(statusAfter('assign_existing_tool')).toBe('approved');
  });

  it('CARRIES NO AUTONOMY LEVEL AND NO GRANT, so one click cannot be two decisions', () => {
    // The ticket's sharpest warning: a console that grants a tool and lifts an autonomy level in
    // one action means nobody separately decided the agent may act more freely.
    const out = acceptToolRequestDecision(args({
      proposed: { verb: 'assign_existing_tool', assigned_tool_name: 'read_attachments' },
    }));
    const body = JSON.stringify(out);
    for (const forbidden of ['autonomy', 'tools_granted', 'enabled', 'abac_mode_override', 'risk_tier']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('returns NO decision at all when it refuses, never a partial one', () => {
    const out = acceptToolRequestDecision(args({ proposed: { verb: 'deny' } }));
    expect(out.ok).toBe(false);
    expect(out).not.toHaveProperty('decision');
  });

  it('records the actor on every accepted decision', () => {
    for (const verb of TOOL_REQUEST_VERBS) {
      const proposed = {
        verb,
        reason: 'because',
        missing_field: 'purpose',
        assigned_tool_name: 'create_tickets',
      };
      const out = acceptToolRequestDecision(args({ proposed }));
      expect(out.ok && out.decision.decided_by_identity).toBe(ALI);
    }
  });

  it('keeps a field only for the verb that needs it', () => {
    const approve = acceptToolRequestDecision(args({
      proposed: { verb: 'approve_to_build', missing_field: 'purpose', assigned_tool_name: 'create_tickets' },
    }));
    expect(approve.ok && approve.decision.missing_field).toBeNull();
    expect(approve.ok && approve.decision.assigned_tool_name).toBeNull();
  });
});
