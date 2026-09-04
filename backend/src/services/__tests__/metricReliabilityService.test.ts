/**
 * metricReliabilityService — Reese Agentic AI Employee mission, Checkpoint B.
 * Pins the honest healthy-by-default state (absence of a row is never
 * fabricated into a positive record), fail-closed usability (only a real
 * `healthy` status returns usable — degraded/quarantined/recovering all
 * exclude), scoped-vs-global precedence (an unhealthy record at either
 * level wins over a healthy one at the other), the mutate-in-place +
 * immutable-audit-event pattern, and restoration's real preconditions
 * (must exist, must not already be healthy).
 */
const mockFindOne = jest.fn();
const mockFindOrCreate = jest.fn();
jest.mock('../../models/MetricReliabilityRecord', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockFindOne(...a),
    findOrCreate: (...a: any[]) => mockFindOrCreate(...a),
  },
}));

const mockEmitAiEvent = jest.fn();
jest.mock('../aiEventService', () => ({ emitAiEvent: (...a: any[]) => mockEmitAiEvent(...a) }));

import {
  declareReliabilityChange,
  getReliabilityStatus,
  isMetricUsable,
  restoreMetric,
  MetricRestorationError,
} from '../metricReliabilityService';

function fakeRecord(overrides: Record<string, any> = {}) {
  const base = {
    id: 'record-1',
    source_system: 'attendance',
    metric_key: 'attendance.*',
    scope_type: 'global',
    scope_value: null,
    status: 'quarantined',
    severity: 'high',
    reason: 'Check-in system missing students since Monday',
    incident_ticket_id: null,
    declared_by_source: 'manager_report',
    declared_by_email: 'ali@colaberry.com',
    declared_at: new Date('2026-09-04T10:00:00Z'),
    review_owner_email: null,
    next_review_at: null,
    recovery_criteria: null,
    restored_by_email: null,
    restored_at: null,
    update: jest.fn().mockResolvedValue(undefined),
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmitAiEvent.mockResolvedValue(undefined);
});

describe('getReliabilityStatus', () => {
  it('honesty boundary: no record anywhere means healthy, never a fabricated positive row', async () => {
    mockFindOne.mockResolvedValue(null);

    const result = await getReliabilityStatus('attendance', 'attendance.*');

    expect(result).toEqual({ status: 'healthy', severity: null, reason: null, declaredAt: null, recordId: null, incidentTicketId: null });
  });

  it('happy path: a real quarantined global record is returned as-is', async () => {
    const record = fakeRecord({ status: 'quarantined' });
    mockFindOne.mockResolvedValue(record);

    const result = await getReliabilityStatus('attendance', 'attendance.*');

    expect(result.status).toBe('quarantined');
    expect(result.recordId).toBe('record-1');
    expect(result.reason).toBe('Check-in system missing students since Monday');
  });

  it('scope precedence: a cohort-scoped quarantine wins even when the global record is healthy', async () => {
    mockFindOne.mockImplementation(async ({ where }: any) => {
      if (where.scope_type === 'cohort') return fakeRecord({ status: 'quarantined', scope_type: 'cohort', scope_value: 'cohort-9' });
      return fakeRecord({ status: 'healthy', scope_type: 'global', scope_value: null });
    });

    const result = await getReliabilityStatus('attendance', 'attendance.*', { scopeType: 'cohort', scopeValue: 'cohort-9' });

    expect(result.status).toBe('quarantined');
  });

  it('scope precedence: a global quarantine wins even when the cohort-scoped record is healthy', async () => {
    mockFindOne.mockImplementation(async ({ where }: any) => {
      if (where.scope_type === 'cohort') return fakeRecord({ status: 'healthy', scope_type: 'cohort', scope_value: 'cohort-9' });
      return fakeRecord({ status: 'quarantined', scope_type: 'global', scope_value: null });
    });

    const result = await getReliabilityStatus('attendance', 'attendance.*', { scopeType: 'cohort', scopeValue: 'cohort-9' });

    expect(result.status).toBe('quarantined');
  });

  it('a request scoped to global never queries a specific cohort record', async () => {
    mockFindOne.mockResolvedValue(null);

    await getReliabilityStatus('attendance', 'attendance.*', { scopeType: 'global', scopeValue: null });

    expect(mockFindOne).toHaveBeenCalledTimes(1);
    expect(mockFindOne.mock.calls[0][0].where.scope_type).toBe('global');
  });
});

describe('isMetricUsable — fail-closed', () => {
  it.each(['degraded', 'quarantined', 'recovering'])('status=%s is NOT usable — only healthy is', async (status) => {
    mockFindOne.mockResolvedValue(fakeRecord({ status }));

    expect(await isMetricUsable('attendance', 'attendance.*')).toBe(false);
  });

  it('status=healthy is usable', async () => {
    mockFindOne.mockResolvedValue(fakeRecord({ status: 'healthy' }));

    expect(await isMetricUsable('attendance', 'attendance.*')).toBe(true);
  });

  it('no record at all is usable (healthy by default)', async () => {
    mockFindOne.mockResolvedValue(null);

    expect(await isMetricUsable('attendance', 'attendance.*')).toBe(true);
  });
});

describe('declareReliabilityChange', () => {
  it('happy path: creates/updates the record and emits a real metric.quarantined audit event', async () => {
    const record = fakeRecord({ status: 'degraded' });
    mockFindOrCreate.mockResolvedValue([record, true]);

    const result = await declareReliabilityChange({
      sourceSystem: 'attendance',
      metricKey: 'attendance.*',
      status: 'quarantined',
      severity: 'high',
      reason: 'Check-in system missing students since Monday',
      declaredBySource: 'manager_report',
      declaredByEmail: 'ali@colaberry.com',
    });

    expect(record.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'quarantined', severity: 'high', reason: 'Check-in system missing students since Monday' }),
    );
    expect(mockEmitAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'metric.quarantined', outcome: 'success' }),
    );
    expect(result).toBe(record);
  });

  it('a degraded (not quarantined) declaration emits metric.degraded, not metric.quarantined', async () => {
    const record = fakeRecord({ status: 'degraded' });
    mockFindOrCreate.mockResolvedValue([record, true]);

    await declareReliabilityChange({
      sourceSystem: 'attendance',
      metricKey: 'attendance.*',
      status: 'degraded',
      reason: 'Intermittent sync failures observed',
      declaredBySource: 'automated_monitor',
    });

    expect(mockEmitAiEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'metric.degraded' }));
  });

  it('a re-declaration on an existing record clears any stale restored_by/restored_at fields', async () => {
    const record = fakeRecord({ status: 'healthy', restored_by_email: 'someone@colaberry.com', restored_at: new Date() });
    mockFindOrCreate.mockResolvedValue([record, false]);

    await declareReliabilityChange({
      sourceSystem: 'attendance',
      metricKey: 'attendance.*',
      status: 'quarantined',
      reason: 'Broke again',
      declaredBySource: 'manager_report',
      declaredByEmail: 'ali@colaberry.com',
    });

    expect(record.update).toHaveBeenCalledWith(expect.objectContaining({ restored_by_email: null, restored_at: null }));
  });
});

describe('restoreMetric', () => {
  it('happy path: restores an existing quarantined record to healthy and emits a real audit event carrying the true previous status', async () => {
    const record = fakeRecord({ status: 'quarantined' });
    mockFindOne.mockResolvedValue(record);

    await restoreMetric({
      sourceSystem: 'attendance',
      metricKey: 'attendance.*',
      recoveryEvidence: 'Check-in system fixed and validated against 3 days of reconciled data',
      restoredByEmail: 'ali@colaberry.com',
    });

    expect(record.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'healthy', restored_by_email: 'ali@colaberry.com' }),
    );
    expect(mockEmitAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'metric.restored',
        metadata: expect.objectContaining({ previous_status: 'quarantined' }),
      }),
    );
  });

  it('honesty boundary: refuses to restore a metric with no existing record — nothing to restore', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(
      restoreMetric({ sourceSystem: 'attendance', metricKey: 'attendance.*', recoveryEvidence: 'fixed', restoredByEmail: 'ali@colaberry.com' }),
    ).rejects.toThrow(MetricRestorationError);
  });

  it('honesty boundary: refuses to restore an already-healthy metric', async () => {
    mockFindOne.mockResolvedValue(fakeRecord({ status: 'healthy' }));

    await expect(
      restoreMetric({ sourceSystem: 'attendance', metricKey: 'attendance.*', recoveryEvidence: 'fixed', restoredByEmail: 'ali@colaberry.com' }),
    ).rejects.toThrow(MetricRestorationError);
  });
});
