/**
 * authFailureLog — shared helper (BC #10099862873 P1 item 2) used by all 3
 * JWT middlewares. Fire-and-forget: must never throw back into the caller,
 * even if the downstream aiEventService import or write fails.
 */
const mockEmitAiEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: (...a: any[]) => mockEmitAiEvent(...a) }));

import { logAuthFailure } from '../authFailureLog';

// Flush the fire-and-forget dynamic import() + .then() chain before asserting.
const flush = () => new Promise((r) => setImmediate(r));

describe('logAuthFailure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: classifies the error and emits an ai_events row with the right actor/event type/ip/message', async () => {
    logAuthFailure('participant_auth_failed', { name: 'TokenExpiredError', message: 'jwt expired' }, 'participant', '203.0.113.5');
    await flush();

    expect(mockEmitAiEvent).toHaveBeenCalledWith({
      event_type: 'participant_auth_failed',
      outcome: 'failure',
      error_class: 'AuthError',
      actor_type: 'participant',
      metadata: { ip: '203.0.113.5', message: 'jwt expired' },
    });
  });

  it('boundary: no ip/message available still emits a row with null fields, not undefined', async () => {
    logAuthFailure('alumni_auth_failed', {}, 'alumni');
    await flush();

    expect(mockEmitAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { ip: null, message: null } })
    );
  });

  it('failure path: an emitAiEvent rejection is swallowed, never thrown back to the caller', async () => {
    mockEmitAiEvent.mockRejectedValueOnce(new Error('DB down'));

    expect(() => logAuthFailure('alumni_auth_failed', new Error('bad token'), 'alumni')).not.toThrow();
    await flush();
  });

  it('boundary: does not throw synchronously even for a null err', () => {
    expect(() => logAuthFailure('admin_auth_failed', null, 'admin')).not.toThrow();
  });
});
