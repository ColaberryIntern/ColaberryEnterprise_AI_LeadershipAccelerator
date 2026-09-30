const mockGetRoleCharter = jest.fn();
jest.mock('../../agentRoleCharterService', () => ({ getRoleCharter: (...a: any[]) => mockGetRoleCharter(...a) }));

const mockGetActiveReliabilityIssues = jest.fn();
jest.mock('../../metricReliabilityService', () => ({ getActiveReliabilityIssues: (...a: any[]) => mockGetActiveReliabilityIssues(...a) }));

import { buildRoleCharterBlock, buildReliabilityStateBlock } from '../agentContextLayers';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildRoleCharterBlock', () => {
  it('honesty path: no charter written yet returns an empty string, never a fabricated title/mission', async () => {
    mockGetRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: null });

    const block = await buildRoleCharterBlock('agent-1');

    expect(block).toBe('');
  });

  it('honesty path: a nonexistent agent (getRoleCharter returns null) degrades to empty, never throws', async () => {
    mockGetRoleCharter.mockResolvedValue(null);

    const block = await buildRoleCharterBlock('does-not-exist');

    expect(block).toBe('');
  });

  it('happy path: a real charter renders role title, mission, responsibilities, and KPIs', async () => {
    mockGetRoleCharter.mockResolvedValue({
      agentId: 'agent-1',
      charter: {
        roleTitle: 'Student Success Mentor',
        mission: 'Keep every pilot-cohort student engaged and unblocked.',
        responsibilities: ['Reply to student DMs', 'Run autonomous outreach on real risk signals'],
        kpis: ['Response time under 24h'],
        updatedByEmail: 'ali@colaberry.com',
        updatedAt: new Date(),
      },
    });

    const block = await buildRoleCharterBlock('agent-1');

    expect(block).toContain('ROLE CHARTER: You are the Student Success Mentor.');
    expect(block).toContain('Keep every pilot-cohort student engaged and unblocked.');
    expect(block).toContain('- Reply to student DMs');
    expect(block).toContain('- Response time under 24h');
  });

  it('boundary: empty responsibilities/kpis arrays render no section for either, never an empty header', async () => {
    mockGetRoleCharter.mockResolvedValue({
      agentId: 'agent-1',
      charter: { roleTitle: 'Mentor', mission: 'Help students.', responsibilities: [], kpis: [], updatedByEmail: 'a@b.com', updatedAt: new Date() },
    });

    const block = await buildRoleCharterBlock('agent-1');

    expect(block).not.toContain('Responsibilities:');
    expect(block).not.toContain('KPIs');
  });

  const baseCharter = {
    roleTitle: 'Mentor',
    mission: 'Help students.',
    responsibilities: ['Reply to DMs'],
    kpis: ['Response time'],
    updatedByEmail: 'a@b.com',
    updatedAt: new Date(),
    boundaries: ['Never message outside DM'],
    authorityAutonomous: ['Reply to inbound DMs'],
    authorityApprovalRequired: ['Outreach beyond the pilot cohort'],
    authorityForbidden: ['Promise a refund'],
    escalationPolicy: 'Escalate to Ali after 3 attempts.',
  };

  it('Product Phase 1, R4 hard stop: version null renders byte-identical to a charter with no version field at all, even when authority/boundary columns are populated', async () => {
    mockGetRoleCharter.mockResolvedValueOnce({ agentId: 'agent-1', charter: { ...baseCharter, version: null } });
    mockGetRoleCharter.mockResolvedValueOnce({ agentId: 'agent-1', charter: baseCharter });

    const withNullVersion = await buildRoleCharterBlock('agent-1');
    const withNoVersionField = await buildRoleCharterBlock('agent-1');

    expect(withNullVersion).toBe(withNoVersionField);
    expect(withNullVersion).not.toContain('Boundaries');
    expect(withNullVersion).not.toContain('Escalation policy');
  });

  it('Product Phase 1, R4: version 1 also renders the plain, pre-Phase-1 shape (only version >= 2 adds sections)', async () => {
    mockGetRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: { ...baseCharter, version: 1 } });

    const block = await buildRoleCharterBlock('agent-1');

    expect(block).not.toContain('Boundaries');
    expect(block).not.toContain('You may do these without asking first');
    expect(block).not.toContain('Escalation policy');
  });

  it('Product Phase 1, R4: version 2 renders boundaries, authority tiers, and escalation policy', async () => {
    mockGetRoleCharter.mockResolvedValue({ agentId: 'agent-1', charter: { ...baseCharter, version: 2 } });

    const block = await buildRoleCharterBlock('agent-1');

    expect(block).toContain('Boundaries (what you must not do):\n- Never message outside DM');
    expect(block).toContain('You may do these without asking first:\n- Reply to inbound DMs');
    expect(block).toContain('You need explicit human approval before these:\n- Outreach beyond the pilot cohort');
    expect(block).toContain('You must never do these:\n- Promise a refund');
    expect(block).toContain('Escalation policy: Escalate to Ali after 3 attempts.');
  });
});

describe('buildReliabilityStateBlock', () => {
  it('boundary: zero active issues is an explicit "all healthy" statement, never silence', async () => {
    mockGetActiveReliabilityIssues.mockResolvedValue([]);

    const block = await buildReliabilityStateBlock();

    expect(block).toBe('DATA RELIABILITY STATE: No data sources are currently flagged unreliable — all known sources are healthy.');
  });

  it('happy path: real active issues are listed with status and reason, never fabricated', async () => {
    mockGetActiveReliabilityIssues.mockResolvedValue([
      { sourceSystem: 'attendance', metricKey: 'attendance.*', status: 'quarantined', severity: 'high', reason: 'Attendance is broken.' },
    ]);

    const block = await buildReliabilityStateBlock();

    expect(block).toContain('DATA RELIABILITY STATE (do not trust or cite these sources until restored):');
    expect(block).toContain('- attendance (attendance.*): quarantined — Attendance is broken.');
  });

  it('multiple real issues are all listed', async () => {
    mockGetActiveReliabilityIssues.mockResolvedValue([
      { sourceSystem: 'attendance', metricKey: 'attendance.*', status: 'quarantined', severity: 'high', reason: 'x' },
      { sourceSystem: 'timeline', metricKey: 'timeline.*', status: 'degraded', severity: 'low', reason: 'y' },
    ]);

    const block = await buildReliabilityStateBlock();

    expect(block).toContain('attendance (attendance.*): quarantined');
    expect(block).toContain('timeline (timeline.*): degraded');
  });
});
