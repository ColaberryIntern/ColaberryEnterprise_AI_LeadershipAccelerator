const findAll = jest.fn();
const sendTrainingWelcome = jest.fn();
const logCommunication = jest.fn();

jest.mock('../../../models', () => ({
  CommunicationLog: { findAll: (...a: unknown[]) => findAll(...a) },
}));
jest.mock('../../../config/env', () => ({
  env: {
    trainingWelcomeTokenTtlDays: 30,
    frontendUrl: 'https://enterprise.colaberry.ai',
    trainingWelcomeFromEmail: 'training@colaberry.com',
    trainingWelcomeFromName: 'Colaberry Training',
  },
}));
jest.mock('../../emailService', () => ({
  sendTrainingWelcome: (...a: unknown[]) => sendTrainingWelcome(...a),
}));
jest.mock('../../communicationLogService', () => ({
  logCommunication: (...a: unknown[]) => logCommunication(...a),
}));

import { sendPortalWelcome, alreadyWelcomed, WELCOME_EVENTS } from '../sendPortalWelcome';

/**
 * The welcome that `/api/portal/free-signup` never sent.
 *
 * WHAT THIS SUITE IS GUARDING, in order of how much it would cost to get wrong:
 *
 *  1. The send happens at all. That is the defect: 113 production signups over
 *     three days with zero communication_logs rows between them.
 *  2. It cannot happen TWICE. There is a recovery script that mails 110 real people
 *     and must be safe to re-run after a partial failure, so idempotency here is
 *     load-bearing rather than decorative.
 *  3. It fails CLOSED. If the idempotency guard cannot be evaluated, the send is
 *     refused. A missed welcome is fixed by re-running; a duplicate is not fixable.
 *  4. The token lands on the enrollment that was passed in, never one found by
 *     email. `enrollmentService` carries the comment about why: one person with
 *     several enrollments could otherwise be signed in to the wrong account.
 */

function enrollmentFake(overrides: Record<string, unknown> = {}) {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    enrollment: {
      id: 'enr-1',
      full_name: 'Dana Reyes',
      email: 'dana@example.com',
      update,
      ...overrides,
    },
    update,
  };
}

beforeEach(() => {
  findAll.mockReset();
  sendTrainingWelcome.mockReset();
  logCommunication.mockReset();
  findAll.mockResolvedValue([]);
  sendTrainingWelcome.mockResolvedValue({ sent: true, messageId: 'msg-1' });
  logCommunication.mockResolvedValue({ id: 1 });
});

describe('sendPortalWelcome - the send that was missing', () => {
  it('sends, and reports sent', async () => {
    const { enrollment } = enrollmentFake();
    const r = await sendPortalWelcome({ enrollment, leadId: 42 });

    expect(r).toEqual({ sent: true, skipped: false, reason: null, messageId: 'msg-1' });
    expect(sendTrainingWelcome).toHaveBeenCalledTimes(1);
    expect(sendTrainingWelcome.mock.calls[0][0]).toMatchObject({
      to: 'dana@example.com',
      fullName: 'Dana Reyes',
    });
  });

  it('mints the token on the enrollment it was GIVEN, and links it from the portal URL', async () => {
    const { enrollment, update } = enrollmentFake();
    await sendPortalWelcome({ enrollment });

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof written.portal_token).toBe('string');
    expect((written.portal_token as string).length).toBeGreaterThan(10);
    expect(written.portal_token_expires_at).toBeInstanceOf(Date);

    // The emailed link must carry the SAME token that was just persisted,
    // otherwise the mail is a login that cannot log anyone in.
    const link = (sendTrainingWelcome.mock.calls[0][0] as { portalLink: string }).portalLink;
    expect(link).toBe(
      `https://enterprise.colaberry.ai/portal/verify?token=${written.portal_token}`,
    );
  });

  it('records the outcome against the lead, so it is visible on the person', async () => {
    const { enrollment } = enrollmentFake();
    await sendPortalWelcome({ enrollment, leadId: 42 });

    expect(logCommunication).toHaveBeenCalledTimes(1);
    expect(logCommunication.mock.calls[0][0]).toMatchObject({
      lead_id: 42,
      status: 'sent',
      to_address: 'dana@example.com',
      provider_message_id: 'msg-1',
      metadata: { event: 'portal_welcome', enrollment_id: 'enr-1' },
    });
  });

  it('passes the recovery copy through when given', async () => {
    const { enrollment } = enrollmentFake();
    await sendPortalWelcome({
      enrollment,
      subjectOverride: 'Your Colaberry sign-in link',
      intro: 'You created an account on 21 October and we never sent your link.',
    });

    expect(sendTrainingWelcome.mock.calls[0][0]).toMatchObject({
      subjectOverride: 'Your Colaberry sign-in link',
      intro: 'You created an account on 21 October and we never sent your link.',
    });
  });
});

describe('sendPortalWelcome - idempotency, which the recovery run depends on', () => {
  it('refuses when this address already has a sent welcome', async () => {
    findAll.mockResolvedValue([{ id: 7, metadata: { event: 'portal_welcome' } }]);
    const { enrollment, update } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment });

    expect(r).toEqual({
      sent: false, skipped: true, reason: 'already_welcomed', messageId: null,
    });
    expect(sendTrainingWelcome).not.toHaveBeenCalled();
    // No token churn either: a skipped welcome must not invalidate a link the
    // person may already be holding from the earlier send.
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses across the OTHER door too, so the two cannot double-send', async () => {
    findAll.mockResolvedValue([{ id: 8, metadata: { event: 'open_house_welcome' } }]);
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment });

    expect(r.skipped).toBe(true);
    expect(sendTrainingWelcome).not.toHaveBeenCalled();
  });

  it('spans both event names, as a set rather than by luck of ordering', () => {
    expect([...WELCOME_EVENTS].sort()).toEqual(['open_house_welcome', 'portal_welcome']);
  });

  it('is NOT fooled by an unrelated email to the same address', async () => {
    // A password reset or a campaign send is not a welcome. Treating any prior
    // mail as a welcome would strand exactly the people this fix exists for.
    findAll.mockResolvedValue([{ id: 9, metadata: { event: 'campaign_step' } }]);
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment });

    expect(r.sent).toBe(true);
    expect(sendTrainingWelcome).toHaveBeenCalledTimes(1);
  });

  it('is not fooled by a row with no metadata at all', async () => {
    findAll.mockResolvedValue([{ id: 10, metadata: null }, { id: 11 }]);
    const { enrollment } = enrollmentFake();

    expect((await sendPortalWelcome({ enrollment })).sent).toBe(true);
  });

  it('only counts SENT rows: the query itself is scoped to them', async () => {
    const { enrollment } = enrollmentFake();
    await sendPortalWelcome({ enrollment });

    expect(findAll.mock.calls[0][0]).toMatchObject({
      where: { to_address: 'dana@example.com', status: 'sent' },
    });
  });

  it('alreadyWelcomed is exported and answers the same question directly', async () => {
    findAll.mockResolvedValue([{ id: 12, metadata: { event: 'portal_welcome' } }]);
    expect(await alreadyWelcomed('dana@example.com')).toBe(true);

    findAll.mockResolvedValue([]);
    expect(await alreadyWelcomed('dana@example.com')).toBe(false);
  });
});

describe('sendPortalWelcome - the per-caller event name', () => {
  it('defaults to portal_welcome', async () => {
    const { enrollment } = enrollmentFake();
    await sendPortalWelcome({ enrollment });

    expect((logCommunication.mock.calls[0][0] as { metadata: { event: string } }).metadata.event)
      .toBe('portal_welcome');
  });

  it('writes the caller\'s event when given, so a migrating door keeps its history', async () => {
    const { enrollment } = enrollmentFake();
    await sendPortalWelcome({ enrollment, event: 'open_house_welcome' });

    expect((logCommunication.mock.calls[0][0] as { metadata: { event: string } }).metadata.event)
      .toBe('open_house_welcome');
  });

  it('STILL READS BOTH NAMES when deciding to send, whatever it writes', async () => {
    // The asymmetry that makes the guard work. If the read were scoped to the
    // caller's own event, two doors could each welcome the same person once -
    // which is precisely the defect the open-house door is being migrated to fix.
    findAll.mockResolvedValue([{ id: 20, metadata: { event: 'portal_welcome' } }]);
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment, event: 'open_house_welcome' });

    expect(r.skipped).toBe(true);
    expect(sendTrainingWelcome).not.toHaveBeenCalled();
  });

  it('and the converse: a prior open-house welcome blocks a portal send', async () => {
    findAll.mockResolvedValue([{ id: 21, metadata: { event: 'open_house_welcome' } }]);
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment, event: 'portal_welcome' });

    expect(r.skipped).toBe(true);
    expect(sendTrainingWelcome).not.toHaveBeenCalled();
  });
});

describe('sendPortalWelcome - failure paths', () => {
  it('FAILS CLOSED: an unevaluable guard refuses the send rather than risking a double', async () => {
    findAll.mockRejectedValue(new Error('db gone'));
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment });

    expect(r).toEqual({
      sent: false, skipped: true, reason: 'idempotency_check_failed', messageId: null,
    });
    expect(sendTrainingWelcome).not.toHaveBeenCalled();
  });

  it('logs a FAILED row when the transport reports not-sent', async () => {
    sendTrainingWelcome.mockResolvedValue({ sent: false });
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment });

    expect(r.sent).toBe(false);
    expect(r.skipped).toBe(false);
    expect(logCommunication.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      error_message: 'welcome email not sent (kill switch active or SMTP unconfigured)',
    });
  });

  it('never throws when the transport throws, and still records the failure', async () => {
    sendTrainingWelcome.mockRejectedValue(new Error('smtp exploded'));
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment });

    expect(r.sent).toBe(false);
    expect(r.reason).toBe('smtp exploded');
    expect(logCommunication.mock.calls[0][0]).toMatchObject({ status: 'failed' });
  });

  it('never throws when the LOG write throws: a signup must not fail over bookkeeping', async () => {
    logCommunication.mockRejectedValue(new Error('log gone'));
    const { enrollment } = enrollmentFake();

    const r = await sendPortalWelcome({ enrollment });

    // The mail did go out, and that is what the caller is told.
    expect(r.sent).toBe(true);
  });
});
