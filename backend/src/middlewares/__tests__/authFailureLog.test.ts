/**
 * authFailureLog — shared helper (BC #10099862873 P1 item 2) used by all 3
 * JWT middlewares. Fire-and-forget: must never throw back into the caller,
 * even if the downstream aiEventService import or write fails.
 */
const mockEmitAiEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: (...a: any[]) => mockEmitAiEvent(...a) }));

import { describeCaller, logAuthFailure } from '../authFailureLog';

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
      metadata: { ip: '203.0.113.5', message: 'jwt expired', forwarded_for: null, user_agent: null },
    });
  });

  it('boundary: no ip/message available still emits a row with null fields, not undefined', async () => {
    logAuthFailure('alumni_auth_failed', {}, 'alumni');
    await flush();

    expect(mockEmitAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { ip: null, message: null, forwarded_for: null, user_agent: null } })
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

  /**
   * Why these exist: `req.ip` is the Cloudflare edge, not the caller. Traffic is
   * Cloudflare -> nginx -> Express with `trust proxy` at 1, so a week of
   * admin_auth_failed rows could only ever name the CDN (162.159.x / 172.7x.x).
   * When something started failing auth roughly once a minute, the one field
   * that could have identified it was blind.
   */
  it('records the real caller from the forwarded chain, alongside the edge ip', async () => {
    logAuthFailure('admin_auth_failed', { message: 'jwt expired' }, 'admin', '172.71.167.175', {
      ip: '172.71.167.175',
      headers: { 'x-forwarded-for': '203.0.113.9, 172.71.167.175', 'user-agent': 'axios/1.7.2' },
    });
    await flush();

    expect(mockEmitAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          ip: '172.71.167.175',                              // edge, unchanged meaning
          forwarded_for: '203.0.113.9, 172.71.167.175',      // real caller is leftmost
          user_agent: 'axios/1.7.2',                         // names an automated client
        }),
      })
    );
  });

  it('omitting the request keeps the old call signature working', async () => {
    expect(() => logAuthFailure('admin_auth_failed', new Error('x'), 'admin', '1.2.3.4')).not.toThrow();
    await flush();
    expect(mockEmitAiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ forwarded_for: null, user_agent: null }) })
    );
  });
});

describe('describeCaller', () => {
  it('reads both headers when present', () => {
    expect(describeCaller({ headers: { 'x-forwarded-for': '203.0.113.9, 172.71.1.1', 'user-agent': 'curl/8' } }))
      .toEqual({ forwarded_for: '203.0.113.9, 172.71.1.1', user_agent: 'curl/8' });
  });

  it('returns nulls rather than undefined for a request with no headers at all', () => {
    expect(describeCaller({})).toEqual({ forwarded_for: null, user_agent: null });
    expect(describeCaller(undefined)).toEqual({ forwarded_for: null, user_agent: null });
  });

  it('treats a blank header as absent', () => {
    expect(describeCaller({ headers: { 'x-forwarded-for': '   ' } }).forwarded_for).toBeNull();
  });

  it('handles a repeated header arriving as an array', () => {
    expect(describeCaller({ headers: { 'x-forwarded-for': ['203.0.113.9', '198.51.100.2'] } }).forwarded_for)
      .toBe('203.0.113.9');
  });

  it('caps absurd header values so one caller cannot bloat the events table', () => {
    const huge = 'a'.repeat(5000);
    expect(describeCaller({ headers: { 'user-agent': huge } }).user_agent!.length).toBe(200);
  });
});
