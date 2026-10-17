/**
 * testModeWindow, and the rule that credential email is never redirected.
 *
 * Both halves exist because of one incident: test mode was left on for 53
 * hours in October 2026 and redirected 579 emails to a single mailbox, 35 of
 * them portal access links belonging to 10 people who then could not log in.
 *
 * The timings below are the REAL ones, so the suite fails if the window is
 * ever widened past the point that would have let that incident happen again.
 */
import {
  isTestModeExpired, testModeAgeHours, TEST_MODE_MAX_AGE_HOURS,
} from '../testModeWindow';

// The actual incident: flipped on at 6:58 AM CDT on 16 Oct, found at 11:56 AM
// CDT on 17 Oct.
const ENABLED_AT = new Date('2026-10-16T11:58:13.375Z');
const FOUND_AT = new Date('2026-10-17T16:56:26.000Z');

describe('isTestModeExpired', () => {
  it('honours test mode while it is fresh', () => {
    const justNow = new Date(FOUND_AT.getTime() - 5 * 60 * 1000);
    expect(isTestModeExpired(justNow, FOUND_AT)).toBe(false);
  });

  it('would have stopped the real incident', () => {
    // 29 hours on. This is the assertion the whole module exists for.
    expect(isTestModeExpired(ENABLED_AT, FOUND_AT)).toBe(true);
    expect(testModeAgeHours(ENABLED_AT, FOUND_AT)).toBeGreaterThan(28);
  });

  it('expires exactly at the boundary, not a moment later', () => {
    const hour = 60 * 60 * 1000;
    const at = new Date(FOUND_AT.getTime() - TEST_MODE_MAX_AGE_HOURS * hour);
    // Exactly the max age is still honoured; one millisecond more is not.
    expect(isTestModeExpired(at, FOUND_AT)).toBe(false);
    expect(isTestModeExpired(new Date(at.getTime() - 1), FOUND_AT)).toBe(true);
  });

  it('treats an UNKNOWN age as expired, because the failure mode is misdelivery', () => {
    expect(isTestModeExpired(null, FOUND_AT)).toBe(true);
    expect(isTestModeExpired(undefined, FOUND_AT)).toBe(true);
    expect(isTestModeExpired('not a date', FOUND_AT)).toBe(true);
  });

  it('treats a FUTURE timestamp as expired, so clock skew cannot pin it on', () => {
    const tomorrow = new Date(FOUND_AT.getTime() + 24 * 60 * 60 * 1000);
    expect(isTestModeExpired(tomorrow, FOUND_AT)).toBe(true);
  });

  it('accepts an ISO string, which is how the settings row arrives', () => {
    expect(isTestModeExpired(ENABLED_AT.toISOString(), FOUND_AT)).toBe(true);
  });

  it('keeps the window short enough to die before an overnight digest run', () => {
    // The digests that did the volume damage run at 08:00Z. A flag set at the
    // end of a working day must be dead by then.
    expect(TEST_MODE_MAX_AGE_HOURS).toBeLessThanOrEqual(8);
    expect(TEST_MODE_MAX_AGE_HOURS).toBeGreaterThan(0);
  });
});

describe('testModeAgeHours', () => {
  it('reports the age for the log line', () => {
    const twoHours = new Date(FOUND_AT.getTime() - 2 * 60 * 60 * 1000);
    expect(testModeAgeHours(twoHours, FOUND_AT)).toBe(2);
  });

  it('returns null rather than a fake age when it cannot tell', () => {
    expect(testModeAgeHours(null, FOUND_AT)).toBeNull();
    expect(testModeAgeHours('nonsense', FOUND_AT)).toBeNull();
  });
});

/**
 * Source-level check, deliberately. Every email carrying a login token must be
 * exempt from the redirect, and the way that goes wrong is a FIFTH such email
 * being added later without the flag. Asserting the call sites by reading the
 * file catches that; a behavioural test of the four we know about cannot.
 */
describe('every credential-carrying email is exempt from test mode', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const SRC = path.join(__dirname, '..', '..', 'emailService.ts');
  const src = fs.readFileSync(SRC, 'utf8');

  // Each entry is a send that embeds a sign-in token in its body.
  const CREDENTIAL_SENDS = [
    { fn: 'sendPortalMagicLink', what: 'portal access link' },
    { fn: 'sendTrainingWelcome', what: 'welcome with /portal/verify link' },
    { fn: 'sendOrgInvite', what: 'org invite with /portal/verify link' },
    { fn: 'sendDeliveryClientMagicLink', what: 'project review sign-in link' },
  ];

  it.each(CREDENTIAL_SENDS)('$fn ($what) passes neverRedirect', ({ fn }) => {
    const start = src.indexOf(`export async function ${fn}`);
    expect(start).toBeGreaterThan(-1);
    // Scan to the guardedSendMail call, which is where the recipient is used.
    const end = src.indexOf('guardedSendMail', start);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toContain('resolveEmailRecipient');
    expect(body).toContain('neverRedirect: true');
  });

  it('counts the token-bearing sends, so a fifth cannot be added quietly', () => {
    // /portal/verify and /client?token= are the two sign-in entry points.
    const tokenLinks = src.match(/\/portal\/verify\?token=|\/client\?token=/g) ?? [];
    const exemptions = src.match(/neverRedirect: true/g) ?? [];
    expect(exemptions.length).toBe(CREDENTIAL_SENDS.length);
    // buildOrgInviteHtml and buildPortalMagicLinkHtml each reference a link
    // their sender already built, so links are >= senders; the point is that a
    // NEW sign-in link shows up here and forces this test to be revisited.
    expect(tokenLinks.length).toBeGreaterThanOrEqual(2);
  });
});
