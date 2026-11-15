import { acceptToolGrant, type ProposedGrant } from '../../agentDomain/agentToolGrantContract';
import { allCapabilities } from '../../agentDomain/capabilityRecord';
import { registeredToolNames } from '../../agentDomain/registeredTools';
import { MAYA_TOOL_GOVERNANCE } from '../mayaToolGovernance';
import { REFUSED_CAPABILITIES, isRefusedCapability } from '../mayaPromotion';

/**
 * T11 - THE DRY RUN. For every tool on Maya's belts, how far does a grant get?
 *
 * -- WHY THIS IS THE USEFUL TEST --
 *
 * `agent_domain_tool_grants` holds zero rows across all 31 agents, and before this run nobody
 * had established WHY. "The spine has never been used" was the finding on record, which is a
 * description, not a cause. This test produces the cause, per tool, as a refusal class.
 *
 * The expected end state is deliberately NOT "every tool grants". It is "the only thing still
 * standing between each tool and a grant is a human decision" - `capability_not_confirmed`,
 * which is Ali's click and must not be automated away. A test that got to `ok: true` would mean
 * this run had confirmed capabilities on his behalf.
 *
 * -- THE FOUR TOOLS THAT CANNOT GET THERE, AND WHY THAT IS NOT A BUG HERE --
 *
 * Four of her tools are required by no capability record in any of the eleven domain buckets:
 * `send_document`, `draft_marketing_email`, `start_campus_tour` and `create_journey_handoff`.
 * The gate refuses them `tool_not_required_by_capability`, and that refusal is CORRECT: a grant
 * records which capability a tool serves, so a tool whose purpose no capability states would be
 * granted for a purpose nobody wrote down.
 *
 * Closing it means authoring four capability records - business outcome, workflow, exceptions,
 * autonomy rationale, the researched evidence the other 47 admissions capabilities carry. That
 * is domain research, not wiring, and inventing it to make a test go green would put fabricated
 * governance data in the file the ladder, the prompts and the command center all read. So the
 * four are PINNED here with the reason, and the gap is reported rather than papered over.
 */

const MAYA_TOOLS_ALL = Object.keys(MAYA_TOOL_GOVERNANCE);

/** Tools whose capability is refused by name: no grant is wanted, so none is attempted. */
const REFUSED_TOOLS = MAYA_TOOLS_ALL
  .filter((t) => isRefusedCapability(MAYA_TOOL_GOVERNANCE[t].capability));

/** Tools no capability record requires yet. Each one is owed a capability record. */
const AWAITING_A_CAPABILITY_RECORD = [
  'create_journey_handoff',
  'draft_marketing_email',
  'send_document',
  'start_campus_tour',
];

const EXPECT_CONFIRMATION_ONLY = MAYA_TOOLS_ALL
  .filter((t) => !REFUSED_TOOLS.includes(t))
  .filter((t) => !AWAITING_A_CAPABILITY_RECORD.includes(t));

/** Which capability record, if any, requires this tool. */
function capabilityRequiring(tool: string): { id: string; state: string | null; tools: string[] } | null {
  for (const c of allCapabilities()) {
    const required = (c.required_tools ?? []) as string[];
    if (required.includes(tool)) {
      return { id: c.capability_id, state: c.requirement_validation_state ?? null, tools: required };
    }
  }
  return null;
}

/**
 * Everything the gate needs, assembled the way `agentToolGrantService` assembles it, with ONE
 * deliberate substitution: the approver is Ali and he is a recorded human. The approver gates
 * are covered by `agentToolGrantContract`'s own suite; holding them constant here is what makes
 * the remaining refusal attributable to the capability rather than to the paperwork.
 */
function proposeGrant(tool: string): ProposedGrant {
  const capability = capabilityRequiring(tool);
  return {
    agent: { id: 'maya-agent-id', agentName: 'Maya', toolsGranted: [] },
    toolName: tool,
    capabilityId: capability?.id ?? 'admissions.maya_applicant_chat_response',
    capabilityState: (capability?.state ?? 'draft') as never,
    approvedBy: 'ali@colaberry.com',
    recordedHumans: ['ali@colaberry.com'],
    approvers: ['ali@colaberry.com'],
    proposedBy: 'claude-code',
    registeredToolNames: registeredToolNames(),
    capabilityRequiredTools: capability?.tools ?? [],
  };
}

const rulesFor = (tool: string): string[] => {
  const verdict = acceptToolGrant(proposeGrant(tool));
  return verdict.ok ? [] : verdict.issues.map((i) => i.rule).sort();
};

describe('T11 the dry run is a real one', () => {
  it('CONTROL - covers every tool on both belts, and the three groups partition them', () => {
    expect(MAYA_TOOLS_ALL).toHaveLength(16);
    expect(REFUSED_TOOLS).toHaveLength(REFUSED_CAPABILITIES.length);
    expect([
      ...REFUSED_TOOLS, ...AWAITING_A_CAPABILITY_RECORD, ...EXPECT_CONFIRMATION_ONLY,
    ].sort()).toEqual([...MAYA_TOOLS_ALL].sort());
  });

  it('CONTROL - the capability records load, so a null read is not mistaken for a clean pass', () => {
    expect(allCapabilities().length).toBeGreaterThan(100);
  });
});

describe('T11 the ONLY thing left is a human confirmation', () => {
  it.each(EXPECT_CONFIRMATION_ONLY.map((t) => [t]))(
    '%s is refused only for capability_not_confirmed',
    (tool) => {
      // If this ever returns `[]`, a capability was confirmed without Ali, which is the one
      // thing this run must not do. If it returns anything else, the wiring regressed.
      expect(rulesFor(tool)).toEqual(['capability_not_confirmed']);
    },
  );

  it('and that is nine of her sixteen tools', () => {
    expect(EXPECT_CONFIRMATION_ONLY).toHaveLength(9);
  });

  it('each of those nine is required by a capability that names it', () => {
    for (const tool of EXPECT_CONFIRMATION_ONLY) {
      const capability = capabilityRequiring(tool);
      expect({ tool, found: capability !== null }).toEqual({ tool, found: true });
      expect(capability!.tools).toContain(tool);
    }
  });

  it('none of them is refused tool_not_registered any more, which was the original cause', () => {
    for (const tool of EXPECT_CONFIRMATION_ONLY) {
      expect(rulesFor(tool)).not.toContain('tool_not_registered');
    }
  });
});

describe('T11 the four tools still owed a capability record', () => {
  /**
   * These four need the capability held CONFIRMED to show what is really blocking them.
   *
   * The gate checks the tie between tool and capability only `if (issues.length === 0)`, and its
   * own comment says why: "telling somebody their tool is not required by a capability they have
   * not named, or that was rejected, is noise on top of the real refusal." So while every Maya
   * capability is `draft`, all sixteen tools answer `capability_not_confirmed` and the second,
   * deeper problem is invisible.
   *
   * Confirming the capability in the PROPOSAL only - not in the record on disk - is what makes
   * it visible: it answers "and if Ali confirmed it tomorrow, would this grant go through?" For
   * nine tools the answer is yes. For these four it is still no, and this is the test that says
   * so before he spends a click finding out.
   */
  const rulesWithCapabilityConfirmed = (tool: string): string[] => {
    const verdict = acceptToolGrant({ ...proposeGrant(tool), capabilityState: 'confirmed' });
    return verdict.ok ? [] : verdict.issues.map((i) => i.rule).sort();
  };

  it.each(AWAITING_A_CAPABILITY_RECORD.map((t) => [t]))(
    '%s is still refused tool_not_required_by_capability even once a capability is confirmed',
    (tool) => {
      expect(rulesWithCapabilityConfirmed(tool)).toEqual(['tool_not_required_by_capability']);
    },
  );

  it('CONTROL - the same confirmation DOES clear the other nine', () => {
    // Without this, the four assertions above could be passing because confirming a capability
    // in the proposal does nothing at all.
    for (const tool of EXPECT_CONFIRMATION_ONLY) {
      expect({ tool, rules: rulesWithCapabilityConfirmed(tool) }).toEqual({ tool, rules: [] });
    }
  });

  it('is registered, so the refusal is about PURPOSE and not about existence', () => {
    // The distinction matters for whoever picks this up: these four are implemented and
    // compiled. What is missing is a written statement of what they are for.
    for (const tool of AWAITING_A_CAPABILITY_RECORD) {
      expect(registeredToolNames()).toContain(tool);
    }
  });

  it('and no capability in ANY of the eleven buckets requires them', () => {
    for (const tool of AWAITING_A_CAPABILITY_RECORD) {
      expect({ tool, capability: capabilityRequiring(tool) }).toEqual({ tool, capability: null });
    }
  });
});

describe('T11 a refused capability is never proposed for a grant', () => {
  it.each(REFUSED_TOOLS.map((t) => [t]))('%s wants no grant at all', (tool) => {
    // SMS, voice and campaign enrolment resolve `off` by refusal, not by default. Filing a
    // grant request for one would be asking Ali to approve a tool that cannot run whatever he
    // decides, which is worse than noise: it would read as though approving it changed
    // something.
    expect(isRefusedCapability(MAYA_TOOL_GOVERNANCE[tool].capability)).toBe(true);
  });

  it('pins the three by name, so a fourth cannot join them silently', () => {
    expect([...REFUSED_TOOLS].sort())
      .toEqual(['enroll_in_campaign', 'initiate_voice_call', 'send_sms_summary']);
  });
});
