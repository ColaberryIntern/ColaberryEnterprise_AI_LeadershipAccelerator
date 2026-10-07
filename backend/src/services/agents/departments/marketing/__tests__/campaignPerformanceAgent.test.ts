/**
 * runCampaignPerformanceAgent — behaviour.
 *
 * The four defects this suite pins, each with the mutation that kills a NAMED
 * test (recorded so a later reader can re-run the proof):
 *
 *   1. tenant filter      — delete the `tenant_id` partition key in
 *                           partitionByTenant() and
 *                           "no action carries two tenants' campaigns" fails.
 *   2. campaigns_processed — restore `campaigns_processed: 0` and
 *                           "campaigns_processed equals the number analysed"
 *                           fails.
 *   3. emails_failed       — drop the field from the report and
 *                           "every report carries the emails_failed that drove
 *                           its verdict" fails.
 *   4. N+1                 — move the counts back inside the per-campaign loop
 *                           and "three queries whatever the campaign count"
 *                           fails.
 *
 * The models mock carries `update`/`create`/`destroy` deliberately: without
 * them a write would fail as "not a function", which proves the same thing by
 * accident. With them, "writes nothing" is an assertion.
 */
jest.mock('../../../../../models', () => ({
  Campaign: { findAll: jest.fn(), update: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  CampaignLead: { findAll: jest.fn(), update: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  ScheduledEmail: { findAll: jest.fn(), update: jest.fn(), create: jest.fn(), destroy: jest.fn() },
}));

import { Campaign, CampaignLead, ScheduledEmail } from '../../../../../models';
import {
  AGENT_NAME,
  classifyFunnel,
  runCampaignPerformanceAgent,
} from '../campaignPerformanceAgent';

const mockCampaigns = Campaign.findAll as unknown as jest.Mock;
const mockLeads = CampaignLead.findAll as unknown as jest.Mock;
const mockEmails = ScheduledEmail.findAll as unknown as jest.Mock;

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const AGENT_ID = 'agent-row-uuid';

let logSpy: jest.SpyInstance;

/** Postgres returns COUNT() as a bigint STRING — mocked the way the driver answers. */
function leadRow(campaignId: string, count: number) {
  return { campaign_id: campaignId, count: String(count) };
}
function emailRow(campaignId: string, status: string, count: number) {
  return { campaign_id: campaignId, status, count: String(count) };
}
function campaignRow(id: string, tenantId: string | null, name?: string) {
  return { id, name: name ?? `Campaign ${id}`, tenant_id: tenantId };
}

/** The six healthy single-tenant campaigns production actually has today. */
function sixHealthyCampaigns() {
  const rows = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((id) => campaignRow(id, TENANT_A));
  mockCampaigns.mockResolvedValue(rows);
  mockLeads.mockResolvedValue(rows.map((r) => leadRow(r.id, 10)));
  mockEmails.mockResolvedValue(rows.flatMap((r) => [emailRow(r.id, 'sent', 20), emailRow(r.id, 'pending', 2)]));
  return rows;
}

function queryCount(): number {
  return mockCampaigns.mock.calls.length + mockLeads.mock.calls.length + mockEmails.mock.calls.length;
}

function assertNoWrites(): void {
  for (const model of [Campaign, CampaignLead, ScheduledEmail] as any[]) {
    expect(model.update).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
    expect(model.destroy).not.toHaveBeenCalled();
  }
}

function loggedLines(): any[] {
  return logSpy.mock.calls.map((call) => JSON.parse(String(call[0])));
}

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('happy path', () => {
  it('analyses every active campaign and reports one action for the tenant', async () => {
    sixHealthyCampaigns();

    const result = await runCampaignPerformanceAgent(AGENT_ID);

    expect(result.agent_name).toBe(AGENT_NAME);
    expect(result.errors).toEqual([]);
    expect(result.actions_taken).toHaveLength(1);
    expect(result.actions_taken[0]).toMatchObject({
      campaign_id: null,
      action: 'campaign_performance_analysis',
      result: 'success',
      entity_type: 'system',
      entity_id: AGENT_ID,
    });
    expect(result.actions_taken[0].after_state).toMatchObject({
      tenant_id: TENANT_A,
      campaigns_analyzed: 6,
      underperformers: 0,
      recommendations: [],
    });
  });

  it('campaigns_processed equals the number analysed', async () => {
    // MUTATION TARGET 2 (the impossible number). The old agent returned 0 here
    // while analysing 6 — the value runAgent() copies into last_result.
    sixHealthyCampaigns();

    const result = await runCampaignPerformanceAgent(AGENT_ID);

    expect(result.campaigns_processed).toBe(6);
    expect(result.entities_processed).toBe(6);
    const analysed = result.actions_taken.reduce(
      (sum, a) => sum + Number(a.after_state?.campaigns_analyzed ?? 0),
      0,
    );
    expect(result.campaigns_processed).toBe(analysed);
    expect(
      (result.actions_taken[0].after_state?.campaign_reports as unknown[]).length,
    ).toBe(result.campaigns_processed);
  });

  it('every report carries the emails_failed that drove its verdict', async () => {
    // MUTATION TARGET 3. emailsFailed used to be computed, used, and dropped.
    mockCampaigns.mockResolvedValue([campaignRow('c1', TENANT_A)]);
    mockLeads.mockResolvedValue([leadRow('c1', 4)]);
    mockEmails.mockResolvedValue([emailRow('c1', 'sent', 10), emailRow('c1', 'failed', 5)]);

    const result = await runCampaignPerformanceAgent(AGENT_ID);
    const reports = result.actions_taken[0].after_state?.campaign_reports as any[];

    expect(reports[0]).toMatchObject({
      campaign_id: 'c1',
      leads: 4,
      emails_sent: 10,
      emails_failed: 5,
      failure_rate: 0.3333,
      funnel_health: 'degraded',
    });
    expect(result.actions_taken[0].after_state).toMatchObject({ emails_failed: 5, underperformers: 1 });
    expect(result.actions_taken[0].after_state?.recommendations[0]).toContain('(degraded)');
  });

  it('falls back to the campaign id when the name is blank, and parses bigint counts', async () => {
    mockCampaigns.mockResolvedValue([{ id: 'c9', name: '   ', tenant_id: TENANT_A }]);
    mockLeads.mockResolvedValue([leadRow('c9', 7)]);
    mockEmails.mockResolvedValue([emailRow('c9', 'sent', 3)]);

    const result = await runCampaignPerformanceAgent(AGENT_ID);
    const reports = result.actions_taken[0].after_state?.campaign_reports as any[];

    expect(reports[0]).toMatchObject({ name: 'c9', leads: 7, emails_sent: 3, funnel_health: 'healthy' });
  });
});

describe('tenant isolation', () => {
  it("no action carries two tenants' campaigns", async () => {
    // MUTATION TARGET 1 (the cross-tenant read). Delete the tenant partition
    // key and this is the test that dies.
    mockCampaigns.mockResolvedValue([
      campaignRow('a1', TENANT_A, 'A One'),
      campaignRow('b1', TENANT_B, 'B One'),
      campaignRow('a2', TENANT_A, 'A Two'),
      campaignRow('n1', null, 'No Tenant'),
    ]);
    mockLeads.mockResolvedValue([leadRow('a1', 1), leadRow('b1', 1), leadRow('a2', 1), leadRow('n1', 1)]);
    mockEmails.mockResolvedValue([]);

    const result = await runCampaignPerformanceAgent(AGENT_ID);

    expect(result.actions_taken).toHaveLength(3);
    for (const action of result.actions_taken) {
      const reports = action.after_state?.campaign_reports as any[];
      const tenants = [...new Set(reports.map((r) => r.tenant_id))];
      expect(tenants).toHaveLength(1);
      expect(tenants[0]).toEqual(action.after_state?.tenant_id ?? null);
    }

    const byTenant = new Map(
      result.actions_taken.map((a) => [
        String(a.after_state?.tenant_id),
        (a.after_state?.campaign_reports as any[]).map((r) => r.name).sort(),
      ]),
    );
    expect(byTenant.get(TENANT_A)).toEqual(['A One', 'A Two']);
    expect(byTenant.get(TENANT_B)).toEqual(['B One']);
    // A campaign with no tenant gets its own partition, never a real tenant's.
    expect(byTenant.get('null')).toEqual(['No Tenant']);
  });

  it('narrows the scan itself when config names a tenant', async () => {
    mockCampaigns.mockResolvedValue([campaignRow('a1', TENANT_A)]);
    mockLeads.mockResolvedValue([leadRow('a1', 1)]);
    mockEmails.mockResolvedValue([]);

    await runCampaignPerformanceAgent(AGENT_ID, { tenant_id: ` ${TENANT_A} ` });

    expect(mockCampaigns.mock.calls[0][0].where).toEqual({ status: 'active', tenant_id: TENANT_A });
  });

  it('scans every tenant when config names none, rather than inventing a default', async () => {
    sixHealthyCampaigns();

    await runCampaignPerformanceAgent(AGENT_ID, { tenant_id: '   ' });

    expect(mockCampaigns.mock.calls[0][0].where).toEqual({ status: 'active' });
  });
});

describe('query shape', () => {
  it('issues three queries whatever the campaign count', async () => {
    // MUTATION TARGET 4 (N+1). Four COUNTs per campaign used to mean 24 queries
    // for today's six, growing linearly.
    sixHealthyCampaigns();
    await runCampaignPerformanceAgent(AGENT_ID);
    expect(queryCount()).toBe(3);

    jest.clearAllMocks();
    mockCampaigns.mockResolvedValue([campaignRow('c1', TENANT_A)]);
    mockLeads.mockResolvedValue([leadRow('c1', 1)]);
    mockEmails.mockResolvedValue([]);
    await runCampaignPerformanceAgent(AGENT_ID);
    expect(queryCount()).toBe(3);
  });

  it('groups the aggregates instead of filtering one campaign at a time', async () => {
    sixHealthyCampaigns();

    await runCampaignPerformanceAgent(AGENT_ID);

    expect(mockLeads.mock.calls[0][0].group).toEqual(['campaign_id']);
    expect(mockEmails.mock.calls[0][0].group).toEqual(['campaign_id', 'status']);
  });

  it('writes nothing', async () => {
    sixHealthyCampaigns();

    await runCampaignPerformanceAgent(AGENT_ID);

    assertNoWrites();
  });
});

describe('failure paths', () => {
  it('database down: classifies, reports, and does not throw', async () => {
    const err: any = new Error('connect ECONNREFUSED 10.0.0.5:5432');
    err.code = 'ECONNREFUSED';
    mockCampaigns.mockRejectedValue(err);

    const result = await runCampaignPerformanceAgent(AGENT_ID);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('UpstreamUnavailable:');
    expect(result.campaigns_processed).toBe(0);
    expect(result.actions_taken).toEqual([]);
    expect(loggedLines()[0]).toMatchObject({
      level: 'error',
      outcome: 'failure',
      error_class: 'UpstreamUnavailable',
    });
  });

  it('an aggregate failing abandons the pass rather than reporting half a funnel', async () => {
    mockCampaigns.mockResolvedValue([campaignRow('c1', TENANT_A)]);
    mockLeads.mockRejectedValue(Object.assign(new Error('relation does not exist'), { name: 'DatabaseError' }));
    mockEmails.mockResolvedValue([]);

    const result = await runCampaignPerformanceAgent(AGENT_ID);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DatabaseError:');
    expect(result.campaigns_processed).toBe(0);
    expect(result.actions_taken).toEqual([]);
  });

  it('a query that never answers hits its deadline and is classified a timeout', async () => {
    mockCampaigns.mockReturnValue(new Promise(() => undefined));

    const result = await runCampaignPerformanceAgent(AGENT_ID, { deadline_ms: 5 });

    expect(result.errors[0]).toContain('TimeoutError:');
    expect(result.errors[0]).toContain('active campaign scan timed out after 5ms');
    expect(result.campaigns_processed).toBe(0);
  });

  it('a malformed campaign row is reported and skipped, and never counted as processed', async () => {
    mockCampaigns.mockResolvedValue([
      { id: null, name: 'Ghost', tenant_id: TENANT_A },
      campaignRow('c1', TENANT_A, 'Real'),
    ]);
    mockLeads.mockResolvedValue([leadRow('c1', 2)]);
    mockEmails.mockResolvedValue([]);

    const result = await runCampaignPerformanceAgent(AGENT_ID);

    expect(result.errors).toEqual([
      'ContractViolation: active campaign row has no usable id — skipped, not counted',
    ]);
    expect(result.campaigns_processed).toBe(1);
    const names = (result.actions_taken[0].after_state?.campaign_reports as any[]).map((r) => r.name);
    expect(names).toEqual(['Real']);
    expect(loggedLines()[0]).toMatchObject({ outcome: 'partial', level: 'error' });
  });
});

describe('boundaries', () => {
  it('zero active campaigns is a clean, query-cheap, action-free pass — not a failure', async () => {
    mockCampaigns.mockResolvedValue([]);

    const result = await runCampaignPerformanceAgent(AGENT_ID);

    expect(result.campaigns_processed).toBe(0);
    expect(result.actions_taken).toEqual([]);
    expect(result.errors).toEqual([]);
    // The aggregates are skipped: an empty IN () list has nothing to group by.
    expect(queryCount()).toBe(1);
    expect(loggedLines()[0]).toMatchObject({ outcome: 'success', level: 'info' });
  });

  it('one campaign with no leads reads empty, not healthy and not degraded', async () => {
    mockCampaigns.mockResolvedValue([campaignRow('c1', TENANT_A)]);
    mockLeads.mockResolvedValue([]);
    mockEmails.mockResolvedValue([]);

    const result = await runCampaignPerformanceAgent(AGENT_ID);
    const reports = result.actions_taken[0].after_state?.campaign_reports as any[];

    expect(reports[0]).toMatchObject({ leads: 0, funnel_health: 'empty', failure_rate: 0 });
    expect(result.actions_taken[0].after_state?.underperformers).toBe(1);
  });

  it('classifyFunnel covers the verdict boundary in both directions', () => {
    expect(classifyFunnel(0, 0, 0)).toEqual({ funnel_health: 'empty', failure_rate: 0 });
    // An empty audience outranks a delivery problem: there is no funnel to grade.
    expect(classifyFunnel(0, 100, 100)).toMatchObject({ funnel_health: 'empty' });
    expect(classifyFunnel(5, 10, 0)).toEqual({ funnel_health: 'healthy', failure_rate: 0 });
    // Exactly at the 10% threshold is still healthy; one more failure is not.
    expect(classifyFunnel(5, 90, 10)).toEqual({ funnel_health: 'healthy', failure_rate: 0.1 });
    expect(classifyFunnel(5, 89, 11)).toMatchObject({ funnel_health: 'degraded' });
    // Nothing sent and three failures: a rate, not a division by zero.
    expect(classifyFunnel(5, 0, 3)).toEqual({ funnel_health: 'degraded', failure_rate: 1 });
  });
});

describe('idempotency', () => {
  it('two runs over unchanged data return identical numbers and write nothing', async () => {
    sixHealthyCampaigns();

    const first = await runCampaignPerformanceAgent(AGENT_ID);
    const second = await runCampaignPerformanceAgent(AGENT_ID);

    const comparable = ({ duration_ms, ...rest }: any) => rest;
    expect(comparable(second)).toEqual(comparable(first));
    expect(second.campaigns_processed).toBe(6);
    expect(queryCount()).toBe(6);
    assertNoWrites();
  });

  it('each run logs exactly one event, with its own correlation id', async () => {
    sixHealthyCampaigns();

    await runCampaignPerformanceAgent(AGENT_ID);
    await runCampaignPerformanceAgent(AGENT_ID);

    const lines = loggedLines();
    expect(lines).toHaveLength(2);
    expect(lines[0].correlation_id).not.toBe(lines[1].correlation_id);
    expect(lines[0]).toMatchObject({
      service: 'marketing-campaign-performance',
      event: 'campaign_performance_scan',
      outcome: 'success',
      context: { agent_id: AGENT_ID, campaigns_processed: 6, tenant_partitions: 1, actions: 1 },
    });
    expect(lines[0].error_class).toBeUndefined();
  });
});
