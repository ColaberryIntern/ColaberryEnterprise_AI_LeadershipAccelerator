/**
 * A successful PaySimple call does not have to return a body.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 *
 * `apiRequest` ended with `await response.json()`. PaySimple's
 * `/v4/recurringpayment/{id}/suspend` answers 200 with an EMPTY body, so that
 * threw "Unexpected end of JSON input" — AFTER the gateway had already done the
 * work. The caller saw a failure for an action that succeeded.
 *
 * In `suspendScheduleForSubscription` the throw landed between the suspend and
 * the UPDATE that clears `paysimple_schedule_id`. The result:
 *
 *   - PaySimple:  schedule Suspended, no further charges
 *   - our book:   paysimple_schedule_id still set, member still reads as auto-pay
 *   - the log:    `schedule_suspend_failed`, telling an operator to go and fix
 *                 something that was not broken
 *
 * That is the cancellation path. A member cancels, we suspend, our code reports
 * failure, and the book keeps saying they are on auto-pay — which is exactly the
 * state `checkSchedulesMatchBook` raises as "a schedule we think exists but the
 * gateway does not".
 *
 * Found 2026-09-01 suspending Victor Chukwukere's schedule 4511896 after he
 * deferred to the November cohort. The gateway returned Suspended; our code
 * returned { suspended: false }. Verified by reading the schedule back.
 *
 * The distinction these tests protect: an EMPTY body on a 2xx is success with
 * nothing to say. A NON-EMPTY body that will not parse is a real contract
 * violation and must still throw.
 */
import { apiRequest } from '../paysimpleService';

const realFetch = global.fetch;

function mockResponse(body: string, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  }) as never;
}

beforeEach(() => {
  process.env.PAYSIMPLE_API_KEY = process.env.PAYSIMPLE_API_KEY || 'test-key';
  process.env.PAYSIMPLE_USER_ID = process.env.PAYSIMPLE_USER_ID || 'test-user';
});

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('a 2xx with no body is success, not failure', () => {
  it('returns null for a completely empty body', async () => {
    // This is the suspend endpoint's actual behaviour.
    mockResponse('');
    await expect(apiRequest('PUT', '/v4/recurringpayment/4511896/suspend')).resolves.toBeNull();
  });

  it('returns null for a whitespace-only body', async () => {
    mockResponse('   \n  ');
    await expect(apiRequest('PUT', '/v4/recurringpayment/1/suspend')).resolves.toBeNull();
  });

  it('does not throw the JSON parse error that masked a successful suspend', async () => {
    mockResponse('');
    let threw: Error | null = null;
    try {
      await apiRequest('PUT', '/v4/recurringpayment/4511896/suspend');
    } catch (err) {
      threw = err as Error;
    }
    expect(threw).toBeNull();
  });
});

describe('a body that is present but unparseable still fails', () => {
  it('throws rather than silently returning null', async () => {
    // Narrowing the empty-body case must not turn every malformed response into
    // a silent success. That would hide a genuinely broken upstream.
    mockResponse('<html>502 Bad Gateway</html>');
    await expect(apiRequest('GET', '/v4/customer/1')).rejects.toThrow(/unparseable body/i);
  });

  it('says what actually arrived, so the failure is diagnosable', async () => {
    mockResponse('<html>502 Bad Gateway</html>');
    await expect(apiRequest('GET', '/v4/customer/1')).rejects.toThrow(/502 Bad Gateway/);
  });
});

describe('normal responses are unchanged', () => {
  it('still unwraps the Response envelope', async () => {
    mockResponse(JSON.stringify({ Response: { Id: 4511896, ScheduleStatus: 'Suspended' } }));
    await expect(apiRequest('GET', '/v4/recurringpayment/4511896'))
      .resolves.toEqual({ Id: 4511896, ScheduleStatus: 'Suspended' });
  });

  it('still returns a bare payload that has no envelope', async () => {
    mockResponse(JSON.stringify([{ Id: 1 }, { Id: 2 }]));
    await expect(apiRequest('GET', '/v4/recurringpayment')).resolves.toEqual([{ Id: 1 }, { Id: 2 }]);
  });
});
