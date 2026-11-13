import { isNonRoutableAddress } from '../reservedDomains';

/**
 * The reserved-domain rule (MR4).
 *
 * This rule decides whether an agent is allowed to greet somebody, so both directions cost
 * something real and neither is the safe default:
 *
 *   a false POSITIVE silences a real prospect, which is the worse failure
 *   a false NEGATIVE lets an agent greet a fixture by name, which is what MR4 reported
 *
 * The cases below are the actual production values, not invented ones.
 */
describe('reserved namespaces are not routable', () => {
  it.each([
    // Measured in production: 118 enrollments on this domain.
    'e2e-points-1794490203287@colaberry-test.local',
    'c107-probe-1793879440303@colaberry-test.local',
    'ali+e2e-20260908c@colaberry-test.local',
    'someone@colaberry.test',                    // RFC 2606 .test
    'aisha.patel@northwind-demo.example',         // RFC 2606 .example
    'nobody@something.invalid',                   // RFC 2606 .invalid
    'printer@mydevice.local',                     // RFC 6762 .local
    'closecheck-1783337300@example.com',          // RFC 2606 second-level
    'a@example.net',
    'a@example.org',
  ])('%s is non-routable', (addr) => {
    expect(isNonRoutableAddress(addr)).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(isNonRoutableAddress('  E2E-Points@COLABERRY-TEST.LOCAL  ')).toBe(true);
  });
});

describe('real addresses stay routable', () => {
  it.each([
    'sam.rivera@gmail.com',
    'dana.whitfield@northwind.com',
    // The substring "test" is NOT the rule. 84 explorer enrollments contain it and most are
    // real people. These four would be silenced by a substring match.
    'testa.ngozi@gmail.com',
    'dana@testingtechnologies.com',
    'protester@outlook.com',
    'contest@gmail.com',
    // Reserved name as a LABEL rather than the TLD: still a real, routable domain.
    'a@example.com.co',
    'a@local.church',
    'a@test.io',
    'a@notexample.com',
  ])('%s is routable', (addr) => {
    expect(isNonRoutableAddress(addr)).toBe(false);
  });
});

describe('malformed input is not reported as non-routable', () => {
  /**
   * Returning true here would be the dangerous direction: a caller would read "we have no
   * address" as "this is a test account" and skip a real person without a trace.
   */
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['no at sign', 'notanemail.local'],
    ['nothing before the at', '@colaberry-test.local'],
    ['nothing after the at', 'someone@'],
    ['bare hostname with no dot', 'someone@localhost'],
    ['trailing dot', 'someone@colaberry-test.local.'],
    ['leading dot', 'someone@.local'],
  ])('%s is false', (_label, addr) => {
    expect(isNonRoutableAddress(addr as string | null | undefined)).toBe(false);
  });

  it('takes the LAST at sign, so a reserved domain cannot be hidden before one', () => {
    // 'a@colaberry-test.local@gmail.com' really delivers to gmail.com.
    expect(isNonRoutableAddress('a@colaberry-test.local@gmail.com')).toBe(false);
    // And the reverse: a real-looking name in front does not rescue a reserved domain.
    expect(isNonRoutableAddress('a@gmail.com@colaberry-test.local')).toBe(true);
  });
});
