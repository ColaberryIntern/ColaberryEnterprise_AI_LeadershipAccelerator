import fs from 'fs';
import path from 'path';
import {
  allowedTransitions,
  canTransition,
  gateAgentChangeRequest,
  type AgentChangeRequestGateInput,
} from '../agentChangeRequest';

/**
 * AF4.2 - the change-request gate.
 *
 * Every refusal here carries a positive control, because a test that only ever sees the refusal
 * cannot tell a working guard from a function that refuses everything. The ticket asks for that
 * explicitly for the timer identity; it is worth the same for the rest.
 *
 * Two of these tests read the module's own SOURCE rather than calling it. That is not laziness, it
 * is the only way to assert the two properties that matter most:
 *
 *   - that there is no timer or threshold path to `approved` (you cannot test a path that does not
 *     exist, so the assertion has to be about absence), and
 *   - that the humanity guards are IMPORTED from `promotionIdentity` rather than copied, which a
 *     behavioural test cannot distinguish from a faithful copy that will later drift.
 */

const ROSTER = ['ali@colaberry.com', 'kes@colaberry.com'];

/** A complete, allowed approval. Every refusal test is this with one thing broken. */
const approval = (
  over: Partial<AgentChangeRequestGateInput> = {},
): AgentChangeRequestGateInput => ({
  status: 'submitted',
  targetStatus: 'approved',
  proposedBy: 'ruth@colaberry.com',
  approver: 'ali@colaberry.com',
  recordedHumanApprovers: ROSTER,
  ...over,
});

const rulesOf = (input: AgentChangeRequestGateInput): string[] =>
  gateAgentChangeRequest(input).map((i) => i.rule);

describe('the positive control, stated first', () => {
  it('ALLOWS a complete approval by a rostered human who did not file it', () => {
    // If this ever fails, every refusal test below becomes meaningless: a gate that refuses
    // everything passes all of them.
    expect(gateAgentChangeRequest(approval())).toEqual([]);
  });

  it('allows a decline that carries a reason', () => {
    expect(
      gateAgentChangeRequest(approval({ targetStatus: 'declined', declinedReason: 'Out of scope for this quarter.' })),
    ).toEqual([]);
  });

  it('allows an intern to withdraw their own request, with no approver at all', () => {
    // Withdrawal is the filer's own act. Requiring a decider for it would make an intern ask
    // permission to take back their own request.
    expect(
      gateAgentChangeRequest({ status: 'submitted', targetStatus: 'withdrawn', proposedBy: 'ruth@colaberry.com' }),
    ).toEqual([]);
  });
});

describe('transitions', () => {
  it('cannot re-decide a decided request', () => {
    // `approved` being terminal is what keeps "which human approved this" answerable.
    expect(allowedTransitions('approved')).toEqual([]);
    expect(allowedTransitions('declined')).toEqual([]);
    expect(canTransition('approved', 'declined')).toBe(false);
  });

  it('names what WAS allowed when it refuses, rather than just saying no', () => {
    const issues = gateAgentChangeRequest(approval({ status: 'approved' }));
    const illegal = issues.find((i) => i.rule === 'illegal_transition');
    expect(illegal?.detail).toContain('(none)');
  });

  it('reports every issue at once instead of stopping at the first', () => {
    // An intern fixing one problem per round trip is a worse experience than one list.
    const rules = rulesOf({ status: 'approved', targetStatus: 'approved', proposedBy: '', approver: 'system:auto_approve_timeout' });
    expect(rules).toContain('illegal_transition');
    expect(rules).toContain('proposer_not_recorded');
    expect(rules).toContain('approver_is_not_human');
  });
});

describe('DOOR 1 - a request with no named proposer is refused', () => {
  it('refuses an absent, empty or whitespace proposer', () => {
    for (const proposedBy of [null, undefined, '', '   ', '​']) {
      expect(rulesOf(approval({ proposedBy }))).toContain('proposer_not_recorded');
    }
  });

  it('checks the proposer at EVERY transition, not only at filing', () => {
    // A missing value compares unequal to everything, so letting it through at decision time is
    // what switched the self-approval defence off in the promotion path.
    expect(rulesOf(approval({ targetStatus: 'declined', declinedReason: 'no', proposedBy: '' })))
      .toContain('proposer_not_recorded');
    expect(rulesOf({ status: 'submitted', targetStatus: 'withdrawn', proposedBy: '' }))
      .toContain('proposer_not_recorded');
  });
});

describe('DOOR 2 - the four-hour timer cannot approve a change request', () => {
  it('THE TICKET CONSTRAINT: refuses system:auto_approve_timeout', () => {
    // The identity that wrote all 106 rows in approval_requests. The only identity that has ever
    // decided an approval in this system.
    expect(rulesOf(approval({ approver: 'system:auto_approve_timeout' })))
      .toContain('approver_is_not_human');
  });

  it('refuses it even when it is ALSO on the roster', () => {
    // A denylist that an allowlist can override is not a denylist. If the timer identity ever
    // reaches the roster by accident, this is the gate that still stops it.
    expect(rulesOf(approval({
      approver: 'system:auto_approve_timeout',
      recordedHumanApprovers: [...ROSTER, 'system:auto_approve_timeout'],
    }))).toContain('approver_is_not_human');
  });

  it('refuses the ten identities that walked through this gate before it was fixed', () => {
    // Verbatim from promotionIdentity.ts. 'auto-approval' is one letter off the real production
    // identity and the denylist alone does NOT catch it - the roster is what refuses it, which is
    // the whole argument for having two gates.
    const historical = [
      'auto-approval', 'approval_timer', '4-hour timer', 'timeout handler', 'the scheduler',
      'nightly cron', 'approvalTimeoutWorker', 'robot', 'daemon', 'Mallory',
    ];
    for (const approver of historical) {
      const rules = rulesOf(approval({ approver }));
      const refused = rules.includes('approver_is_not_human') || rules.includes('approver_not_a_recorded_human');
      expect(refused).toBe(true);
    }
  });

  it('refuses a blank approver without needing a rule of its own', () => {
    for (const approver of [null, undefined, '', '  ']) {
      expect(rulesOf(approval({ approver }))).toContain('approver_is_not_human');
    }
  });
});

describe('ABSENCE IS NOT APPROVAL - the roster half', () => {
  it('refuses when NO roster was supplied, rather than falling back to the denylist', () => {
    // The fourth instance of this mistake in this subsystem, per promotionIdentity.ts. A real
    // human with no roster must still be refused, or the allowlist is decorative.
    for (const recordedHumanApprovers of [null, undefined, [], ['', '  ']]) {
      expect(rulesOf(approval({ recordedHumanApprovers })))
        .toContain('approver_not_a_recorded_human');
    }
  });

  it("refuses a plausible human who is not on this domain's record", () => {
    expect(rulesOf(approval({ approver: 'stranger@example.com' })))
      .toContain('approver_not_a_recorded_human');
  });

  it('accepts a rostered human despite case and whitespace differences', () => {
    expect(gateAgentChangeRequest(approval({ approver: '  ALI@Colaberry.com ' }))).toEqual([]);
  });

  it('a zero-width character cannot smuggle an identity past the roster', () => {
    // U+200B has defeated exactly this comparison before, which is why norm() strips it first.
    expect(gateAgentChangeRequest(approval({ approver: 'ali@colaberry.com​' }))).toEqual([]);
    expect(rulesOf(approval({ approver: 'a​li@evil.example' })))
      .toContain('approver_not_a_recorded_human');
  });
});

describe('self-approval', () => {
  it('refuses an intern approving their own request', () => {
    expect(rulesOf(approval({ approver: 'ruth@colaberry.com', recordedHumanApprovers: ['ruth@colaberry.com'] })))
      .toContain('self_approved');
  });

  it('sees through a zero-width character inserted to make the two look different', () => {
    expect(rulesOf(approval({
      approver: 'ruth@colaberry.com​',
      recordedHumanApprovers: ['ruth@colaberry.com'],
    }))).toContain('self_approved');
  });

  it('does NOT refuse declining your own request, because withdrawing is the normal path', () => {
    expect(gateAgentChangeRequest(approval({
      targetStatus: 'declined',
      declinedReason: 'Changed my mind.',
      approver: 'ruth@colaberry.com',
      recordedHumanApprovers: ['ruth@colaberry.com'],
    }))).toEqual([]);
  });
});

describe('declining answers to the person who filed it', () => {
  it('refuses a decline with no reason', () => {
    for (const declinedReason of [null, undefined, '', '   ']) {
      expect(rulesOf(approval({ targetStatus: 'declined', declinedReason })))
        .toContain('declined_without_reason');
    }
  });

  it('does not demand a reason to APPROVE', () => {
    expect(rulesOf(approval({ declinedReason: null }))).not.toContain('declined_without_reason');
  });
});

/**
 * DOOR 3, closed by absence.
 *
 * The timer got into the promotion path three ways and the third was threshold acceptance. Here
 * there is no threshold path to close, so the assertion is that none was ever written. Without
 * this, someone adds a four-hour auto-approve next quarter and every test above still passes.
 */
describe('DOOR 3 - there is no timer or threshold path to approved', () => {
  const SOURCE_PATH = path.join(__dirname, '..', 'agentChangeRequest.ts');

  /** Comments discuss timers at length; only code counts. Block comments first, then line. */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const TIMER_CONSTRUCT =
    /\b(?:Date\.now|setTimeout|setInterval|elapsed[A-Za-z_]*|attempt_?count|threshold[A-Za-z_]*|expires_?at)\b|new\s+Date\b/i;

  it('the matcher can actually fail - positive control', () => {
    // A regex that matches nothing passes a structural test exactly as well as clean code does.
    // This is the control that tells the two apart.
    expect(TIMER_CONSTRUCT.test(stripComments('const ok = Date.now() - row.created_at > FOUR_HOURS;')))
      .toBe(true);
    expect(TIMER_CONSTRUCT.test(stripComments('if (attempt_count > 3) approve();'))).toBe(true);
    expect(TIMER_CONSTRUCT.test(stripComments('const t = setTimeout(approve, 1000);'))).toBe(true);
  });

  it('strips comments rather than being fooled by them, in both directions', () => {
    expect(TIMER_CONSTRUCT.test(stripComments('// we deliberately avoid Date.now() here'))).toBe(false);
    expect(TIMER_CONSTRUCT.test(stripComments('/* no threshold acceptance */'))).toBe(false);
    expect(TIMER_CONSTRUCT.test(stripComments('const x = 1; // fine\nconst y = Date.now();'))).toBe(true);
  });

  it('the gate module contains no such construct in its code', () => {
    const code = stripComments(fs.readFileSync(SOURCE_PATH, 'utf8'));
    expect(code).not.toMatch(TIMER_CONSTRUCT);
  });
});

/**
 * The humanity guards are IMPORTED, not copied.
 *
 * A behavioural test cannot tell an import from a faithful copy - both pass today, and only one of
 * them still passes after `promotionIdentity` is tightened. This subsystem has already paid for
 * that kind of drift four times, so the reuse itself is worth asserting.
 */
describe('the guards are reused rather than restated', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agentChangeRequest.ts'), 'utf8');

  it('imports isNonHumanIdentity, humanityCheck and norm from promotionIdentity', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bhumanityCheck\b[^}]*\}\s*from\s*'\.\/promotionIdentity'/);
    expect(source).toMatch(/import\s*\{[^}]*\bisNonHumanIdentity\b[^}]*\}\s*from\s*'\.\/promotionIdentity'/);
    expect(source).toMatch(/import\s*\{[^}]*\bnorm\b[^}]*\}\s*from\s*'\.\/promotionIdentity'/);
  });

  it('defines no identity regex of its own', () => {
    // A local copy of NON_HUMAN_APPROVER is the specific drift this guards against.
    expect(source).not.toMatch(/NON_HUMAN_APPROVER\s*=/);
    expect(source).not.toMatch(/\bsystem\|agent\|bot\b/);
  });
});
