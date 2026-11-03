import type { Request, Response, NextFunction } from 'express';

const verifyMagicLink = jest.fn();
const recordSignInLinkUse = jest.fn();
const recordSignInLinkInvalid = jest.fn();
jest.mock('../../services/participantService', () => ({
  ...jest.requireActual('../../services/participantService'),
  verifyMagicLink: (...a: unknown[]) => verifyMagicLink(...a),
}));
jest.mock('../../services/signInLinkEvents', () => ({
  recordSignInLinkUse: (...a: unknown[]) => recordSignInLinkUse(...a),
  recordSignInLinkInvalid: (...a: unknown[]) => recordSignInLinkInvalid(...a),
}));

import { handleVerifyMagicLink } from '../participantController';

/**
 * C106: GET /api/portal/verify counts what happened to the link, on the server, without changing the response.
 * The recorder is mocked here (its own SQL is tested in signInLinkEvents.test.ts); this pins the wiring: which outcome
 * is recorded, that the token never reaches the recorder, and that the response is the same as before.
 */
const TOKEN = 'not-a-real-link-token-c106';
const run = async (query: Record<string, unknown>) => {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn().mockReturnThis();
  const next = jest.fn();
  await handleVerifyMagicLink({ query } as unknown as Request, { status, json } as unknown as Response, next as unknown as NextFunction);
  return { status, json, next };
};

beforeEach(() => {
  jest.clearAllMocks();
  recordSignInLinkUse.mockResolvedValue(undefined);
  recordSignInLinkInvalid.mockResolvedValue(undefined);
});

describe('handleVerifyMagicLink records link use (C106)', () => {
  it('a valid link: one use recorded for that enrollment, and the session is returned unchanged', async () => {
    const result = { jwt: 'j.w.t', enrollment: { id: 'e1', email: 'a@b.co' } };
    verifyMagicLink.mockResolvedValue(result);
    const r = await run({ token: TOKEN });
    expect(recordSignInLinkUse).toHaveBeenCalledWith('e1');
    expect(recordSignInLinkInvalid).not.toHaveBeenCalled();
    expect(r.json).toHaveBeenCalledWith(result);
    expect(r.status).not.toHaveBeenCalled();
  });

  it('an invalid or expired link: counted as invalid, and the same 401 as before', async () => {
    verifyMagicLink.mockResolvedValue(null);
    const r = await run({ token: TOKEN });
    expect(recordSignInLinkInvalid).toHaveBeenCalledTimes(1);
    expect(recordSignInLinkUse).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(401);
    expect(r.json).toHaveBeenCalledWith({ error: 'Invalid or expired link. Please request a new one.' });
  });

  it('no token: 400 and nothing recorded (not a link at all)', async () => {
    const r = await run({});
    expect(r.status).toHaveBeenCalledWith(400);
    expect(recordSignInLinkUse).not.toHaveBeenCalled();
    expect(recordSignInLinkInvalid).not.toHaveBeenCalled();
    expect(verifyMagicLink).not.toHaveBeenCalled();
  });

  it('the token value never reaches the recorder', async () => {
    verifyMagicLink.mockResolvedValue({ jwt: 'j', enrollment: { id: 'e1' } });
    await run({ token: TOKEN });
    verifyMagicLink.mockResolvedValue(null);
    await run({ token: TOKEN });
    const args = JSON.stringify([...recordSignInLinkUse.mock.calls, ...recordSignInLinkInvalid.mock.calls]);
    expect(args).not.toContain(TOKEN);
  });
});
