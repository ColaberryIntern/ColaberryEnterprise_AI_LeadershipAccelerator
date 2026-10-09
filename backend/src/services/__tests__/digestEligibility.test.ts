import { isDigestEligible } from '../communityDigestService';

/**
 * A pause the platform recorded must reach the thing the member actually sees.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 *
 * `runDailyDigest` selected its recipients with NO filter — every community
 * member with an enrollment — and did not even load `status` or
 * `notifications_paused_at` onto the row, so neither could have been consulted
 * even by accident. On 2026-10-01 it mailed 315 people, of whom 29 should not
 * have been in the batch:
 *
 *   26  WITHDRAWN — they had left, and were still getting a daily email
 *    1  suspended at her own request
 *    2  active, but with notifications explicitly paused
 *
 * The member who reported it had asked for everything to be paused on
 * 2026-09-28. `notifications_paused_at` was set that day and honoured by the
 * session reminders, the missed-session mail and the renewal reminders — and
 * ignored here, so the digest kept arriving every morning for three days. She
 * wrote in a second time to ask again.
 *
 * That is the lesson these tests hold in place: a pause honoured by some
 * senders and ignored by others is not a pause. The member cannot see which
 * senders were told, so every arriving email reads as the request being
 * ignored.
 */
describe('isDigestEligible', () => {
  const active = { status: 'active', notifications_paused_at: null };

  it('mails an active member who has not paused anything', () => {
    expect(isDigestEligible(active)).toBe(true);
  });

  it('does not mail someone who asked for notifications to stop', () => {
    // The reported case: active enrollment, explicit pause, mailed anyway.
    expect(isDigestEligible({
      status: 'active',
      notifications_paused_at: new Date('2026-09-28T15:04:33Z'),
    })).toBe(false);
  });

  it('accepts the pause as the DATE STRING the database hands back', () => {
    // `notifications_paused_at` arrives as a string on a raw query. A truthy
    // check must treat it as paused rather than fall through to eligible.
    expect(isDigestEligible({
      status: 'active',
      notifications_paused_at: '2026-09-28 15:04:33.851462+00',
    })).toBe(false);
  });

  it('does not mail people who have left', () => {
    // 26 of the 29 wrongly mailed on 2026-10-01 were in this state.
    expect(isDigestEligible({ ...active, status: 'withdrawn' })).toBe(false);
  });

  it('does not mail a suspended member', () => {
    expect(isDigestEligible({ ...active, status: 'suspended' })).toBe(false);
  });

  it('does not mail a completed enrollment', () => {
    // Graduating is not consent to keep receiving a daily community email.
    expect(isDigestEligible({ ...active, status: 'completed' })).toBe(false);
  });

  it('refuses any status it does not recognise, rather than defaulting to send', () => {
    // A new enum value must fail CLOSED. Defaulting an unknown state to
    // "mail them" is how this class of bug reappears after the next migration.
    expect(isDigestEligible({ ...active, status: 'paused_for_billing' })).toBe(false);
    expect(isDigestEligible({ ...active, status: '' })).toBe(false);
    expect(isDigestEligible({ ...active, status: null })).toBe(false);
  });

  it('does not mail a member with no enrollment at all', () => {
    expect(isDigestEligible(null)).toBe(false);
    expect(isDigestEligible(undefined)).toBe(false);
  });
});
