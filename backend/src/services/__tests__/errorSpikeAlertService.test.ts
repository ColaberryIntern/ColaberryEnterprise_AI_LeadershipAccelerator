/**
 * errorSpikeAlertService — BC #10099862873 (P1, item 2): turns the newly
 * classified ai_events rows (auth middleware + apollo/ghl/basecamp/synthflow
 * wrappers) into alerts through the shared alert service.
 *
 * Thresholds are absolute failure counts within the window, not a rate —
 * these event types are only ever emitted on the failure branch (no matching
 * 'success' outcome is emitted anywhere for the same event_type), so a
 * percentage against that non-existent denominator would always be 100%.
 */
jest.mock('../../models/AiEvent', () => ({ findAll: jest.fn(), findOne: jest.fn() }));
jest.mock('../alertService', () => ({ emitAlert: jest.fn().mockResolvedValue({ id: 'alert-1' }) }));

import { evaluateErrorSpike, checkErrorClassSpikes } from '../errorSpikeAlertService';
import AiEvent from '../../models/AiEvent';
import { emitAlert } from '../alertService';

const findAllEvents = AiEvent.findAll as jest.Mock;
const findOneEvent = AiEvent.findOne as jest.Mock;
const mockEmitAlert = emitAlert as jest.Mock;

describe('evaluateErrorSpike — pure evaluator', () => {
  it('happy path: a low failure count produces no alert', () => {
    expect(evaluateErrorSpike('admin_auth_failed', 1)).toEqual([]);
  });

  it('boundary: one below the warning count does not trigger', () => {
    expect(evaluateErrorSpike('admin_auth_failed', 9)).toEqual([]);
  });

  it('boundary: exactly the warning count triggers a warning', () => {
    const alerts = evaluateErrorSpike('admin_auth_failed', 10);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning');
    expect(alerts[0].impactArea).toBe('auth');
  });

  it('failure path: at or above the critical count escalates to critical', () => {
    const alerts = evaluateErrorSpike('apollo_request_failed', 25);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('critical');
    expect(alerts[0].impactArea).toBe('external_api_apollo');
  });

  it('boundary: an unwatched event_type still evaluates but reports unknown impact area', () => {
    const alerts = evaluateErrorSpike('some_unrelated_event', 12);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].impactArea).toBe('unknown');
  });

  it('regression: a sample failure message is surfaced in the alert, not just the count', () => {
    const occurredAt = new Date('2026-07-17T12:00:00Z');
    const alerts = evaluateErrorSpike('ghl_request_failed', 15, { message: 'Invalid API key', ip: null, occurredAt });
    expect(alerts[0].description).toContain('Invalid API key');
    expect(alerts[0].metadata.sample_failure).toEqual(
      expect.objectContaining({ message: 'Invalid API key', occurred_at: occurredAt.toISOString() })
    );
  });

  it('boundary: no sample provided does not crash and omits sample_failure', () => {
    const alerts = evaluateErrorSpike('ghl_request_failed', 15);
    expect(alerts[0].metadata.sample_failure).toBeNull();
  });

  it('regression: description never claims a percentage — only an absolute count is measurable here', () => {
    const alerts = evaluateErrorSpike('admin_auth_failed', 12);
    expect(alerts[0].description).not.toMatch(/%/);
    expect(alerts[0].metadata).not.toHaveProperty('error_rate');
    expect(alerts[0].metadata).not.toHaveProperty('total');
  });
});

describe('checkErrorClassSpikes — orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: counts failures per event_type from a failure-only query and alerts only the breaching one', async () => {
    findAllEvents.mockResolvedValue([
      { event_type: 'admin_auth_failed', count: '12' },
      { event_type: 'ghl_request_failed', count: '2' },
    ]);
    findOneEvent.mockResolvedValue({ metadata: { message: 'jwt expired', ip: '1.2.3.4' }, created_at: new Date('2026-07-17T12:00:00Z') });

    await checkErrorClassSpikes();

    expect(findAllEvents.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ outcome: 'failure' })
    );
    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'warning', impactArea: 'auth' })
    );
    expect(mockEmitAlert.mock.calls[0][0].metadata.sample_failure).toEqual(
      expect.objectContaining({ message: 'jwt expired', ip: '1.2.3.4' })
    );
  });

  it('boundary: no rows in the window — resolves cleanly with no alerts and never queries for a sample', async () => {
    findAllEvents.mockResolvedValue([]);

    await checkErrorClassSpikes();

    expect(mockEmitAlert).not.toHaveBeenCalled();
    expect(findOneEvent).not.toHaveBeenCalled();
  });

  it('boundary: a breaching event type with no matching sample row (edge case) still alerts, with sample_failure null', async () => {
    findAllEvents.mockResolvedValue([{ event_type: 'admin_auth_failed', count: '11' }]);
    findOneEvent.mockResolvedValue(null);

    await checkErrorClassSpikes();

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0].metadata.sample_failure).toBeNull();
  });

  it('failure isolation: an emitAlert failure for one event type does not throw or block others', async () => {
    findAllEvents.mockResolvedValue([
      { event_type: 'admin_auth_failed', count: '30' },
      { event_type: 'apollo_request_failed', count: '30' },
    ]);
    findOneEvent.mockResolvedValue(null);
    mockEmitAlert.mockRejectedValueOnce(new Error('DB down')).mockResolvedValueOnce({ id: 'alert-2' });

    await expect(checkErrorClassSpikes()).resolves.not.toThrow();
    expect(mockEmitAlert).toHaveBeenCalledTimes(2);
  });
});
