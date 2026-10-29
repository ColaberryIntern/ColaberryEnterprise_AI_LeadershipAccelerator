import { endBroadcast } from '../broadcastProducer';

/**
 * The producer command client's own rules.
 *
 * This module had no test of its own. Its error mapping was exercised only through
 * `liveMiniPlayer.endControl.test.tsx`, which injects a fake `endBroadcast` and asserts what the
 * COMPONENT does with each outcome — so every assertion about which HTTP status becomes which
 * outcome was being made against a stub rather than against this code. That is the same gap
 * `broadcastHeartbeat.test.ts` opens by naming: a module proven in isolation is not evidence that
 * anything calls it, and the mirror image is just as true — a caller tested against a stub is not
 * evidence that the real module maps anything correctly.
 *
 * It matters here more than usual because this is the only producer control that exists, ending is
 * terminal, and the outcomes it returns are the only thing standing between a failed command and a
 * producer who believes the broadcast ended.
 */

const mockPost = jest.fn();
jest.mock('../../utils/portalApi', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockPost(...args) },
}));

const OCC = 'e5c4a59f-48de-4dba-815e-f14e165e0eef';

/** An axios-shaped rejection: the only shape this module knows how to read. */
const httpError = (status: number, data?: Record<string, unknown>) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { ok: true } });
});

describe('the request it sends', () => {
  it('posts the end command for that occurrence, guarded on the version it was given', async () => {
    await endBroadcast(OCC, 7);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      `/api/portal/broadcasts/${OCC}/command`,
      { command: 'end', expected_version: 7 },
    );
  });

  it('sends version 0 rather than dropping it, because 0 is a legal version', async () => {
    // `expected_version` is `z.number().int().nonnegative()`, so 0 is valid input. A falsy check
    // anywhere on this path would omit the field and the request would fail schema validation
    // with a 400 — a bug that only ever appears on a freshly created occurrence.
    await endBroadcast(OCC, 0);
    expect(mockPost).toHaveBeenCalledWith(
      `/api/portal/broadcasts/${OCC}/command`,
      { command: 'end', expected_version: 0 },
    );
  });

  it('sends nothing beyond the two fields the schema accepts', async () => {
    // The route schema is `.strict()`, so an extra key is a 400 rather than an ignored field.
    await endBroadcast(OCC, 3);
    expect(Object.keys(mockPost.mock.calls[0][1])).toEqual(['command', 'expected_version']);
  });
});

describe("what the server's answer means to the producer", () => {
  it('reports the broadcast ended when the command is accepted', async () => {
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'ended' });
  });

  it('calls a 403 a refusal, not a failure — this viewer is simply not a producer', async () => {
    mockPost.mockRejectedValue(httpError(403));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'forbidden' });
  });

  it('calls a 401 a refusal too, so an expired token does not read as a broken server', async () => {
    mockPost.mockRejectedValue(httpError(401));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'forbidden' });
  });

  it('calls a 500 a failure', async () => {
    mockPost.mockRejectedValue(httpError(500));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'failed' });
  });

  it('never throws, so no caller has to wrap it in its own try', async () => {
    mockPost.mockRejectedValue(httpError(503));
    await expect(endBroadcast(OCC, 7)).resolves.toHaveProperty('outcome');
  });
});

describe('a version conflict', () => {
  it('reports a conflict instead of retrying, because the occurrence moved under us', async () => {
    mockPost.mockRejectedValue(httpError(409, { error: 'VersionConflict' }));
    const result = await endBroadcast(OCC, 7);
    expect(result.outcome).toBe('conflict');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('carries the server version through when the server sends one', async () => {
    mockPost.mockRejectedValue(httpError(409, { version: 9 }));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'conflict', currentVersion: 9 });
  });

  it('leaves currentVersion undefined when the body has no version — which is every real 409', async () => {
    // Recorded rather than assumed. The backend's conflict body is `{ error, reason }` and nothing
    // else (`broadcastController.ts:90`, built from `tagged('VersionConflict', 409, …)` in
    // `broadcastCommandService.ts`). So the branch above is reachable only from a test, and this is
    // the case production actually produces. Asserting both keeps the optimistic branch honest:
    // if the server ever starts sending a version, the test above is already there to prove it.
    mockPost.mockRejectedValue(httpError(409, { error: 'VersionConflict', reason: 'row changed between read and write' }));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'conflict', currentVersion: undefined });
  });

  it('refuses a non-numeric version rather than passing a string on to arithmetic', async () => {
    mockPost.mockRejectedValue(httpError(409, { version: '9' }));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'conflict', currentVersion: undefined });
  });
});

describe('answers that do not look like an HTTP response at all', () => {
  it('treats a transport failure as a failure, not a conflict', async () => {
    // No `response` at all: DNS, offline, CORS, a dropped connection mid-flight. The dangerous
    // misreading would be to fall through to `conflict`, which tells the producer the broadcast is
    // fine when nobody knows whether the command arrived.
    mockPost.mockRejectedValue(new Error('Network Error'));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'failed' });
  });

  it('survives a thrown non-object', async () => {
    mockPost.mockRejectedValue('boom');
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'failed' });
  });

  it('survives a response with no status', async () => {
    mockPost.mockRejectedValue(Object.assign(new Error('odd'), { response: {} }));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'failed' });
  });
});

describe('a known gap, asserted so that closing it breaks this file on purpose', () => {
  it('reports a rate-limited command as a bare failure today', async () => {
    // The command route is limited to 30/min and answers 429 `{error:'RateLimited'}`
    // (`broadcastRoutes.ts`). This module has no branch for it, so the producer is told the command
    // failed rather than that they should wait — and a producer told "failed" during a live
    // broadcast will click again, which is the one thing the limiter is asking them not to do.
    //
    // This is a characterization test, not an endorsement. It is here so that adding a
    // `rate_limited` outcome fails loudly rather than silently changing what the UI says.
    mockPost.mockRejectedValue(httpError(429, { error: 'RateLimited', reason: 'too_many_commands' }));
    await expect(endBroadcast(OCC, 7)).resolves.toEqual({ outcome: 'failed' });
  });
});
