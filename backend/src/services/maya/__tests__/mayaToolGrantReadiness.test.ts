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
 * -- THE FOUR THAT WERE OWED A CAPABILITY RECORD, AND NOW HAVE ONE (2026-11-15) --
 *
 * `send_document`, `draft_marketing_email`, `start_campus_tour` and `create_journey_handoff`
 * were required by no capability record in any of the eleven domain buckets, so the gate refused
 * them `tool_not_required_by_capability`: a grant records which capability a tool serves, and a
 * tool whose purpose no capability states would be granted for a purpose nobody wrote down.
 *
 * Four records were authored in `capabilities/admissions.json` and the four now answer
 * `capability_not_confirmed` like the other nine. What closed the gap was the writing, not the
 * wiring: each record states the business outcome, the workflow, the exceptions and the autonomy
 * ceiling, and cites the implementation it describes by file and line. Nothing here confirms
 * anything - all four ship `draft`, and `RECORDED_2026_11_15` below pins each tool to the record
 * that names it so a later edit cannot quietly detach them again.
 */

const MAYA_TOOLS_ALL = Object.keys(MAYA_TOOL_GOVERNANCE);

/** Tools whose capability is refused by name: no grant is wanted, so none is attempted. */
const REFUSED_TOOLS = MAYA_TOOLS_ALL
  .filter((t) => isRefusedCapability(MAYA_TOOL_GOVERNANCE[t].capability));

/**
 * The four that were owed a record, and the record each one is now required by. Held as a map
 * rather than a list because the useful assertion is not "a capability exists somewhere" but
 * "THIS tool is named by THAT record" - a list would still pass if all four were swept into one
 * catch-all capability, which is the shortcut this whole gate exists to refuse.
 */
const RECORDED_2026_11_15: Readonly<Record<string, string>> = Object.freeze({
  send_document: 'admissions.maya_document_dispatch_to_a_prospect',
  draft_marketing_email: 'admissions.maya_quoted_email_draft_for_approval',
  start_campus_tour: 'admissions.maya_campus_tour_offer',
  create_journey_handoff: 'admissions.maya_human_handoff_from_chat',
});

const EXPECT_CONFIRMATION_ONLY = MAYA_TOOLS_ALL
  .filter((t) => !REFUSED_TOOLS.includes(t));

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
 *
 * The Phase 2b scope fields (#4052) are part of that paperwork, held constant the same way: the
 * least dangerous environment, no dataset named, and no request cited (so no ceiling applies).
 * Their own gates are covered by `agentToolGrantContract`'s suite.
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
    environment: 'sandbox',
    datasets: [],
    knownDatasets: [],
  };
}

const rulesFor = (tool: string): string[] => {
  const verdict = acceptToolGrant(proposeGrant(tool));
  return verdict.ok ? [] : verdict.issues.map((i) => i.rule).sort();
};

describe('T11 the dry run is a real one', () => {
  it('CONTROL - covers every tool on both belts, and the two groups partition them', () => {
    expect(MAYA_TOOLS_ALL).toHaveLength(16);
    expect(REFUSED_TOOLS).toHaveLength(REFUSED_CAPABILITIES.length);
    expect([...REFUSED_TOOLS, ...EXPECT_CONFIRMATION_ONLY].sort())
      .toEqual([...MAYA_TOOLS_ALL].sort());
    // The four are no longer a group of their own; they are inside the thirteen.
    for (const tool of Object.keys(RECORDED_2026_11_15)) {
      expect(EXPECT_CONFIRMATION_ONLY).toContain(tool);
    }
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

  it('and that is thirteen of her sixteen tools', () => {
    expect(EXPECT_CONFIRMATION_ONLY).toHaveLength(13);
  });

  it('each of those thirteen is required by a capability that names it', () => {
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

describe('T11 the four that were owed a capability record', () => {
  /**
   * Why these four still need the capability held CONFIRMED in the proposal.
   *
   * The gate checks the tie between tool and capability only `if (issues.length === 0)`, and its
   * own comment says why: "telling somebody their tool is not required by a capability they have
   * not named, or that was rejected, is noise on top of the real refusal." So while every record
   * on disk is `draft`, all sixteen tools answer `capability_not_confirmed` and anything deeper
   * is invisible.
   *
   * Confirming the capability in the PROPOSAL only - never in the record on disk - is what makes
   * the deeper layer visible. It answers "and if Ali confirmed it tomorrow, would this grant go
   * through?" Before 2026-11-15 the answer for these four was no, because no capability required
   * them. It is now yes, and that is the whole of what the four new records changed.
   */
  const rulesWithCapabilityConfirmed = (tool: string): string[] => {
    const verdict = acceptToolGrant({ ...proposeGrant(tool), capabilityState: 'confirmed' });
    return verdict.ok ? [] : verdict.issues.map((i) => i.rule).sort();
  };

  it.each(Object.entries(RECORDED_2026_11_15))(
    '%s is required by %s, by name',
    (tool, capabilityId) => {
      const capability = capabilityRequiring(tool);
      expect({ tool, id: capability?.id ?? null }).toEqual({ tool, id: capabilityId });
      expect(capability!.tools).toContain(tool);
    },
  );

  it.each(Object.keys(RECORDED_2026_11_15).map((t) => [t]))(
    '%s is no longer refused tool_not_required_by_capability',
    (tool) => {
      expect(rulesWithCapabilityConfirmed(tool)).toEqual([]);
      expect(rulesFor(tool)).toEqual(['capability_not_confirmed']);
    },
  );

  it('CONTROL - a tool no record requires IS still refused, so the gate still bites', () => {
    // Without this, the four assertions above would pass just as well if the tie check had been
    // deleted. `zzz_unrecorded_tool` is required by no capability and never will be.
    const verdict = acceptToolGrant({
      ...proposeGrant('send_document'),
      capabilityState: 'confirmed',
      toolName: 'zzz_unrecorded_tool',
      registeredToolNames: [...registeredToolNames(), 'zzz_unrecorded_tool'],
    });
    // Narrowed the way the rest of this file narrows it: GrantVerdict only carries issues when
    // it is not ok, so reading them off the union directly does not typecheck.
    const rules = verdict.ok ? [] : verdict.issues.map((i) => i.rule);
    expect(verdict.ok).toBe(false);
    expect(rules).toContain('tool_not_required_by_capability');
  });

  it('their records ship draft, so nothing here confirmed anything', () => {
    // The one failure that would make this whole change illegitimate: a record authored as
    // `confirmed` would be a confirmation written on Ali's behalf.
    for (const [tool, capabilityId] of Object.entries(RECORDED_2026_11_15)) {
      const capability = capabilityRequiring(tool);
      expect({ capabilityId, state: capability?.state }).toEqual({ capabilityId, state: 'draft' });
    }
  });

  it('is registered, so no refusal is about existence', () => {
    for (const tool of Object.keys(RECORDED_2026_11_15)) {
      expect(registeredToolNames()).toContain(tool);
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
