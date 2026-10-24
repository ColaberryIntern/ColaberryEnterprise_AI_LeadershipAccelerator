import { isSyntheticContactEmail } from '../syntheticContacts';

/**
 * Two harms, pointing opposite ways, and this sits between them.
 *
 * Miss a fixture and it becomes a contact in a customer-facing CRM that somebody may try to
 * call. That already happened: on 2026-10-23 the backfill put
 * `e2e-points-1792589402578@colaberry-test.local` into the live School of Data and AI account,
 * and it had to be deleted by hand.
 *
 * Match a real person and they are silently withheld from the CRM for ever, which is the same
 * class of harm as the bug this fixes. So the real-people cases below matter at least as much as
 * the fixture ones.
 */

describe('the fixtures the e2e suite actually creates', () => {
  it.each([
    'e2e-points-1792589402578@colaberry-test.local',
    'e2e-points-1792675802480@colaberry-test.local',
    'e2e-points-1792762203010@colaberry-test.local',
  ])('%s is a fixture', (email) => {
    expect(isSyntheticContactEmail(email)).toBe(true);
  });

  it('matches the test domain whatever the local part is', () => {
    expect(isSyntheticContactEmail('anybody@colaberry-test.local')).toBe(true);
  });

  it('matches the e2e prefix on a real-looking domain', () => {
    // A fixture that forgets the test domain is still a fixture.
    expect(isSyntheticContactEmail('e2e-checkout@gmail.com')).toBe(true);
  });

  it('is case-insensitive and tolerates whitespace', () => {
    expect(isSyntheticContactEmail('  E2E-Points-1@Colaberry-Test.Local  ')).toBe(true);
  });
});

describe('real people are never withheld', () => {
  it.each([
    'tlclark926@gmail.com',
    'brandyourempire@gmail.com',
    'info@mindful1ws.com',
    'admanwiz@yahoo.com',
  ])('%s is a person', (email) => {
    // Four addresses from the real ad cohort. If any of these matched, somebody who signed up
    // would never reach the CRM and nothing would say so.
    expect(isSyntheticContactEmail(email)).toBe(false);
  });

  it('does not match an address merely containing "test"', () => {
    // Real people have these. Matching on the word "test" is the obvious implementation and it
    // would quietly drop them.
    expect(isSyntheticContactEmail('testaccount@gmail.com')).toBe(false);
    expect(isSyntheticContactEmail('protester@example.org')).toBe(false);
    expect(isSyntheticContactEmail('contest@winner.com')).toBe(false);
  });

  it('does not match a domain that merely resembles the fixture domain', () => {
    expect(isSyntheticContactEmail('someone@colaberry-test.com')).toBe(false);
    expect(isSyntheticContactEmail('someone@colaberry.com')).toBe(false);
  });

  it('does not match an address that merely starts with the letter e', () => {
    expect(isSyntheticContactEmail('e2@gmail.com')).toBe(false);
    expect(isSyntheticContactEmail('emma@gmail.com')).toBe(false);
  });
});

describe('nothing to judge', () => {
  it('treats missing or empty input as not synthetic', () => {
    // A lead with no email cannot be synced anyway; saying "synthetic" here would put a
    // misleading reason in the activity log.
    for (const value of [null, undefined, '', '   ']) {
      expect(isSyntheticContactEmail(value as string)).toBe(false);
    }
  });
});
