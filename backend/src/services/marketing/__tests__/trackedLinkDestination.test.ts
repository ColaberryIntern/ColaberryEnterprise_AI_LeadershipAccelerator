import {
  validateDestination,
  applyUtmParams,
  normalizeHostname,
} from '../trackedLinkDestination';

/**
 * `/r/:shortCode` is a PUBLIC endpoint that 302s a visitor to a stored destination. That makes
 * every one of these an open-redirect test, not a URL-parsing test. If an attacker can get an
 * arbitrary URL stored, the platform becomes a redirector lending Colaberry's domain
 * reputation to a phishing page — and the victim sees a legitimate colaberry.ai link.
 */

const ALLOWED = new Set(['enterprise.colaberry.ai', 'learn.colaberry.com', 'colaberry.ai']);

describe('validateDestination — scheme', () => {
  it('accepts https and http', () => {
    expect(validateDestination('https://colaberry.ai/x', ALLOWED).ok).toBe(true);
    expect(validateDestination('http://colaberry.ai/x', ALLOWED).ok).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://colaberry.ai/x',
    'blob:https://colaberry.ai/abc',
  ])('rejects %s', (raw) => {
    const r = validateDestination(raw, ALLOWED);
    expect(r.ok).toBe(false);
    // Allowlisted schemes, not a denylist: being wrong here is an XSS vector, and a denylist
    // always misses whatever a browser adds next.
    expect(['DISALLOWED_SCHEME', 'UNPARSEABLE']).toContain(r.code);
  });
});

describe('validateDestination — host allowlist', () => {
  it('accepts an allowlisted host', () => {
    expect(validateDestination('https://learn.colaberry.com/open-house', ALLOWED).ok).toBe(true);
  });

  it('rejects a host that is not configured', () => {
    const r = validateDestination('https://evil.test/phish', ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('HOST_NOT_ALLOWED');
  });

  it('rejects a subdomain of an allowlisted host', () => {
    // Exact match only. `colaberry.ai.evil.test` ENDS WITH an allowlisted string, and a
    // suffix check would wave it straight through.
    expect(validateDestination('https://colaberry.ai.evil.test/x', ALLOWED).ok).toBe(false);
    // And a genuine subdomain we have not registered is also refused, deliberately: brand
    // domains are enumerated, not inferred.
    expect(validateDestination('https://unknown.colaberry.ai/x', ALLOWED).ok).toBe(false);
  });

  it('is case-insensitive about the host', () => {
    expect(validateDestination('https://COLABERRY.AI/x', ALLOWED).ok).toBe(true);
  });

  it('treats a trailing-dot FQDN as the same host', () => {
    // `colaberry.ai.` resolves identically in a browser. Treating it as a different host
    // would let it slip past an allowlist containing the bare form.
    expect(validateDestination('https://colaberry.ai./x', ALLOWED).ok).toBe(true);
  });
});

describe('validateDestination — the classic redirect smuggles', () => {
  it('rejects userinfo pointing at an allowlisted host', () => {
    // `https://colaberry.ai@evil.test/` reads to a human as colaberry.ai. Its real hostname
    // is evil.test.
    const r = validateDestination('https://colaberry.ai@evil.test/', ALLOWED);
    expect(r.ok).toBe(false);
    expect(['EMBEDDED_CREDENTIALS', 'HOST_NOT_ALLOWED']).toContain(r.code);
  });

  it('rejects embedded credentials even on an allowlisted host', () => {
    const r = validateDestination('https://user:pass@colaberry.ai/x', ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('EMBEDDED_CREDENTIALS');
  });

  it('rejects a fragment that fakes the host', () => {
    // `https://evil.test#@colaberry.ai` — everything after # is a fragment; the host is
    // evil.test.
    expect(validateDestination('https://evil.test#@colaberry.ai', ALLOWED).ok).toBe(false);
  });

  it('rejects a protocol-relative URL rather than resolving it', () => {
    // No base URL is passed to `new URL`, on purpose. Supplying one would resolve
    // `//evil.test` against our own origin and manufacture a valid absolute URL out of input
    // that was never absolute.
    const r = validateDestination('//evil.test/x', ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('UNPARSEABLE');
  });

  it('rejects a bare path', () => {
    expect(validateDestination('/open-house', ALLOWED).code).toBe('UNPARSEABLE');
  });

  it('rejects a Unicode homograph of an allowlisted host', () => {
    // Cyrillic 'а' (U+0430) in place of Latin 'a'. URL punycodes it, so it arrives as
    // xn--... and simply fails to match — which is why comparison happens after parsing
    // rather than on the raw string.
    const homograph = 'https://colаberry.ai/x';
    expect(validateDestination(homograph, ALLOWED).ok).toBe(false);
  });

  it('rejects a backslash-confused authority', () => {
    expect(validateDestination('https://evil.test\\@colaberry.ai/', ALLOWED).ok).toBe(false);
  });
});

describe('validateDestination — allowlist availability', () => {
  it('refuses everything when the allowlist is empty, and says why distinctly', () => {
    // Empty means the brand-domain lookup failed or none are configured. Reported separately
    // from HOST_NOT_ALLOWED because the operator's next action differs: configure a domain,
    // versus correct the URL. Conflating them sends people hunting the wrong problem.
    const r = validateDestination('https://colaberry.ai/x', new Set());
    expect(r.ok).toBe(false);
    expect(r.code).toBe('ALLOWLIST_EMPTY');
    expect(r.reason).toMatch(/no linkable brand domains/i);
  });

  it('fails CLOSED — an empty allowlist never means "allow anything"', () => {
    expect(validateDestination('https://evil.test/x', new Set()).ok).toBe(false);
  });
});

describe('validateDestination — empty and malformed', () => {
  it.each([null, undefined, '', '   '])('rejects %p', (raw) => {
    expect(validateDestination(raw as any, ALLOWED).code).toBe('EMPTY');
  });

  it('rejects unparseable junk', () => {
    expect(validateDestination('ht!tp://::::', ALLOWED).ok).toBe(false);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(validateDestination('  https://colaberry.ai/x  ', ALLOWED).ok).toBe(true);
  });
});

describe('normalizeHostname', () => {
  it('lowercases and strips a single trailing dot', () => {
    expect(normalizeHostname('  Colaberry.AI.  ')).toBe('colaberry.ai');
  });
});

describe('applyUtmParams', () => {
  it('adds parameters while preserving existing query', () => {
    const { url } = applyUtmParams('https://colaberry.ai/x?ref=abc', {
      utm_source: 'linkedin', utm_medium: 'organic_social', utm_campaign: 'c-1',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('ref')).toBe('abc');
    expect(parsed.searchParams.get('utm_source')).toBe('linkedin');
  });

  it('overwrites a conflicting UTM already in the destination, and reports it', () => {
    // The generated set is canonical. A hand-typed `utm_source=Facebook` left in place is
    // exactly the drift the taxonomy exists to eliminate — but the operator is told rather
    // than having their input silently changed.
    const { url, overwritten } = applyUtmParams(
      'https://colaberry.ai/x?utm_source=Facebook',
      { utm_source: 'facebook' },
    );
    expect(new URL(url).searchParams.get('utm_source')).toBe('facebook');
    expect(overwritten).toEqual(['utm_source']);
  });

  it('does not report an overwrite when the value already matches', () => {
    const { overwritten } = applyUtmParams(
      'https://colaberry.ai/x?utm_source=facebook',
      { utm_source: 'facebook' },
    );
    expect(overwritten).toEqual([]);
  });

  it('skips undefined and empty values rather than emitting blank parameters', () => {
    // `utm_term=` in a URL looks like a real dimension with a blank value and becomes its own
    // row in reporting.
    const { url } = applyUtmParams('https://colaberry.ai/x', {
      utm_source: 'x', utm_term: undefined, utm_content: '',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('utm_term')).toBe(false);
    expect(parsed.searchParams.has('utm_content')).toBe(false);
  });

  it('preserves the fragment', () => {
    const { url } = applyUtmParams('https://colaberry.ai/x#section', { utm_source: 'x' });
    expect(new URL(url).hash).toBe('#section');
  });
});

describe('validateDestination - returns a result, never throws', () => {
  /**
   * The function's docstring promises it returns rather than throws, and it did not: any
   * non-string non-nullish input reached `rawUrl.trim()` and threw a TypeError. It never
   * produced an unsafe ACCEPT, so the security property held - but a throw inside a route
   * handler becomes a 500, or worse is caught by something upstream that treats an exception
   * as "could not validate" rather than "reject". Found in review.
   */
  it.each([
    [{}, 'object'],
    [[], 'array'],
    [42, 'number'],
    [true, 'boolean'],
    [new Date(), 'Date'],
    [Symbol('x'), 'symbol'],
    [() => 'https://colaberry.ai', 'function'],
  ])('does not throw for a %s input', (bad) => {
    expect(() => validateDestination(bad as any, ALLOWED)).not.toThrow();
  });

  it.each([
    [{}], [[]], [42], [true],
  ])('reports NOT_A_STRING for %p rather than guessing', (bad) => {
    const r = validateDestination(bad as any, ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NOT_A_STRING');
  });

  it('still fails CLOSED for every non-string input', () => {
    for (const bad of [{}, [], 42, true, new Date(), () => 1]) {
      expect(validateDestination(bad as any, ALLOWED).ok).toBe(false);
    }
  });
});
