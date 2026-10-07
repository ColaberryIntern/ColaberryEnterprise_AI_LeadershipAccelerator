/**
 * The IO shell around the health verdict.
 *
 * collectGroupStatus used to swallow a database failure and return [], which
 * is the same value an empty department returns. Everything downstream then
 * agreed that nothing was wrong: report_type 'periodic', and the executive
 * briefing's `anomalies.length > 0 ? 'degraded' : 'healthy'` rendered
 * 'healthy' into an email to the DRI and to Ram.
 *
 * These tests pin the row that actually gets written, because that row is what
 * the briefing reads.
 */

const findAll = jest.fn();
const create = jest.fn();
const logAiEvent = jest.fn(async () => undefined);
const createdReports: any[] = [];

jest.mock('../../../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findAll: (...args: unknown[]) => findAll(...args) },
}));
jest.mock('../../../../../models/DepartmentReport', () => ({
  __esModule: true,
  default: {
    create: (payload: any) => {
      createdReports.push(payload);
      return create(payload);
    },
  },
}));
jest.mock('../../../../aiEventService', () => ({
  logAiEvent: (...args: unknown[]) => logAiEvent(...(args as [])),
}));

import { collectGroupStatus, runSuperAgentCycle } from '../superAgentBase';
import { HEALTHY_RECOMMENDATION } from '../superAgentHealth';

const NOW_ISH = new Date();

function row(overrides: Record<string, unknown> = {}) {
  return {
    agent_name: 'AgentA',
    status: 'idle',
    enabled: true,
    last_run_at: NOW_ISH,
    error_count: 0,
    run_count: 20,
    avg_duration_ms: 900,
    last_error: null,
    ...overrides,
  };
}

beforeEach(() => {
  findAll.mockReset();
  create.mockReset();
  create.mockImplementation(async (payload: any) => payload);
  logAiEvent.mockReset();
  logAiEvent.mockImplementation(async () => undefined);
  createdReports.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// collectGroupStatus
// ---------------------------------------------------------------------------

describe('collectGroupStatus', () => {
  it('returns ok:true with the mapped rows on the happy path', async () => {
    findAll.mockResolvedValue([row(), row({ agent_name: 'AgentB', status: 'running' })]);
    const result = await collectGroupStatus('campaign_ops');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.subordinates.map(s => s.agent_name)).toEqual(['AgentA', 'AgentB']);
    expect(result.subordinates[1].status).toBe('running');
  });

  it('returns ok:true with an empty list for a department with no rows', async () => {
    findAll.mockResolvedValue([]);
    const result = await collectGroupStatus('content_engine');
    expect(result).toEqual({ ok: true, subordinates: [] });
  });

  it('returns ok:false with a classified error when the query throws', async () => {
    findAll.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 10.0.0.9:5432'), { code: 'ECONNREFUSED' }));
    const result = await collectGroupStatus('finance');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errorClass).toBe('UpstreamUnavailable');
    expect(result.message).toBe('connect ECONNREFUSED 10.0.0.9:5432');
  });

  it('classifies with classifyError, not err.name', async () => {
    // err.name here is the useless literal 'Error' that CLAUDE.md forbids as
    // an error_class. A timeout must still be reported as a TimeoutError.
    findAll.mockRejectedValue(new Error('Query read timeout after 30000ms'));
    const result = await collectGroupStatus('admissions');
    if (result.ok) throw new Error('expected failure');
    expect(result.errorClass).toBe('TimeoutError');
    expect(result.errorClass).not.toBe('Error');
  });

  it('logs the failure with its error_class and still returns a value', async () => {
    findAll.mockRejectedValue(Object.assign(new Error('nope'), { status: 403 }));
    const result = await collectGroupStatus('partnership');
    if (result.ok) throw new Error('expected failure');
    expect(result.errorClass).toBe('AuthError');
    expect(logAiEvent).toHaveBeenCalledTimes(1);
    expect(logAiEvent.mock.calls[0][4]).toMatchObject({
      error_class: 'AuthError',
      phase: 'collectGroupStatus',
      outcome: 'failure',
    });
  });

  it('does not let a failing event log mask the collection result', async () => {
    findAll.mockRejectedValue(new Error('db gone'));
    logAiEvent.mockRejectedValue(new Error('event log down'));
    await expect(collectGroupStatus('finance')).resolves.toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// runSuperAgentCycle - the row that gets written
// ---------------------------------------------------------------------------

describe('runSuperAgentCycle - database failure', () => {
  beforeEach(() => {
    findAll.mockRejectedValue(Object.assign(new Error('connection terminated'), { code: 'ECONNRESET' }));
  });

  it('writes an alert, never a periodic report', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports).toHaveLength(1);
    expect(createdReports[0].report_type).toBe('alert');
    expect(createdReports[0].report_type).not.toBe('periodic');
  });

  it('records health unknown and the error_class in metrics', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports[0].metrics).toMatchObject({
      health: 'unknown',
      collection_ok: false,
      error_class: 'UpstreamUnavailable',
      total: 0,
    });
  });

  it('never persists the all-clear sentence, and leaves anomalies non-null', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports[0].recommendations).not.toContain(HEALTHY_RECOMMENDATION);
    expect(createdReports[0].anomalies).not.toBeNull();
    expect(createdReports[0].anomalies[0]).toContain('UpstreamUnavailable');
  });

  it('says in the summary that no health claim is being made', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports[0].summary).toContain('health UNKNOWN');
    expect(createdReports[0].summary).toContain('No health claim can be made');
  });

  it('returns the verdict to the caller as well', async () => {
    const result = await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(result.health).toBe('unknown');
    expect(result.report_type).toBe('alert');
    expect(result.collection_error).toBe('UpstreamUnavailable');
  });
});

describe('runSuperAgentCycle - empty department', () => {
  beforeEach(() => findAll.mockResolvedValue([]));

  it('alerts instead of certifying an empty department healthy', async () => {
    const result = await runSuperAgentCycle('content_engine', 'Content Engine', 'ContentEngineSuperAgent');
    expect(result.health).toBe('unknown');
    expect(createdReports[0].report_type).toBe('alert');
    expect(createdReports[0].metrics.health).toBe('unknown');
    expect(createdReports[0].metrics.total).toBe(0);
  });

  it('gives the live consumer a non-empty anomalies array, which is what it reads', async () => {
    await runSuperAgentCycle('content_engine', 'Content Engine', 'ContentEngineSuperAgent');
    const anomalies = createdReports[0].anomalies as string[];
    expect(anomalies.length).toBeGreaterThan(0);
    // This used to end with
    //   expect(anomalies.length > 0 ? 'degraded' : 'healthy').toBe('degraded');
    // which cannot fail once the line above has asserted length > 0 - it
    // re-evaluates the same expression and compares it to itself. The real
    // consumer is cory/coryBrain.ts:279-281, which derives its badge from
    // `anomalies.length > 0 ? 'degraded' : 'healthy'` and its agent count from
    // `metrics.total`, and is rendered by CoryCOOTab.tsx. So what is worth
    // pinning is the CONTENT that keeps that mapping off 'healthy', and the
    // pairing the dashboard actually displays: the agent count next to the
    // health word.
    expect(anomalies).toContain('Department has no registered agents, so its health cannot be determined');
    expect(createdReports[0].metrics.total).toBe(0);
    expect(createdReports[0].metrics.health).not.toBe('healthy');
  });

  it('withholds the all-clear sentence', async () => {
    await runSuperAgentCycle('content_engine', 'Content Engine', 'ContentEngineSuperAgent');
    expect(createdReports[0].recommendations).not.toContain(HEALTHY_RECOMMENDATION);
  });
});

describe('runSuperAgentCycle - a one-member all-disabled department', () => {
  const lastRun = new Date('2026-08-24T06:30:00.000Z');

  beforeEach(() => {
    findAll.mockResolvedValue([
      row({ agent_name: 'FinanceReconciliationAgent', enabled: false, run_count: 412, last_run_at: lastRun }),
    ]);
  });

  it('is degraded and alerts, where it used to be periodic', async () => {
    const result = await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(result.health).toBe('degraded');
    expect(createdReports[0].report_type).toBe('alert');
    expect(createdReports[0].metrics.health).toBe('degraded');
  });

  it('names the disabled agent and its last run', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    const anomalies = createdReports[0].anomalies as string[];
    expect(anomalies).toContain('All 1 agent(s) in this department are disabled - no work can run here');
    expect(anomalies).toContain(
      'FinanceReconciliationAgent is disabled after 412 run(s) - last ran 2026-08-24T06:30:00.000Z',
    );
  });

  it('withholds the all-clear sentence', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports[0].recommendations).not.toContain(HEALTHY_RECOMMENDATION);
  });
});

describe('runSuperAgentCycle - the enabled-but-paused agent from the audit', () => {
  // ExecutionAgent.ts:74 writes exactly this row: `status` moved to 'paused'
  // as automated backoff, `enabled` never cleared. The row that came back was
  //   summary:  "Finance: health HEALTHY - 0/1 healthy, 0 errored, 1 paused."
  //   metrics:  { total:1, healthy:0, errored:0, paused:1, health:"healthy" }
  //   recommendations: ["All agents operating within normal parameters"]
  // An automated remediation silencing the alarm about the thing it had just
  // remediated, with the number that proves it broken printed beside the word
  // healthy.
  beforeEach(() => {
    findAll.mockResolvedValue([row({ agent_name: 'FinanceReconciliationAgent', status: 'paused' })]);
  });

  it('writes degraded and alerts, where it used to write the all-clear', async () => {
    const result = await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(result.health).toBe('degraded');
    expect(createdReports[0].metrics.health).toBe('degraded');
    expect(createdReports[0].report_type).toBe('alert');
    expect(createdReports[0].recommendations).not.toContain(HEALTHY_RECOMMENDATION);
  });

  it('writes a summary that does not contradict its own counters', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    const summary = createdReports[0].summary as string;
    expect(summary).toContain('health DEGRADED');
    expect(summary).not.toContain('health HEALTHY');
    expect(summary).toContain('0/1 healthy');
  });

  it('names the paused agent in the persisted anomalies', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports[0].anomalies).toContain(
      "FinanceReconciliationAgent is enabled but its status is 'paused', which is not a running state - it is registered to run and is not running",
    );
  });

  it('tells the event log the cycle was not a clean one', async () => {
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(logAiEvent.mock.calls[0][4]).toMatchObject({ health: 'degraded', report_type: 'alert' });
  });
});

describe('the persisted summary can never contradict its own counters', () => {
  // The verdict and the counters in that one sentence are produced by
  // different code over different fields - the verdict by the anomaly rules in
  // superAgentHealth, the counters by the filters in superAgentBase - so a
  // hole in the rules surfaces here as an arithmetic contradiction. This walks
  // the shapes where the two could disagree and asserts that they cannot.
  const shapes: Array<[string, Record<string, unknown>[]]> = [
    ['one enabled paused agent', [row({ status: 'paused' })]],
    ['one enabled agent with an out-of-union status', [row({ status: 'crashed' })]],
    ['one enabled agent that has never run', [row({ run_count: 0, last_run_at: null })]],
    ['one enabled errored agent', [row({ status: 'error', error_count: 3 })]],
    ['one disabled agent with history', [row({ enabled: false })]],
    ['every run errored', [row({ run_count: 4, error_count: 4 })]],
    [
      'a paused agent beside two working ones',
      [row({ agent_name: 'A' }), row({ agent_name: 'B', status: 'running' }), row({ agent_name: 'P', status: 'paused' })],
    ],
    ['three working agents', [row({ agent_name: 'A' }), row({ agent_name: 'B' }), row({ agent_name: 'C' })]],
  ];

  it.each(shapes)('%s', async (_label, rows) => {
    findAll.mockResolvedValue(rows);
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    const report = createdReports[0];
    const { healthy, total, health } = report.metrics;

    // The contradiction the audit caught, stated directly.
    if (healthy === 0) {
      expect(health).not.toBe('healthy');
      expect(report.summary).not.toContain('health HEALTHY');
    }

    if (health === 'healthy') {
      expect(healthy).toBeGreaterThan(0);
      expect(report.recommendations).toContain(HEALTHY_RECOMMENDATION);
      expect(report.report_type).toBe('periodic');
    } else {
      expect(report.recommendations || []).not.toContain(HEALTHY_RECOMMENDATION);
      expect(report.report_type).toBe('alert');
    }

    // And the sentence always prints the verdict it actually recorded.
    expect(report.summary).toContain(`health ${String(health).toUpperCase()}`);
    expect(report.summary).toContain(`${healthy}/${total} healthy`);
  });
});

describe('runSuperAgentCycle - a genuinely healthy department', () => {
  beforeEach(() => {
    findAll.mockResolvedValue([
      row({ agent_name: 'A' }),
      row({ agent_name: 'B', status: 'running' }),
      row({ agent_name: 'C' }),
    ]);
  });

  it('writes a periodic report with health healthy', async () => {
    const result = await runSuperAgentCycle('campaign_ops', 'Campaign Operations', 'CampaignOpsSuperAgent');
    expect(result.health).toBe('healthy');
    expect(createdReports[0].report_type).toBe('periodic');
    expect(createdReports[0].metrics).toMatchObject({ health: 'healthy', collection_ok: true, total: 3, errored: 0 });
    expect(createdReports[0].anomalies).toBeNull();
  });

  it('is the one case that earns the all-clear sentence', async () => {
    await runSuperAgentCycle('campaign_ops', 'Campaign Operations', 'CampaignOpsSuperAgent');
    expect(createdReports[0].recommendations).toContain(HEALTHY_RECOMMENDATION);
  });

  it('keeps every field the existing callers read (additive contract)', async () => {
    const result = await runSuperAgentCycle('campaign_ops', 'Campaign Operations', 'CampaignOpsSuperAgent');
    // All 8 super agents read department + anomalies.length; coryProductionBoot,
    // finalActivation and goLiveOrchestration also read healthy / total / errored.
    expect(result.department).toBe('Campaign Operations');
    expect(result.total).toBe(3);
    expect(result.healthy).toBe(3);
    expect(result.errored).toBe(0);
    expect(result.paused).toBe(0);
    expect(Array.isArray(result.anomalies)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.subordinates).toHaveLength(3);
    expect(result.collection_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Failure path and replay
// ---------------------------------------------------------------------------

describe('failure path', () => {
  it('still writes the report when the event log is down', async () => {
    findAll.mockResolvedValue([row()]);
    logAiEvent.mockRejectedValue(new Error('event log down'));
    await expect(runSuperAgentCycle('admissions', 'Admissions', 'AdmissionsSuperAgent')).resolves.toBeDefined();
    expect(createdReports).toHaveLength(1);
  });

  it('propagates a report write failure rather than pretending it reported', async () => {
    findAll.mockResolvedValue([row()]);
    create.mockRejectedValue(new Error('insert failed'));
    await expect(runSuperAgentCycle('admissions', 'Admissions', 'AdmissionsSuperAgent')).rejects.toThrow('insert failed');
  });
});

describe('replay - the cron runs this every 30 minutes', () => {
  it('writes the identical row twice for identical inputs (healthy)', async () => {
    findAll.mockResolvedValue([row({ agent_name: 'A' }), row({ agent_name: 'B' })]);
    await runSuperAgentCycle('campaign_ops', 'Campaign Operations', 'CampaignOpsSuperAgent');
    await runSuperAgentCycle('campaign_ops', 'Campaign Operations', 'CampaignOpsSuperAgent');
    expect(createdReports).toHaveLength(2);
    expect(createdReports[1]).toEqual(createdReports[0]);
  });

  it('writes the identical row twice for identical inputs (degraded)', async () => {
    findAll.mockResolvedValue([
      row({ agent_name: 'A', enabled: false, run_count: 9, last_run_at: new Date('2026-08-24T06:30:00.000Z') }),
    ]);
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports[1]).toEqual(createdReports[0]);
    expect(createdReports[0].report_type).toBe('alert');
  });

  it('writes the identical row twice for identical inputs (collection failure)', async () => {
    findAll.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ECONNREFUSED' }));
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(createdReports[1]).toEqual(createdReports[0]);
    expect(createdReports[0].metrics.health).toBe('unknown');
  });

  it('does not flip verdict between a failed read and a later successful one', async () => {
    findAll.mockRejectedValueOnce(new Error('timed out'));
    const blind = await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    findAll.mockResolvedValue([row({ agent_name: 'A' })]);
    const seeing = await runSuperAgentCycle('finance', 'Finance', 'FinanceSuperAgent');
    expect(blind.health).toBe('unknown');
    expect(seeing.health).toBe('healthy');
    expect(createdReports[0].report_type).toBe('alert');
    expect(createdReports[1].report_type).toBe('periodic');
  });
});
