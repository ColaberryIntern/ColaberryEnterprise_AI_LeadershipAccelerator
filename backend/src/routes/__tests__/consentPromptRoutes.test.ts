const enrollmentFindByPk = jest.fn();
const getCurrentConsentMock = jest.fn();
const recordConsentMock = jest.fn();

jest.mock('../../models', () => ({
  Enrollment: { findByPk: (...a: unknown[]) => enrollmentFindByPk(...a) },
}));
jest.mock('../../services/consentService', () => ({
  getCurrentConsent: (...a: unknown[]) => getCurrentConsentMock(...a),
  recordConsent: (...a: unknown[]) => recordConsentMock(...a),
}));
jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, _res: any, next: any) => {
    req.participant = { sub: 'enr-1' };
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import consentPromptRoutes from '../consentPromptRoutes';

function app() {
  const a = express();
  a.use(express.json());
  a.use(consentPromptRoutes);
  return a;
}

beforeEach(() => {
  [enrollmentFindByPk, getCurrentConsentMock, recordConsentMock].forEach((m) => m.mockReset());
  enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@b.com' });
  getCurrentConsentMock.mockResolvedValue(null);
  recordConsentMock.mockResolvedValue({ id: 'c1' });
});

describe('who gets asked', () => {
  it('asks a learner with no consent record', async () => {
    const r = await request(app()).get('/api/portal/consent-prompt');
    expect(r.status).toBe(200);
    expect(r.body.show).toBe(true);
    expect(r.body.text).toMatch(/unsubscribe/i);
  });

  it('does not ask someone who already granted', async () => {
    getCurrentConsentMock.mockResolvedValue({ status: 'granted' });
    const r = await request(app()).get('/api/portal/consent-prompt');
    expect(r.body.show).toBe(false);
    expect(r.body.reason).toBe('already_granted');
  });

  it('does not ask someone who already said no', async () => {
    getCurrentConsentMock.mockResolvedValue({ status: 'revoked' });
    const r = await request(app()).get('/api/portal/consent-prompt');
    expect(r.body.show).toBe(false);
  });

  it('does not nag when the lookup fails', async () => {
    // Fail closed on the ASK, not on access. The worst case is one prompt not
    // shown; the learner keeps full use of the portal either way.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    getCurrentConsentMock.mockRejectedValue(new Error('db down'));
    const r = await request(app()).get('/api/portal/consent-prompt');
    expect(r.status).toBe(200);
    expect(r.body.show).toBe(false);
  });
});

describe('the three answers are genuinely different', () => {
  it('accept records express_written consent', async () => {
    const r = await request(app()).post('/api/portal/consent-prompt').send({ choice: 'accept' });
    expect(r.body).toEqual({ ok: true, recorded: true });
    expect(recordConsentMock.mock.calls[0][0]).toMatchObject({
      status: 'granted',
      basis: 'express_written',
      source: 'in_app_prompt',
    });
  });

  it('decline records a revocation so we stop asking', async () => {
    await request(app()).post('/api/portal/consent-prompt').send({ choice: 'decline' });
    expect(recordConsentMock.mock.calls[0][0]).toMatchObject({
      status: 'revoked',
      source: 'in_app_prompt_decline',
    });
  });

  it('decline does NOT record an express basis — a refusal is not a grant', async () => {
    await request(app()).post('/api/portal/consent-prompt').send({ choice: 'decline' });
    expect(recordConsentMock.mock.calls[0][0].basis).toBeUndefined();
  });

  it('DISMISS records nothing — "not now" is not "no"', async () => {
    // Collapsing dismiss into decline would put words in their mouth and
    // permanently suppress someone who just wanted the card gone.
    const r = await request(app()).post('/api/portal/consent-prompt').send({ choice: 'dismiss' });
    expect(r.body).toEqual({ ok: true, recorded: false });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it('rejects a choice outside the three', async () => {
    const r = await request(app()).post('/api/portal/consent-prompt').send({ choice: 'maybe' });
    expect(r.status).toBe(400);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});

describe('it can never break the portal', () => {
  it('returns 200 even when recording throws', async () => {
    // A consent write that did not land must not look like a broken portal.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    recordConsentMock.mockRejectedValue(new Error('db down'));
    const r = await request(app()).post('/api/portal/consent-prompt').send({ choice: 'accept' });
    expect(r.status).toBe(200);
    expect(r.body.recorded).toBe(false);
  });

  it('handles a learner with no email on file', async () => {
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: null });
    const get = await request(app()).get('/api/portal/consent-prompt');
    expect(get.body.show).toBe(false);
    const post = await request(app()).post('/api/portal/consent-prompt').send({ choice: 'accept' });
    expect(post.status).toBe(200);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});

describe('it is a prompt, not a gate', () => {
  it('exposes only the two prompt endpoints and blocks nothing else', async () => {
    // Consent extracted as the price of reaching your own account is not freely
    // given, and would be worth less than the default rule it replaced.
    const other = await request(app()).get('/api/portal/timeline');
    expect(other.status).toBe(404); // not intercepted, not 401/403
  });
});
