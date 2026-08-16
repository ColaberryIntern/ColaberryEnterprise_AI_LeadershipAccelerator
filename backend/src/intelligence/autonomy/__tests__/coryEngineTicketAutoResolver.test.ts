/**
 * Cory-Engine Ticket Auto-Resolver — unit tests.
 * Mirrors workforceTicketAutoResolver.test.ts's mocking shape (mock '../../models' and
 * the dynamically-imported sibling modules), since this file uses the exact same
 * dynamic-import convention.
 */
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';

const mockTicketFindAll = jest.fn();
const mockAiAgentFindAll = jest.fn();
const mockUpdateTicketStatus = jest.fn();
const mockDetectAgentFailures = jest.fn();
const mockDetectConversionDrops = jest.fn();
const mockSequelizeQuery = jest.fn();

jest.mock('../../../models', () => ({
  Ticket: { findAll: (...args: any[]) => mockTicketFindAll(...args) },
  AiAgent: { findAll: (...args: any[]) => mockAiAgentFindAll(...args) },
}));
jest.mock('../../../services/company/ticketOrchestrator', () => ({
  updateTicketStatus: (...args: any[]) => mockUpdateTicketStatus(...args),
}));
jest.mock('../../agents/ProblemDiscoveryAgent', () => ({
  detectAgentFailures: (...args: any[]) => mockDetectAgentFailures(...args),
  detectConversionDrops: (...args: any[]) => mockDetectConversionDrops(...args),
}));
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: any[]) => mockSequelizeQuery(...args) },
}));

import {
  fetchLiveResolvableCoryEngineTickets,
  reCheckAndAutoResolveCoryEngineTickets,
  MAX_TICKETS_PER_RUN,
} from '../coryEngineTicketAutoResolver';

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-1',
    ticket_number: 101,
    description:
      '**Problem:** Agent "SomeAgent" is in error state: timeout\n**Root Cause:** unknown\n**Recommended Action:** investigate',
    status: 'todo',
    ...overrides,
  };
}

function conversionDropTicket(overrides: Partial<any> = {}) {
  return makeTicket({
    id: 'ticket-cd',
    description:
      '**Problem:** Lead generation dropped 65% in last 48h (2 vs expected 6)\n**Root Cause:** unknown\n**Recommended Action:** investigate',
    ...overrides,
  });
}

function errorSpikeTicket(overrides: Partial<any> = {}) {
  return makeTicket({
    id: 'ticket-es',
    description: '**Problem:** Error spike: 42 errors in last hour (avg: 5/hr)\n**Root Cause:** unknown',
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketFindAll.mockResolvedValue([]);
  mockAiAgentFindAll.mockResolvedValue([]);
  mockUpdateTicketStatus.mockResolvedValue({});
  mockDetectAgentFailures.mockResolvedValue([]);
  mockDetectConversionDrops.mockResolvedValue([]);
  mockSequelizeQuery.mockResolvedValue([[{ recent_count: '2', daily_avg: '1' }]]);
});

describe('fetchLiveResolvableCoryEngineTickets — query scope', () => {
  it('queries only open cory-engine tickets scoped by the defensive triple key', async () => {
    await fetchLiveResolvableCoryEngineTickets();

    const whereArg = mockTicketFindAll.mock.calls[0][0].where;
    expect(whereArg.created_by_id).toBe('cory-engine');
    expect(whereArg.type).toBe('agent_action');
    expect(whereArg.source).toBe('cory_autonomous_cycle');
    expect(whereArg.status[Op.notIn]).toEqual(['done', 'cancelled']);
    expect(mockTicketFindAll.mock.calls[0][0].limit).toBe(MAX_TICKETS_PER_RUN);
  });

  it('calls the live detectors exactly once per pass, not once per ticket', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'a' }), makeTicket({ id: 'b' }), makeTicket({ id: 'c' })]);

    await fetchLiveResolvableCoryEngineTickets();

    expect(mockDetectAgentFailures).toHaveBeenCalledTimes(1);
    expect(mockDetectConversionDrops).toHaveBeenCalledTimes(1);
  });
});

describe('fetchLiveResolvableCoryEngineTickets — agent_failure classification', () => {
  it('agent still in the live detector output -> agent_still_failing, should_close false', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);
    mockDetectAgentFailures.mockResolvedValue([
      { type: 'agent_failure', severity: 'high', entity_type: 'agent', entity_id: 'a1', description: 'Agent "SomeAgent" is in error state: timeout', metrics: {}, detected_at: new Date() },
    ]);

    const results = await fetchLiveResolvableCoryEngineTickets();

    expect(results[0].condition_type).toBe('agent_failure');
    expect(results[0].outcome).toBe('agent_still_failing');
    expect(results[0].should_close).toBe(false);
  });

  it('agent absent from the live detector output -> agent_recovered, should_close true, evidence carries current live status', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);
    mockDetectAgentFailures.mockResolvedValue([]); // nobody currently failing
    mockAiAgentFindAll.mockResolvedValue([{ agent_name: 'SomeAgent', status: 'idle', enabled: true }]);

    const results = await fetchLiveResolvableCoryEngineTickets();

    expect(results[0].outcome).toBe('agent_recovered');
    expect(results[0].should_close).toBe(true);
    expect(results[0].evidence_note).toContain('SomeAgent');
    expect(results[0].evidence_note).toContain("status='idle'");
  });
});

describe('fetchCurrentConversionMetricsForEvidence — drift guard against ProblemDiscoveryAgent.ts', () => {
  it("this file's duplicated leads-aggregate SQL has not drifted from detectConversionDrops()'s real source text", () => {
    const sourcePath = path.join(__dirname, '../../agents/ProblemDiscoveryAgent.ts');
    const source = fs.readFileSync(sourcePath, 'utf8');
    // The exact literal fragments this file's evidence-only query duplicates from
    // detectConversionDrops() — if the real detector's window/columns ever change,
    // this test fails loudly rather than silently reporting stale evidence numbers.
    expect(source).toContain("INTERVAL '48 hours'");
    expect(source).toContain("INTERVAL '7 days'");
    expect(source).toContain('recent_count');
    expect(source).toContain('daily_avg');
    expect(source).toContain('FROM leads');
  });

  it('conversion_drop_cleared evidence carries the CURRENT recent/expected numbers end to end (via the real sequelize.query mock)', async () => {
    mockTicketFindAll.mockResolvedValue([conversionDropTicket()]);
    mockDetectConversionDrops.mockResolvedValue([]); // cleared
    mockSequelizeQuery.mockResolvedValue([[{ recent_count: '4', daily_avg: '2' }]]);

    const results = await fetchLiveResolvableCoryEngineTickets();

    expect(results[0].should_close).toBe(true);
    expect(results[0].evidence_note).toContain('4 leads in the last 48h');
    expect(results[0].evidence_note).toContain('expected 4'); // dailyAvg(2) * 2
  });

  it('a failed evidence-metrics query never blocks the close decision — degrades to "unavailable" text, still closes', async () => {
    mockTicketFindAll.mockResolvedValue([conversionDropTicket()]);
    mockDetectConversionDrops.mockResolvedValue([]); // cleared
    mockSequelizeQuery.mockRejectedValue(new Error('db down'));

    const results = await fetchLiveResolvableCoryEngineTickets();

    expect(results[0].should_close).toBe(true);
    expect(results[0].evidence_note).toContain('unavailable');
  });
});

describe('fetchLiveResolvableCoryEngineTickets — conversion_drop classification', () => {
  it('detectConversionDrops() still returns a problem -> ALL open conversion_drop tickets stay open', async () => {
    mockTicketFindAll.mockResolvedValue([conversionDropTicket({ id: 'cd1' }), conversionDropTicket({ id: 'cd2' })]);
    mockDetectConversionDrops.mockResolvedValue([
      { type: 'conversion_drop', severity: 'high', description: 'Lead generation dropped 70% in last 48h (1 vs expected 4)', metrics: {}, detected_at: new Date() },
    ]);

    const results = await fetchLiveResolvableCoryEngineTickets();

    expect(results.every((r) => r.condition_type === 'conversion_drop' && !r.should_close)).toBe(true);
  });

  it('detectConversionDrops() returns nothing -> ALL open conversion_drop tickets close together with fresh evidence', async () => {
    mockTicketFindAll.mockResolvedValue([conversionDropTicket({ id: 'cd1' }), conversionDropTicket({ id: 'cd2' })]);
    mockDetectConversionDrops.mockResolvedValue([]);

    const results = await fetchLiveResolvableCoryEngineTickets();

    expect(results.every((r) => r.condition_type === 'conversion_drop' && r.should_close)).toBe(true);
  });
});

describe('fetchLiveResolvableCoryEngineTickets — error_spike classification', () => {
  it('classified for reporting, never marked should_close', async () => {
    mockTicketFindAll.mockResolvedValue([errorSpikeTicket()]);

    const results = await fetchLiveResolvableCoryEngineTickets();

    expect(results[0].condition_type).toBe('error_spike');
    expect(results[0].should_close).toBe(false);
  });
});

describe('reCheckAndAutoResolveCoryEngineTickets — writes', () => {
  it('closes only the should_close rows, once each, via ticketOrchestrator.updateTicketStatus', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ id: 'still-failing' }), makeTicket({ id: 'recovered', description: '**Problem:** Agent "OtherAgent" is in error state: x' })]);
    mockDetectAgentFailures.mockResolvedValue([
      { type: 'agent_failure', severity: 'high', entity_type: 'agent', entity_id: 'a1', description: 'Agent "SomeAgent" is in error state: timeout', metrics: {}, detected_at: new Date() },
    ]);

    const report = await reCheckAndAutoResolveCoryEngineTickets();

    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
    const [ticketId, newStatus, actorType, actorId, comment] = mockUpdateTicketStatus.mock.calls[0];
    expect(ticketId).toBe('recovered');
    expect(newStatus).toBe('done');
    expect(actorType).toBe('agent');
    expect(actorId).toBe('cory-engine');
    expect(typeof comment).toBe('string');
    expect(report.closed).toBe(1);
    expect(report.checked).toBe(2);
    expect(report.breakdown.agent_failure).toEqual({ checked: 2, closed: 1 });
  });

  it('breakdown is grouped by condition_type across a mixed batch', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 'af-recovered', description: '**Problem:** Agent "RecoveredAgent" is in error state: x' }),
      conversionDropTicket({ id: 'cd-cleared' }),
      errorSpikeTicket({ id: 'es-never-closes' }),
    ]);
    mockDetectAgentFailures.mockResolvedValue([]); // nobody failing -> recovered
    mockDetectConversionDrops.mockResolvedValue([]); // cleared

    const report = await reCheckAndAutoResolveCoryEngineTickets();

    expect(report.breakdown.agent_failure).toEqual({ checked: 1, closed: 1 });
    expect(report.breakdown.conversion_drop).toEqual({ checked: 1, closed: 1 });
    expect(report.breakdown.error_spike).toEqual({ checked: 1, closed: 0 });
    expect(report.closed).toBe(2);
  });

  it('idempotency: running twice in a row against a fixture where the first run already closed everything results in zero writes on the second run', async () => {
    const openTicket = makeTicket({ id: 'recovers-once', description: '**Problem:** Agent "OnceAgent" is in error state: x' });
    mockTicketFindAll.mockResolvedValueOnce([openTicket]).mockResolvedValueOnce([]); // 2nd fetch: query's own status filter already excludes it once closed
    mockDetectAgentFailures.mockResolvedValue([]);

    const firstRun = await reCheckAndAutoResolveCoryEngineTickets();
    const secondRun = await reCheckAndAutoResolveCoryEngineTickets();

    expect(firstRun.closed).toBe(1);
    expect(secondRun.closed).toBe(0);
    expect(secondRun.checked).toBe(0);
    expect(mockUpdateTicketStatus).toHaveBeenCalledTimes(1);
  });

  it('one malformed/throwing ticket does not abort processing of the rest of the batch', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 'will-throw', description: '**Problem:** Agent "ThrowAgent" is in error state: x' }),
      makeTicket({ id: 'will-succeed', description: '**Problem:** Agent "OkAgent" is in error state: x' }),
    ]);
    mockDetectAgentFailures.mockResolvedValue([]); // both recovered -> both should close
    mockUpdateTicketStatus.mockRejectedValueOnce(new Error('DB write failed')).mockResolvedValueOnce({});

    const report = await reCheckAndAutoResolveCoryEngineTickets();

    expect(report.results.find((r) => r.ticket_id === 'will-throw')?.write_error).toBe('DB write failed');
    expect(report.results.find((r) => r.ticket_id === 'will-succeed')?.write_error).toBeUndefined();
    expect(report.closed).toBe(1);
  });

  it('an error_spike ticket present in the batch is classified and reported but updateTicketStatus is never called for it', async () => {
    mockTicketFindAll.mockResolvedValue([errorSpikeTicket()]);

    const report = await reCheckAndAutoResolveCoryEngineTickets();

    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(report.breakdown.error_spike.checked).toBe(1);
    expect(report.breakdown.error_spike.closed).toBe(0);
  });
});
