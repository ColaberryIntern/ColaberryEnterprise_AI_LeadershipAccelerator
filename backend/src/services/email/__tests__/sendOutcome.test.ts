/**
 * TELLING A DELIVERY FROM A 250-THEN-DROPPED SEND.
 *
 * 2026-11-11. Sohail filed three bug reports from the Marketing composer, one per step of
 * the wizard. All three returned 201, all three logged `outcome: "success"`, and not one
 * was delivered or even appeared in Mandrill's message log.
 *
 * The route had passed no `from`, so nodemailer handed the relay an empty envelope
 * sender. Mandrill answered `250 2.0.0 Ok: queued as ...` - which is why the send looked
 * perfect - and then discarded a message it could not attribute to a sending domain. The
 * route reported success because it never read the result it was handed.
 *
 * The two fixtures below are the VERBATIM responses from production, captured by sending
 * the same email twice through the real transport, once without `from` and once with it.
 * Only the second appeared in Mandrill's log. They are kept verbatim rather than
 * simplified, because the whole difficulty of this bug is how alike they look.
 *
 * No mocks and no imports beyond the function itself: it is pure, which is exactly why it
 * was moved out of emailService.
 */
import { readSendOutcome } from '../sendOutcome';

/** Dropped. No `from` was passed. Never reached Mandrill's message log. */
const PRODUCTION_DROPPED = {
  response: '250 2.0.0 Ok: queued as C066C1005088',
  messageId: '<318e94ff-ceac-9047-4a31-909b5b4cabea@localhost>',
  accepted: ['ali@colaberry.com'],
  rejected: [],
  envelope: { from: '', to: ['ali@colaberry.com'] },
};

/** Delivered. Identical call with `from` set. Appeared in the log as `state: sent`. */
const PRODUCTION_DELIVERED = {
  response: '250 2.0.0 Ok: queued as 53ED6100508D',
  messageId: '<41a1dd01-d6a2-859d-f286-10aa1fd5cdf3@colaberry.com>',
  accepted: ['ali@colaberry.com'],
  rejected: [],
  envelope: { from: 'info@colaberry.com', to: ['ali@colaberry.com'] },
};

describe('readSendOutcome', () => {
  it('THE REGRESSION: the dropped report reads as NOT delivered', () => {
    expect(readSendOutcome(PRODUCTION_DROPPED as never)).toEqual({
      delivered: false,
      reason: 'no_envelope_sender',
    });
  });

  it('CONTROL: the delivered probe reads as delivered', () => {
    // Without this, the case above would also pass if the function returned
    // "not delivered" for everything, which would break every send in the repo.
    expect(readSendOutcome(PRODUCTION_DELIVERED as never)).toEqual({ delivered: true });
  });

  it('shows why a check on `accepted` alone could not have worked', () => {
    // Both production shapes report a recipient accepted and a 250 response. Anything
    // built on `accepted.length` marks the dropped one a success - which is what shipped
    // and what lost the three reports.
    expect(PRODUCTION_DROPPED.accepted.length).toBe(PRODUCTION_DELIVERED.accepted.length);
    expect(PRODUCTION_DROPPED.response.startsWith('250')).toBe(true);
    expect(PRODUCTION_DELIVERED.response.startsWith('250')).toBe(true);

    // And the function separates them anyway.
    expect(readSendOutcome(PRODUCTION_DROPPED as never).delivered).toBe(false);
    expect(readSendOutcome(PRODUCTION_DELIVERED as never).delivered).toBe(true);
  });

  it('reads the kill-switch stub as blocked, not as delivered', () => {
    expect(
      readSendOutcome({ response: 'blocked_by_kill_switch', accepted: [], rejected: ['a@b.com'] } as never),
    ).toEqual({ delivered: false, reason: 'blocked' });
  });

  it('reads the dev-guard stub as blocked', () => {
    expect(
      readSendOutcome({ response: 'blocked_by_dev_email_guard', accepted: [], rejected: ['a@b.com'] } as never),
    ).toEqual({ delivered: false, reason: 'blocked' });
  });

  it('reads nothing-accepted as undelivered', () => {
    expect(
      readSendOutcome({ response: '250 ok', accepted: [], envelope: { from: 'i@c.com' } } as never),
    ).toEqual({ delivered: false, reason: 'nothing_accepted' });
  });

  it.each([
    ['undefined', undefined],
    ['an empty object', {}],
    ['a null envelope', { accepted: ['a@b.com'], envelope: null }],
    ['a missing envelope', { accepted: ['a@b.com'] }],
    ['a whitespace-only sender', { accepted: ['a@b.com'], envelope: { from: '   ' } }],
    ['a null sender', { accepted: ['a@b.com'], envelope: { from: null } }],
    ['a non-array accepted', { accepted: 'a@b.com', envelope: { from: 'i@c.com' } }],
  ])('reads %s as undelivered rather than throwing', (_label, info) => {
    // A transport that resolves with something unexpected must read as "not delivered"
    // rather than crashing the request that was trying to report a problem.
    expect(() => readSendOutcome(info as never)).not.toThrow();
    expect(readSendOutcome(info as never).delivered).toBe(false);
  });

  it('does not throw on a sender that is not a string at all', () => {
    // Deliberately NOT asserted undelivered: the transport did report a sender, and
    // inventing a verdict for a shape nodemailer never produces would be guessing.
    // What matters is that the bug report's request does not crash.
    expect(() => readSendOutcome({ accepted: ['a@b.com'], envelope: { from: 42 } } as never)).not.toThrow();
  });
});
