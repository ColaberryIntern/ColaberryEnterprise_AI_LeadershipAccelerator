/**
 * Tests for the per-agent tool governance report (Agent Tools, Phase 1).
 *
 * WHAT THESE PIN. The report exists to show three specific disagreements between what the
 * runtime holds, what the grant ledger records, and what a capability says it requires. A report
 * that quietly reconciled them would be worse than no report, because it would make an
 * ungoverned fleet look governed. Measured in production on 2026-11-11:
 * `agent_domain_tool_grants` held 0 rows while 31 agents held 136 tools, so the all-held-none-
 * granted case below is not hypothetical, it is every agent today.
 *
 * The models and the capability loader are mocked so this stays a unit test with no database and
 * no file reads.
 */
export {};

const agentHolder: { current: Record<string, unknown> | null } = { current: null };
const grantsHolder: { current: Array<Record<string, unknown>> } = { current: [] };
const capabilitiesHolder: { current: Array<Record<string, unknown>> } = { current: [] };

jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async () => agentHolder.current) },
}));

jest.mock('../../../models/AgentDomainToolGrant', () => ({
  __esModule: true,
  default: { findAll: jest.fn(async () => grantsHolder.current) },
}));

jest.mock('../../agentDomain/capabilityRecord', () => ({
  __esModule: true,
  allCapabilities: jest.fn(() => capabilitiesHolder.current),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildAgentToolGovernance, describePosture } = require('../agentToolGovernanceService');

function givenAgent(tools: string[], name = 'Maya') {
  agentHolder.current = { id: 'agent-1', agent_name: name, tools_granted: tools };
}

function givenGrant(toolName: string, capabilityId: string | null, extra: Record<string, unknown> = {}) {
  grantsHolder.current.push({
    tool_name: toolName,
    capability_id: capabilityId,
    approved_by_identity: 'ali@colaberry.com',
    approved_at: new Date('2026-11-11T12:00:00.000Z'),
    ...extra,
  });
}

function givenCapability(id: string, requiredTools: string[], name = 'Some capability') {
  capabilitiesHolder.current.push({ capability_id: id, name, required_tools: requiredTools });
}

const rowFor = (report: any, tool: string) => report.rows.find((r: any) => r.toolName === tool);

beforeEach(() => {
  agentHolder.current = null;
  grantsHolder.current = [];
  capabilitiesHolder.current = [];
  jest.clearAllMocks();
});

describe('the ungoverned fleet is reported as ungoverned', () => {
  it('reports every held tool as held-without-grant when the ledger is empty', async () => {
    // This is production on 2026-11-11: tools held, zero grant rows.
    givenAgent(['capture_lead_details', 'send_sms_summary']);

    const report = await buildAgentToolGovernance('agent-1');

    expect(report.summary.held).toBe(2);
    expect(report.summary.granted).toBe(0);
    expect(report.summary.heldWithoutGrant).toBe(2);
    expect(report.summary.clean).toBe(0);
  });

  it('refuses to call an agent governed when nothing was ever granted', async () => {
    givenAgent(['capture_lead_details']);

    const report = await buildAgentToolGovernance('agent-1');

    expect(report.posture).toContain('without a grant record');
    expect(report.posture).not.toMatch(/\bgoverned\b/i);
  });

  it('says so plainly when the agent holds nothing at all', async () => {
    givenAgent([]);

    const report = await buildAgentToolGovernance('agent-1');

    expect(report.rows).toHaveLength(0);
    expect(report.posture).toContain('holds no tools');
  });
});

describe('the three disagreements it exists to surface', () => {
  it('flags a grant that never reached the runtime', async () => {
    // Approved on the record, absent from tools_granted: the approval did not take effect.
    givenAgent([]);
    givenGrant('send_document', 'admissions.deliver_docs');
    givenCapability('admissions.deliver_docs', ['send_document']);

    const report = await buildAgentToolGovernance('agent-1');
    const row = rowFor(report, 'send_document');

    expect(row.granted).toBe(true);
    expect(row.held).toBe(false);
    expect(report.summary.grantedWithoutHolding).toBe(1);
    expect(row.findings.join(' ')).toContain('never took effect');
  });

  it('flags a grant whose capability does not require that tool', async () => {
    // The rule that does not exist in the grant contract yet. Reported here so the backfill has
    // a worklist before the rule starts refusing people.
    givenAgent(['initiate_voice_call']);
    givenGrant('initiate_voice_call', 'admissions.deliver_docs');
    givenCapability('admissions.deliver_docs', ['send_document']);

    const report = await buildAgentToolGovernance('agent-1');
    const row = rowFor(report, 'initiate_voice_call');

    expect(row.capabilityRequiresThisTool).toBe(false);
    expect(report.summary.capabilityMismatch).toBe(1);
    expect(row.findings.join(' ')).toContain('does not list this tool');
  });

  it('flags a grant citing a capability that does not exist', async () => {
    givenAgent(['retrieve_knowledge']);
    givenGrant('retrieve_knowledge', 'admissions.nope');

    const report = await buildAgentToolGovernance('agent-1');
    const row = rowFor(report, 'retrieve_knowledge');

    expect(row.capabilityName).toBeNull();
    expect(report.summary.capabilityUnknown).toBe(1);
    expect(row.findings.join(' ')).toContain('matches no capability record');
  });

  it('distinguishes "no capability to check" from "capability says no"', async () => {
    // null and false mean different things and collapsing them would hide the mismatch.
    givenAgent(['a_tool', 'b_tool']);
    givenGrant('a_tool', null);
    givenGrant('b_tool', 'known.cap');
    givenCapability('known.cap', ['something_else']);

    const report = await buildAgentToolGovernance('agent-1');

    expect(rowFor(report, 'a_tool').capabilityRequiresThisTool).toBeNull();
    expect(rowFor(report, 'b_tool').capabilityRequiresThisTool).toBe(false);
    expect(rowFor(report, 'a_tool').findings.join(' ')).toContain('no capability');
  });
});

describe('a fully governed tool reports clean', () => {
  it('records the approver and the capability it serves', async () => {
    givenAgent(['send_document']);
    givenGrant('send_document', 'admissions.deliver_docs');
    givenCapability('admissions.deliver_docs', ['send_document'], 'Deliver requested documents');

    const report = await buildAgentToolGovernance('agent-1');
    const row = rowFor(report, 'send_document');

    expect(row.findings).toEqual([]);
    expect(row.capabilityName).toBe('Deliver requested documents');
    expect(row.capabilityDomain).toBe('admissions');
    expect(row.approvedByIdentity).toBe('ali@colaberry.com');
    expect(row.approvedAt).toBe('2026-11-11T12:00:00.000Z');
    expect(report.summary.clean).toBe(1);
    expect(report.posture).toContain('granted on the record');
  });
});

describe('report mechanics', () => {
  it('returns null rather than throwing for an agent that does not exist', async () => {
    agentHolder.current = null;
    await expect(buildAgentToolGovernance('nope')).resolves.toBeNull();
  });

  it('takes the union of held and granted, so neither side can hide a tool', async () => {
    givenAgent(['held_only']);
    givenGrant('granted_only', null);

    const report = await buildAgentToolGovernance('agent-1');

    expect(report.rows.map((r: any) => r.toolName)).toEqual(['granted_only', 'held_only']);
  });

  it('ignores junk entries in tools_granted rather than rendering blank rows', async () => {
    agentHolder.current = { id: 'agent-1', agent_name: 'Maya', tools_granted: ['ok', '', '   ', 42, null] };

    const report = await buildAgentToolGovernance('agent-1');

    expect(report.rows.map((r: any) => r.toolName)).toEqual(['ok']);
  });

  it('survives tools_granted being absent entirely', async () => {
    agentHolder.current = { id: 'agent-1', agent_name: 'Maya' };

    const report = await buildAgentToolGovernance('agent-1');

    expect(report.rows).toHaveLength(0);
  });
});

describe('the posture sentence is derived, not asserted', () => {
  it('names each problem it found', () => {
    const line = describePosture({
      held: 10, granted: 4, heldWithoutGrant: 6, grantedWithoutHolding: 1,
      capabilityMismatch: 2, capabilityUnknown: 0, clean: 1,
    });
    expect(line).toContain('6 held without a grant');
    expect(line).toContain('1 granted but not in effect');
    expect(line).toContain('2 tied to a capability that does not require them');
  });

  it('only claims everything is tied when nothing is outstanding', () => {
    const line = describePosture({
      held: 3, granted: 3, heldWithoutGrant: 0, grantedWithoutHolding: 0,
      capabilityMismatch: 0, capabilityUnknown: 0, clean: 3,
    });
    expect(line).toContain('tied to a capability');
  });
});
