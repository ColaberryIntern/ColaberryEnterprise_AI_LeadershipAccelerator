/**
 * errorSpikeAlertService — BC #10099862873 (P1, item 2): turns the newly
 * classified ai_events rows (auth middleware + apollo/ghl/basecamp/synthflow
 * wrappers) into alerts through the shared alert service.
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
  it('happy path: a low failure rate produces no alert', () => {
    expect(evaluateErrorSpike('admin_auth_failed', 20, 1)).toEqual([]);
  });

  it('boundary: below the min sample size, even 100% failure does not trigger', () => {
    expect(evaluateErrorSpike('admin_auth_failed', 4, 4)).toEqual([]);
  });

  it('boundary: exactly 50% (5/10) triggers a warning', () => {
    const alerts = evaluateErrorSpike('admin_auth_failed', 10, 5);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning');
    expect(alerts[0].impactArea).toBe('auth');
  });

  it('failure path: 80%+ escalates to critical', () => {
    const alerts = evaluateErrorSpike('apollo_request_failed', 10, 8);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('critical');
    expect(alerts[0].impactArea).toBe('external_api_apollo');
  });

  it('boundary: an unwatched event_type still evaluates but reports unknown impact area', () => {
    const alerts = evaluateErrorSpike('some_unrelated_event', 10, 6);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].impactArea).toBe('unknown');
  });

  it('regression: a sample failure message is surfaced in the alert, not just the aggregate rate', () => {
    const occurredAt = new Date('2026-07-17T12:00:00Z');
    const alerts = evaluateErrorSpike('ghl_request_failed', 10, 8, { message: 'Invalid API key', ip: null, occurredAt });
    expect(alerts[0].description).toContain('Invalid API key');
    expect(alerts[0].metadata.sample_failure).toEqual(
      expect.objectContaining({ message: 'Invalid API key', occurred_at: occurredAt.toISOString() })
    );
  });

  it('boundary: no sample provided does not crash and omits sample_failure', () => {
    const alerts = evaluateErrorSpike('ghl_request_failed', 10, 8);
    expect(alerts[0].metadata.sample_failure).toBeNull();
  });
});

describe('checkErrorClassSpikes — orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: pivots grouped rows into per-event-type totals, fetches the sample failure, and alerts only the breaching one', async () => {
    findAllEvents.mockResolvedValue([
      { event_type: 'admin_auth_failed', outcome: 'failure', count: '8' },
      { event_type: 'admin_auth_failed', outcome: 'success', count: '2' },
      { event_type: 'ghl_request_failed', outcome: 'failure', count: '0' },
      { event_type: 'ghl_request_failed', outcome: 'success', count: '20' },
    ]);
    findOneEvent.mockResolvedValue({ metadata: { message: 'jwt expired', ip: '1.2.3.4' }, created_at: new Date('2026-07-17T12:00:00Z') });

    await checkErrorClassSpikes();

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'critical', impactArea: 'auth' })
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
    findAllEvents.mockResolvedValue([
      { event_type: 'admin_auth_failed', outcome: 'failure', count: '8' },
      { event_type: 'admin_auth_failed', outcome: 'success', count: '2' },
    ]);
    findOneEvent.mockResolvedValue(null);

    await checkErrorClassSpikes();

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0].metadata.sample_failure).toBeNull();
  });

  it('failure isolation: an emitAlert failure for one event type does not throw or block others', async () => {
    findAllEvents.mockResolvedValue([
      { event_type: 'admin_auth_failed', outcome: 'failure', count: '9' },
      { event_type: 'admin_auth_failed', outcome: 'success', count: '1' },
      { event_type: 'apollo_request_failed', outcome: 'failure', count: '9' },
      { event_type: 'apollo_request_failed', outcome: 'success', count: '1' },
    ]);
    findOneEvent.mockResolvedValue(null);
    mockEmitAlert.mockRejectedValueOnce(new Error('DB down')).mockResolvedValueOnce({ id: 'alert-2' });

    await expect(checkErrorClassSpikes()).resolves.not.toThrow();
    expect(mockEmitAlert).toHaveBeenCalledTimes(2);
  });
});
