/**
 * Mock-free unit tests for the badge-link validator, matching the pattern in
 * claudeStudioValidation.test.ts: the rules are pure, so nothing is mocked.
 *
 * Happy path, failure path, boundaries, and the real mangled input observed in
 * this system's own stored mail.
 */
import { validateAcademyBadgeUrl, ACADEMY_BADGE_HOST, UNVERIFIED_LINK } from '../badgeLinkService';

/** Returns the thrown error, asserting it is a 400 the student can read. */
function thrown(fn: () => unknown): Error & { status?: number } {
  try {
    fn();
  } catch (e) {
    const err = e as Error & { status?: number };
    expect(err.status).toBe(400);
    expect(String(err.message).length).toBeGreaterThan(10);
    return err;
  }
  throw new Error('expected validateAcademyBadgeUrl to throw, but it returned');
}

const ID = 'aB3dEf9h-kLmNoP_qR2'; // 19 chars, inside the accepted charset

describe('validateAcademyBadgeUrl - happy path', () => {
  it('accepts a badge link and returns it unchanged', () => {
    const url = `https://${ACADEMY_BADGE_HOST}/badges/${ID}`;
    expect(validateAcademyBadgeUrl(url)).toBe(url);
  });

  it('trims surrounding whitespace from a pasted link', () => {
    const url = `https://${ACADEMY_BADGE_HOST}/badges/${ID}`;
    expect(validateAcademyBadgeUrl(`  ${url}\n`)).toBe(url);
  });

  it('drops a query string, so tracking parameters never reach storage', () => {
    const pasted = `https://${ACADEMY_BADGE_HOST}/badges/${ID}?utm_source=newsletter&utm_medium=email`;
    expect(validateAcademyBadgeUrl(pasted)).toBe(`https://${ACADEMY_BADGE_HOST}/badges/${ID}`);
  });

  it('drops a fragment', () => {
    const pasted = `https://${ACADEMY_BADGE_HOST}/badges/${ID}#share`;
    expect(validateAcademyBadgeUrl(pasted)).toBe(`https://${ACADEMY_BADGE_HOST}/badges/${ID}`);
  });

  it('accepts a host in mixed case, because browsers do', () => {
    const pasted = `https://Academy.Claude.COM/badges/${ID}`;
    expect(validateAcademyBadgeUrl(pasted)).toBe(`https://${ACADEMY_BADGE_HOST}/badges/${ID}`);
  });

  it('is idempotent: validating its own output returns the same thing', () => {
    const once = validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/${ID}?source=gmail`);
    expect(validateAcademyBadgeUrl(once)).toBe(once);
  });
});

describe('validateAcademyBadgeUrl - the host is an exact match, not a suffix', () => {
  // This is the SSRF guard. An exact host means loopback, private ranges and
  // cloud metadata are excluded by construction, so each of these must fail
  // even though no rule names them.
  it.each([
    ['http instead of https', `http://${ACADEMY_BADGE_HOST}/badges/${ID}`],
    ['a lookalike subdomain', `https://academy.claude.com.evil.test/badges/${ID}`],
    ['a lookalike prefix', `https://notacademy.claude.com/badges/${ID}`],
    ['a different Anthropic host', `https://claude.com/badges/${ID}`],
    ['loopback', `https://127.0.0.1/badges/${ID}`],
    ['localhost', `https://localhost/badges/${ID}`],
    ['cloud metadata', `https://169.254.169.254/badges/${ID}`],
    ['a private range', `https://10.0.0.5/badges/${ID}`],
    ['credentials in the URL', `https://user:pw@${ACADEMY_BADGE_HOST}/badges/${ID}`],
    ['a javascript scheme', `javascript:alert(1)`],
    ['a data scheme', `data:text/html,hello`],
    ['a file scheme', `file:///etc/passwd`],
  ])('rejects %s', (_label, input) => {
    thrown(() => validateAcademyBadgeUrl(input));
  });
});

describe('validateAcademyBadgeUrl - path must identify a badge', () => {
  it.each([
    ['the Academy home page', `https://${ACADEMY_BADGE_HOST}/`],
    ['a course page, not a badge', `https://${ACADEMY_BADGE_HOST}/courses/claude-code-101`],
    ['the badges index with no id', `https://${ACADEMY_BADGE_HOST}/badges`],
    ['a trailing slash and no id', `https://${ACADEMY_BADGE_HOST}/badges/`],
    ['something nested under the id', `https://${ACADEMY_BADGE_HOST}/badges/${ID}/print`],
  ])('rejects %s', (_label, input) => {
    thrown(() => validateAcademyBadgeUrl(input));
  });

  it('names Claude Academy when the host is wrong, so the student knows where to go', () => {
    const e = thrown(() => validateAcademyBadgeUrl(`https://example.test/badges/${ID}`));
    expect(e.message).toContain(ACADEMY_BADGE_HOST);
  });
});

describe('validateAcademyBadgeUrl - the mangled link people will actually paste', () => {
  // Observed in this system's own stored mail: the mail client rewrote the
  // link and the badge id was gone, leaving tracking parameters in its place.
  // A student copying from their email pastes exactly this.
  it.each([
    [`https://${ACADEMY_BADGE_HOST}/badges/&source=gmail&ust=17956986`],
    [`https://${ACADEMY_BADGE_HOST}/badges/&amp;source=gmail&amp;ust=1795`],
    [`https://${ACADEMY_BADGE_HOST}/badges/?source=gmail&ust=17956986`],
  ])('rejects the mail-rewritten link %#', (input) => {
    thrown(() => validateAcademyBadgeUrl(input));
  });

  it('tells the student to copy from the browser, not from their email', () => {
    const e = thrown(() =>
      validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/&source=gmail&ust=17956986`)
    );
    // The whole reason this case is separate: a generic "invalid link" would
    // send them back to the same email to repeat the same mistake.
    expect(e.message.toLowerCase()).toContain('email');
    expect(e.message.toLowerCase()).toContain('browser');
  });
});

describe('validateAcademyBadgeUrl - boundaries', () => {
  it('rejects empty and whitespace-only input', () => {
    thrown(() => validateAcademyBadgeUrl(''));
    thrown(() => validateAcademyBadgeUrl('   '));
    thrown(() => validateAcademyBadgeUrl(undefined as unknown as string));
    thrown(() => validateAcademyBadgeUrl(null as unknown as string));
  });

  it('rejects an id shorter than the minimum', () => {
    thrown(() => validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/abc`));
  });

  it('accepts an id at the minimum length and rejects one character less', () => {
    const eight = 'abcd1234';
    expect(validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/${eight}`)).toContain(eight);
    thrown(() => validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/${eight.slice(0, 7)}`));
  });

  it('accepts an id at the maximum length and rejects one character more', () => {
    const max = 'a'.repeat(256);
    expect(validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/${max}`)).toContain(max);
    thrown(() => validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/${'a'.repeat(257)}`));
  });

  it('rejects an overlong link outright', () => {
    thrown(() => validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/${'a'.repeat(3000)}`));
  });

  it('rejects an id with characters a badge id does not use', () => {
    thrown(() => validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/has space`));
    thrown(() => validateAcademyBadgeUrl(`https://${ACADEMY_BADGE_HOST}/badges/semi;colon`));
  });
});

describe('the unverified-link contract', () => {
  it('exports the marker that says the destination was never inspected', () => {
    // The validator deliberately does not fetch. Anything that stores badge
    // proof must carry this marker, so no surface can imply we checked it.
    expect(UNVERIFIED_LINK).toBe('unverified_link');
  });
});
