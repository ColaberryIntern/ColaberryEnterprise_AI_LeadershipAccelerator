/**
 * dmNotificationService - the four test types CLAUDE.md requires per feature: happy path, failure
 * path, boundaries, and idempotency.
 *
 * WHAT IDEMPOTENCY MEANS AT THIS LEVEL, AND WHAT IT DOES NOT
 *
 * The actual duplicate suppression is a unique index in `email_send_ledger`, and it is already
 * covered against a real Postgres by `email/__tests__/idempotentSend.pg.test.ts`. Re-asserting it
 * here with `sendOnce` mocked would prove nothing about the database.
 *
 * What this suite owns is the half the ledger cannot check for itself: **the identity this service
 * hands it.** The ledger suppresses on `(lower(recipient), subject, business_event_id)`, so if the
 * subject drifted per message, or the event id were per message rather than per window, the index
 * would be asked a different question every time and would correctly suppress nothing. So the
 * tests below pin that the event id is STABLE inside a window and DIFFERENT across windows, and
 * that the subject does not vary with message content. That is the contract that makes the index
 * work.
 *
 * Mocking follows this repo's convention - per-module, in the test file, because there is no
 * global jest setup and no transport-level stub (see communityDigestService.test.ts:15 and
 * replyNotificationService.test.ts:26).
 */

const mockEnrollmentFindByPk = jest.fn();
const mockMessageFindByPk = jest.fn();
const mockGuardedSendMail = jest.fn();
const mockSendOnce = jest.fn();
const mockMintPortalLinkToken = jest.fn();

jest.mock('../../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockEnrollmentFindByPk(...a) },
}));
jest.mock('../../../models/RoomMessage', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockMessageFindByPk(...a) },
}));
jest.mock('../../emailService', () => ({
  guardedSendMail: (...a: unknown[]) => mockGuardedSendMail(...a),
  resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }),
  htmlToPlainText: (html: string) => html.replace(/<[^>]+>/g, ' '),
}));
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: (...a: unknown[]) => mockSendOnce(...a),
}));
// NAMED export, matching the real module. The first version of this mock invented a `default`
// export, which made the suite pass green while `tsc` failed with TS2613 - a mock that disagrees
// with the module it stands in for can only ever hide the bug it is covering up.
jest.mock('../../../config/env', () => ({
  env: { trainingWelcomeFromEmail: 'noreply@colaberry.com' },
}));
// The one-click sign-in token the email now carries. Mocked so this suite stays a
// pure unit test of the notifier — the real mint opens a database connection, and
// the token's own behaviour is covered in portalLinkTokenService.test.ts.
jest.mock('../../portalLinkTokenService', () => ({
  mintPortalLinkToken: (...a: unknown[]) => mockMintPortalLinkToken(...a),
  PURPOSE_DM_NOTIFICATION: 'dm_notification',
}));

import {
  notifyDmByEmail,
  wantsDmEmail,
  dmWindowBucket,
  dmBusinessEventId,
  dmNotificationSubject,
  buildDmNotificationHtml,
  buildDmCtaUrl,
  dmThreadPath,
  DM_NOTIFY_WINDOW_MINUTES,
} from '../dmNotificationService';

const ROOM = 'room-abc';
const RECIPIENT = 'enr-recipient';
const MESSAGE = 'msg-1';

/** An active, opted-in recipient. */
const activeRecipient = (over: Record<string, unknown> = {}) => ({
  id: RECIPIENT,
  email: 'Kes@Colaberry.com',
  full_name: 'Kesetebirhan Delele',
  status: 'active',
  notifications_paused_at: null,
  intake_data_json: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEnrollmentFindByPk.mockResolvedValue(activeRecipient());
  mockMessageFindByPk.mockResolvedValue({ id: MESSAGE, sender_name: 'Quincy Ninying' });
  // Default: the claim is granted and the provider send runs.
  mockSendOnce.mockImplementation(async (_id: unknown, send: () => Promise<unknown>) => {
    await send();
    return { outcome: 'sent', ledgerId: 'led-1', idempotencyKey: 'key-1', messageId: 'm-1' };
  });
  mockGuardedSendMail.mockResolvedValue({ messageId: 'smtp-1' });
  // Default: the one-click token mints. The null case is exercised explicitly below.
  mockMintPortalLinkToken.mockResolvedValue('tok-abc123');
});

// ───────────────────────────────────────────────────────────── pure helpers
describe('the identity handed to the ledger', () => {
  it('keeps the same event id for two messages inside one window', () => {
    const a = new Date('2026-11-03T10:00:00Z');
    const b = new Date('2026-11-03T10:29:59Z');
    expect(dmBusinessEventId(ROOM, RECIPIENT, a)).toBe(dmBusinessEventId(ROOM, RECIPIENT, b));
  });

  it('changes the event id once the window rolls over', () => {
    const a = new Date('2026-11-03T10:00:00Z');
    const later = new Date(a.getTime() + DM_NOTIFY_WINDOW_MINUTES * 60000);
    expect(dmBusinessEventId(ROOM, RECIPIENT, a)).not.toBe(dmBusinessEventId(ROOM, RECIPIENT, later));
  });

  it('separates two recipients and two rooms, so one thread cannot mute another', () => {
    const at = new Date('2026-11-03T10:00:00Z');
    expect(dmBusinessEventId(ROOM, 'enr-a', at)).not.toBe(dmBusinessEventId(ROOM, 'enr-b', at));
    expect(dmBusinessEventId('room-1', RECIPIENT, at)).not.toBe(dmBusinessEventId('room-2', RECIPIENT, at));
  });

  it('buckets monotonically, so a later message is never in an earlier window', () => {
    const a = dmWindowBucket(new Date('2026-11-03T10:00:00Z'));
    const b = dmWindowBucket(new Date('2026-11-03T12:00:00Z'));
    expect(b).toBeGreaterThan(a);
  });

  it('builds a subject that does not vary with the message, only the sender', () => {
    expect(dmNotificationSubject('Quincy Ninying')).toBe('Quincy Ninying sent you a message');
    // A drifting subject would mint a new idempotency key per message and defeat the window.
    expect(dmNotificationSubject('Quincy Ninying')).toBe(dmNotificationSubject('Quincy Ninying'));
  });

  it('falls back to a stable subject when the sender has no name', () => {
    expect(dmNotificationSubject('')).toBe('Someone sent you a message');
    expect(dmNotificationSubject('   ')).toBe('Someone sent you a message');
  });
});

describe('opt-out resolution', () => {
  it('treats undefined as opted in, so no backfill is needed', () => {
    expect(wantsDmEmail(null)).toBe(true);
    expect(wantsDmEmail(undefined)).toBe(true);
    expect(wantsDmEmail({})).toBe(true);
  });

  it('honours an explicit false and nothing else', () => {
    expect(wantsDmEmail({ dm_notifications: false })).toBe(false);
    expect(wantsDmEmail({ dm_notifications: true })).toBe(true);
    // A truthy-but-not-true value must not read as opted out.
    expect(wantsDmEmail({ dm_notifications: 'yes' })).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────── happy path
describe('happy path', () => {
  it('sends exactly one email for a new message', async () => {
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: true, reason: 'sent', idempotencyKey: 'key-1' });
    expect(mockSendOnce).toHaveBeenCalledTimes(1);
    expect(mockGuardedSendMail).toHaveBeenCalledTimes(1);
  });

  it('claims the send against the recipient, subject and windowed event id', async () => {
    const at = new Date('2026-11-03T10:05:00Z');
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE, at });
    expect(mockSendOnce).toHaveBeenCalledWith(
      {
        recipient: 'Kes@Colaberry.com',
        subject: 'Quincy Ninying sent you a message',
        businessEventId: dmBusinessEventId(ROOM, RECIPIENT, at),
      },
      expect.any(Function),
    );
  });

  it('CARRIES NO MESSAGE CONTENT - a DM is private and email is not', async () => {
    mockMessageFindByPk.mockResolvedValue({
      id: MESSAGE,
      sender_name: 'Quincy Ninying',
      content: 'SENSITIVE-BODY-SENTINEL salary discussion',
    });
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    const sent = mockGuardedSendMail.mock.calls[0][0];
    expect(sent.html).not.toContain('SENSITIVE-BODY-SENTINEL');
    expect(sent.text).not.toContain('SENSITIVE-BODY-SENTINEL');
    expect(sent.subject).not.toContain('SENSITIVE-BODY-SENTINEL');
  });

  it('escapes the sender name rather than injecting it into the markup', () => {
    const html = buildDmNotificationHtml({
      recipientName: 'Kes',
      senderName: '<img src=x onerror=alert(1)>',
      ctaUrl: 'https://enterprise.colaberry.ai/portal/messages/room-abc',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

// ──────────────────────────────────────────────── the "Read and reply" button
//
// Ali, 2026-11-03: "when receiving a message is clicked, it makes you put your
// email in so you have to then check another email which makes no sense at all."
// The button used to be a bare /portal/community, a page that carries no messages
// at all, and sign-in is magic-link only, so a signed-out reader was sent to fetch
// a second email to read the first one.
describe('the Read and reply link', () => {
  it('points at the conversation, as a PATH — safeNextPath rejects a query string', () => {
    // A `?dm=` destination would be silently dropped on the way through the verify
    // page and the reader would land on Today wondering where the message went.
    expect(dmThreadPath(ROOM)).toBe(`/portal/messages/${ROOM}`);
    expect(dmThreadPath(ROOM)).not.toContain('?');
  });

  it('signs the reader in and then forwards to the thread', () => {
    const url = buildDmCtaUrl(ROOM, 'tok-abc123');

    expect(url).toContain('/portal/verify?token=tok-abc123');
    expect(url).toContain(`next=${encodeURIComponent(`/portal/messages/${ROOM}`)}`);
  });

  it('falls back to the plain thread path when no token could be minted', () => {
    // Still correct, just not one click: the portal carries this destination
    // through sign-in, so the reader lands on the message afterwards.
    expect(buildDmCtaUrl(ROOM, null)).toBe(`https://enterprise.colaberry.ai/portal/messages/${ROOM}`);
  });

  it('percent-encodes the token, so a token containing a URL character cannot break the link', () => {
    expect(buildDmCtaUrl(ROOM, 'a+b/c=d&e')).toContain(`token=${encodeURIComponent('a+b/c=d&e')}`);
  });

  it('the sent email carries the one-click link, and never the old community URL', async () => {
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });

    const sent = mockGuardedSendMail.mock.calls[0][0];
    expect(sent.html).toContain('/portal/verify?token=tok-abc123');
    expect(sent.html).not.toContain('/portal/community');
  });

  it('mints the token for the RECIPIENT, scoped to this thread', async () => {
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });

    expect(mockMintPortalLinkToken).toHaveBeenCalledWith({
      enrollmentId: RECIPIENT,
      purpose: 'dm_notification',
      nextPath: `/portal/messages/${ROOM}`,
    });
  });

  it('mints NOTHING for someone who opted out — no live sign-in is left behind', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(
      activeRecipient({ intake_data_json: { preferences: { dm_notifications: false } } }),
    );

    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });

    expect(r.reason).toBe('opted_out');
    expect(mockMintPortalLinkToken).not.toHaveBeenCalled();
  });

  it('a failed mint still sends the email — the mail matters more than the convenience', async () => {
    mockMintPortalLinkToken.mockResolvedValue(null);

    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });

    expect(r.sent).toBe(true);
    const sent = mockGuardedSendMail.mock.calls[0][0];
    expect(sent.html).toContain(`/portal/messages/${ROOM}`);
    expect(sent.html).not.toContain('/portal/verify');
  });

  it('warns the reader that the button is a sign-in, since it now is one', async () => {
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });

    const sent = mockGuardedSendMail.mock.calls[0][0];
    expect(sent.html).toMatch(/signs you in/i);
    expect(sent.html).toMatch(/do not forward/i);
  });
});

// ───────────────────────────────────────────────────────────── idempotency
describe('idempotency', () => {
  it('reports suppressed_window when the ledger refuses the claim', async () => {
    mockSendOnce.mockResolvedValue({ outcome: 'skipped', reason: 'already_sent', idempotencyKey: 'key-1' });
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: false, reason: 'suppressed_window', idempotencyKey: 'key-1' });
    // The provider must NOT be called when the claim is refused.
    expect(mockGuardedSendMail).not.toHaveBeenCalled();
  });

  it('asks the ledger the SAME question for a second message in the same window', async () => {
    const first = new Date('2026-11-03T10:01:00Z');
    const second = new Date('2026-11-03T10:28:00Z');
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE, at: first });
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: 'msg-2', at: second });

    // Byte-identical identity on both calls is the whole mechanism: the unique index can only
    // suppress the second send if it is asked the same question. Two different message ids must
    // NOT produce two different identities.
    expect(mockSendOnce.mock.calls).toHaveLength(2);
    expect(mockSendOnce.mock.calls[1][0]).toEqual(mockSendOnce.mock.calls[0][0]);
  });

  it('asks a DIFFERENT question once the window has rolled, so the next half hour can notify', async () => {
    const first = new Date('2026-11-03T10:01:00Z');
    const nextWindow = new Date(first.getTime() + DM_NOTIFY_WINDOW_MINUTES * 60000);
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE, at: first });
    await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: 'msg-2', at: nextWindow });
    expect(mockSendOnce.mock.calls[1][0].businessEventId)
      .not.toBe(mockSendOnce.mock.calls[0][0].businessEventId);
  });
});

// ───────────────────────────────────────────────────────────── failure path
describe('failure path', () => {
  it('reports send_failed when the provider is blocked, and does not claim delivery', async () => {
    mockGuardedSendMail.mockResolvedValue({});  // kill switch / dev guard: no messageId
    mockSendOnce.mockImplementation(async (_id: unknown, send: () => Promise<{ ok: boolean }>) => {
      const res = await send();
      return res.ok
        ? { outcome: 'sent', ledgerId: 'l', idempotencyKey: 'k', messageId: 'm' }
        : { outcome: 'failed', ledgerId: 'l', idempotencyKey: 'k', errorClass: 'SendBlocked', error: 'blocked' };
    });
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe('send_failed');
  });

  it('never throws when the database lookup fails', async () => {
    mockEnrollmentFindByPk.mockRejectedValue(new Error('connection lost'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: false, reason: 'error' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never throws when the mailer itself throws', async () => {
    mockSendOnce.mockRejectedValue(new Error('smtp exploded'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe('error');
    warn.mockRestore();
  });

  it('still sends when the message row cannot be read, using a neutral sender name', async () => {
    mockMessageFindByPk.mockResolvedValue(null);
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r.sent).toBe(true);
    expect(mockSendOnce.mock.calls[0][0].subject).toBe('Someone sent you a message');
  });
});

// ───────────────────────────────────────────────────────────── boundaries
describe('boundaries - every reason it declines', () => {
  it('declines with no_recipient when the enrollment is missing', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: false, reason: 'no_recipient' });
    expect(mockSendOnce).not.toHaveBeenCalled();
  });

  it('declines with no_email when the enrollment has no address', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(activeRecipient({ email: null }));
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: false, reason: 'no_email' });
  });

  it('declines when notifications are paused, because a pause must mean every sender', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(
      activeRecipient({ notifications_paused_at: new Date('2026-10-01T00:00:00Z') }),
    );
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: false, reason: 'paused' });
    expect(mockSendOnce).not.toHaveBeenCalled();
  });

  it('declines for a non-active enrollment', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(activeRecipient({ status: 'withdrawn' }));
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: false, reason: 'inactive' });
  });

  it('declines when the recipient opted out in preferences', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(
      activeRecipient({ intake_data_json: { preferences: { dm_notifications: false } } }),
    );
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r).toEqual({ sent: false, reason: 'opted_out' });
    expect(mockSendOnce).not.toHaveBeenCalled();
  });

  it('is unaffected by unrelated preference keys', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(
      activeRecipient({ intake_data_json: { preferences: { reply_notifications: false } } }),
    );
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r.sent).toBe(true);
  });

  it('tolerates a malformed intake blob rather than refusing to notify', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(activeRecipient({ intake_data_json: 'not-an-object' }));
    const r = await notifyDmByEmail({ roomId: ROOM, recipientEnrollmentId: RECIPIENT, messageId: MESSAGE });
    expect(r.sent).toBe(true);
  });
});
