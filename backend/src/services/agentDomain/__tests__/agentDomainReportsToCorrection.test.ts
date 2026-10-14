/**
 * T16 — the agent with no accountable human, corrected through the real write path.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * The database and the write service are mocked so the SERVICE PATH is exercised with a human
 * target, and so the two things that actually need proving can be proven: that a non-existent
 * `org_members` id is refused before the service is reached, and that the three preserved columns
 * are compared in a way that can fail.
 */

const mockQuery = jest.fn();
const mockSetAgentReportsTo = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => mockQuery(...a) },
}));
jest.mock('../../workforce/agentReportsToService', () => ({
  setAgentReportsTo: (...a: unknown[]) => mockSetAgentReportsTo(...a),
}));

import {
  TARGET_AGENT_NAME,
  MARKETING_MANAGER_ORG_MEMBER_ID,
  PRESERVED_COLUMNS,
  EXCLUDED_FROM_COMPARISON,
  OrgMemberNotFoundError,
  PreservedColumnChangedError,
  assertOrgMemberExists,
  changedPreservedColumns,
  correctDeptCampaignPerformanceReportsTo,
  type AgentRowSnapshot,
} from '../agentDomainReportsToCorrection';

/** T01's measured baseline for this row, used as the `before` state. */
const BASELINE: AgentRowSnapshot & { id: string } = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  enabled: true,
  autonomy_level: 'observe',
  tools_granted: [],
  reports_to_type: null,
  reports_to_id: null,
};

const CORRECTED: AgentRowSnapshot & { id: string } = {
  ...BASELINE,
  reports_to_type: 'human',
  reports_to_id: MARKETING_MANAGER_ORG_MEMBER_ID,
};

function wireHappyPath(after = CORRECTED): void {
  mockQuery.mockReset();
  mockSetAgentReportsTo.mockReset();
  // org_members lookup, then the before snapshot, then the after snapshot.
  mockQuery
    .mockResolvedValueOnce([{ id: MARKETING_MANAGER_ORG_MEMBER_ID }])
    .mockResolvedValueOnce([BASELINE])
    .mockResolvedValueOnce([after]);
  mockSetAgentReportsTo.mockResolvedValue({
    agentId: BASELINE.id, agentName: TARGET_AGENT_NAME, found: true, updated: true,
    reportsTo: null, setAt: new Date(0), setBy: 'ali@colaberry.com', error: null,
  });
}

// ─────────────────────── the check the service does not do ───────────────────────

describe('a non-existent org_members id is refused BEFORE the service is called', () => {
  it('refuses, and says why the check lives here', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce([]); // no such org member
    await expect(assertOrgMemberExists('00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow(OrgMemberNotFoundError);
  });

  it('POSITIVE CONTROL: the correction refuses a bad id and never reaches the service', async () => {
    // This is the plan's named control. It matters because `setAgentReportsTo`'s own dry-run
    // returns the id it was given for a human target, with no org_members lookup, so without
    // this check any truthy string would persist.
    mockQuery.mockReset();
    mockSetAgentReportsTo.mockReset();
    mockQuery.mockResolvedValueOnce([]);
    await expect(correctDeptCampaignPerformanceReportsTo({
      setByEmail: 'ali@colaberry.com',
      orgMemberId: 'not-a-real-org-member',
    })).rejects.toThrow(/no org_members row with id 'not-a-real-org-member'/);
    expect(mockSetAgentReportsTo).not.toHaveBeenCalled();
  });

  it('a real id passes the validator', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce([{ id: MARKETING_MANAGER_ORG_MEMBER_ID }]);
    await expect(assertOrgMemberExists(MARKETING_MANAGER_ORG_MEMBER_ID)).resolves.toBeUndefined();
  });

  it('the lookup is bound to the id, not to the first row of the table', async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce([{ id: MARKETING_MANAGER_ORG_MEMBER_ID }]);
    await assertOrgMemberExists(MARKETING_MANAGER_ORG_MEMBER_ID);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/FROM org_members WHERE id = \$1/);
    expect((opts as { bind: string[] }).bind).toEqual([MARKETING_MANAGER_ORG_MEMBER_ID]);
  });
});

// ─────────────────────── the service path, with a human target ───────────────────────

describe('the write goes through the real service, with type human', () => {
  it('calls setAgentReportsTo with the agent id, human, the org member and the actor', async () => {
    wireHappyPath();
    const r = await correctDeptCampaignPerformanceReportsTo({ setByEmail: 'ali@colaberry.com' });
    expect(mockSetAgentReportsTo).toHaveBeenCalledTimes(1);
    expect(mockSetAgentReportsTo).toHaveBeenCalledWith(
      BASELINE.id, 'human', MARKETING_MANAGER_ORG_MEMBER_ID, 'ali@colaberry.com',
    );
    expect(r.after.reports_to_type).toBe('human');
    expect(r.after.reports_to_id).toBe(MARKETING_MANAGER_ORG_MEMBER_ID);
    expect(r.service_result?.updated).toBe(true);
  });

  it('the baseline really had NO accountable human, which is the defect being fixed', async () => {
    wireHappyPath();
    const r = await correctDeptCampaignPerformanceReportsTo({ setByEmail: 'ali@colaberry.com' });
    expect(r.before.reports_to_type).toBeNull();
    expect(r.before.reports_to_id).toBeNull();
    // And it was ENABLED while unaccountable, which is why this is worth a task.
    expect(r.before.enabled).toBe(true);
  });

  it('a DRY RUN validates and snapshots but writes nothing', async () => {
    mockQuery.mockReset();
    mockSetAgentReportsTo.mockReset();
    mockQuery
      .mockResolvedValueOnce([{ id: MARKETING_MANAGER_ORG_MEMBER_ID }])
      .mockResolvedValueOnce([BASELINE]);
    const r = await correctDeptCampaignPerformanceReportsTo({
      setByEmail: 'ali@colaberry.com', dryRun: true,
    });
    expect(r.dry_run).toBe(true);
    expect(mockSetAgentReportsTo).not.toHaveBeenCalled();
    expect(r.after).toEqual(r.before);
  });

  it('refuses when the agent name does not resolve to exactly one row', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([{ id: MARKETING_MANAGER_ORG_MEMBER_ID }])
      .mockResolvedValueOnce([]); // no such agent
    await expect(correctDeptCampaignPerformanceReportsTo({ setByEmail: 'ali@colaberry.com' }))
      .rejects.toThrow(/AgentNotFoundError/);
  });
});

// ─────────────────────── the three preserved columns ───────────────────────

describe('exactly three columns must not change', () => {
  it('names the three, and excludes the three the scheduler moves', () => {
    expect([...PRESERVED_COLUMNS]).toEqual(['enabled', 'autonomy_level', 'tools_granted']);
    expect([...EXCLUDED_FROM_COMPARISON]).toEqual(['updated_at', 'last_run_at', 'run_count']);
    // No overlap: a column cannot be both asserted unchanged and excluded from the assertion.
    for (const c of PRESERVED_COLUMNS) expect(EXCLUDED_FROM_COMPARISON).not.toContain(c);
  });

  it('reports no change when the three held', () => {
    expect(changedPreservedColumns(BASELINE, CORRECTED)).toEqual([]);
  });

  /**
   * POSITIVE CONTROL the plan names: a fixture that mutates `autonomy_level` must FAIL the assert.
   * Without this, the comparison could be vacuous after the three exclusions — which is exactly
   * how a whole-row assert gets quietly narrowed into nothing.
   */
  it('POSITIVE CONTROL: a mutated autonomy_level is caught', () => {
    const tampered = { ...CORRECTED, autonomy_level: 'communicate' };
    expect(changedPreservedColumns(BASELINE, tampered)).toEqual(['autonomy_level']);
  });

  it('POSITIVE CONTROL: each of the three is caught individually', () => {
    expect(changedPreservedColumns(BASELINE, { ...CORRECTED, enabled: false })).toEqual(['enabled']);
    expect(changedPreservedColumns(BASELINE, { ...CORRECTED, autonomy_level: 'act' })).toEqual(['autonomy_level']);
    expect(changedPreservedColumns(BASELINE, { ...CORRECTED, tools_granted: ['send_email'] }))
      .toEqual(['tools_granted']);
  });

  it('the correction THROWS when a preserved column moved', async () => {
    wireHappyPath({ ...CORRECTED, autonomy_level: 'communicate' });
    await expect(correctDeptCampaignPerformanceReportsTo({ setByEmail: 'ali@colaberry.com' }))
      .rejects.toThrow(PreservedColumnChangedError);
  });

  it('a moved updated_at or run_count does NOT fail it, because the row is not static', () => {
    // Measured 2026-10-08: run_count = 2, updated_at = last_run_at = 2026-10-07 23:25:08+00. The
    // scheduler is running this agent, so a whole-row assert would fail for an unrelated reason
    // and then be relaxed by whoever hit it.
    const scheduled = {
      ...CORRECTED,
      updated_at: new Date().toISOString(),
      last_run_at: new Date().toISOString(),
      run_count: 99,
    } as unknown as AgentRowSnapshot;
    expect(changedPreservedColumns(BASELINE, scheduled)).toEqual([]);
  });

  it('the snapshot query selects the columns this module reasons about and no more', async () => {
    wireHappyPath();
    await correctDeptCampaignPerformanceReportsTo({ setByEmail: 'ali@colaberry.com' });
    const snapshotSql = String(mockQuery.mock.calls[1][0]);
    for (const c of PRESERVED_COLUMNS) expect(snapshotSql).toContain(c);
    expect(snapshotSql).toContain('reports_to_type');
    expect(snapshotSql).toContain('reports_to_id');
    // And it does not drag in the volatile columns at all, so they cannot creep into a comparison.
    for (const c of EXCLUDED_FROM_COMPARISON) expect(snapshotSql).not.toContain(c);
  });
});

// ─────────────────────── idempotency ───────────────────────

describe('re-running is safe', () => {
  it('an already-corrected row is set to the same values and still passes', async () => {
    mockQuery.mockReset();
    mockSetAgentReportsTo.mockReset();
    mockQuery
      .mockResolvedValueOnce([{ id: MARKETING_MANAGER_ORG_MEMBER_ID }])
      .mockResolvedValueOnce([CORRECTED])
      .mockResolvedValueOnce([CORRECTED]);
    mockSetAgentReportsTo.mockResolvedValue({
      agentId: BASELINE.id, agentName: TARGET_AGENT_NAME, found: true, updated: true,
      reportsTo: null, setAt: new Date(0), setBy: 'ali@colaberry.com', error: null,
    });
    const r = await correctDeptCampaignPerformanceReportsTo({ setByEmail: 'ali@colaberry.com' });
    expect(r.preserved_columns_unchanged).toBe(true);
    expect(r.after.reports_to_id).toBe(MARKETING_MANAGER_ORG_MEMBER_ID);
  });

  it('targets the agent by NAME, so no hardcoded uuid can go stale', () => {
    expect(TARGET_AGENT_NAME).toBe('DeptCampaignPerformanceAgent');
  });
});
