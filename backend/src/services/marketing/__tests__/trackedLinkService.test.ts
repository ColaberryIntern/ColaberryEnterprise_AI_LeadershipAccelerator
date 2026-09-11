import {
  generateShortCode,
  allocateShortCode,
  buildTrackedLinkPreview,
  ShortCodeExhaustionError,
  DEFAULT_SHORT_CODE_LENGTH,
} from '../trackedLinkService';

const ALLOWED = new Set(['enterprise.colaberry.ai', 'learn.colaberry.com']);

/** Deterministic byte source, so short-code output is assertable rather than merely plausible. */
function bytesFrom(values: number[]): (n: number) => Buffer {
  let i = 0;
  return (n: number) => {
    const out = Buffer.alloc(n);
    for (let k = 0; k < n; k += 1) {
      out[k] = values[i % values.length];
      i += 1;
    }
    return out;
  };
}

describe('generateShortCode', () => {
  it('produces the requested length', () => {
    expect(generateShortCode(8, bytesFrom([0]))).toHaveLength(8);
    expect(generateShortCode(12, bytesFrom([0]))).toHaveLength(12);
    expect(generateShortCode(undefined, bytesFrom([0]))).toHaveLength(DEFAULT_SHORT_CODE_LENGTH);
  });

  it('never emits a visually ambiguous character', () => {
    // These codes get read aloud, typed off a printed QR card, and dictated over the phone.
    // `l` versus `1` in a URL that 404s is a support ticket nobody can diagnose.
    const code = generateShortCode(64, bytesFrom(Array.from({ length: 240 }, (_, i) => i)));
    for (const bad of ['I', 'L', 'O', 'U', '0', '1']) {
      expect(code).not.toContain(bad);
    }
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]+$/);
  });

  it('rejects bytes at or above the rejection threshold, keeping the distribution uniform', () => {
    // Alphabet is 30 chars, so 240 is the largest multiple of 30 under 256. Bytes 240-255 are
    // discarded. Taking `byte % 30` instead would bias the first 16 letters, and biased codes
    // collide measurably sooner than uniform ones — which matters because collisions are the
    // thing this module works hardest to avoid.
    //
    // Feed three rejected bytes then an accepted one, repeating. If rejection were not
    // happening, the first character would come from 250 % 30 = 10 ('N'). With rejection,
    // every character must come from the 0 that follows, i.e. ALPHABET[0] = '2'.
    //
    // Length 4 rather than 1: the generator refuses anything shorter, and an earlier draft of
    // this test asked for 1 and failed against that guard — the guard was right.
    const code = generateShortCode(4, bytesFrom([250, 251, 255, 0]));
    expect(code).toBe('2222');
  });

  it('refuses a length short enough to collide readily', () => {
    expect(() => generateShortCode(3)).toThrow(/collide too readily/i);
  });

  it('uses crypto randomness by default', () => {
    // No injected source: two calls must differ. A fixed or predictable code would let anyone
    // enumerate or forge links, since the code is effectively a capability.
    const a = generateShortCode();
    const b = generateShortCode();
    expect(a).not.toBe(b);
  });
});

describe('allocateShortCode — collisions retry, never overwrite', () => {
  it('returns the first code when it is free', async () => {
    const isTaken = jest.fn().mockResolvedValue(false);
    const code = await allocateShortCode(isTaken, { randomBytes: bytesFrom([0]) });
    expect(code).toHaveLength(DEFAULT_SHORT_CODE_LENGTH);
    expect(isTaken).toHaveBeenCalledTimes(1);
  });

  it('RETRIES rather than reusing a taken code', async () => {
    // Overwriting would not raise an error — it would silently repoint an existing link, so
    // every click already recorded against that code would be attributed to the new campaign.
    // There is no way to untangle that afterwards.
    const isTaken = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    const code = await allocateShortCode(isTaken, { randomBytes: bytesFrom([0, 1, 2, 3, 4, 5]) });

    expect(isTaken).toHaveBeenCalledTimes(3);
    // The code returned is the one that was NOT reported taken.
    const lastChecked = isTaken.mock.calls[2][0];
    expect(code).toBe(lastChecked);
    // Each attempt must generate a DIFFERENT code. Without this, an implementation that
    // re-polled the same code three times would satisfy the call count and still be broken -
    // it would loop forever against a genuinely taken code. Gap identified in review.
    const checked = isTaken.mock.calls.map((c) => c[0]);
    expect(new Set(checked).size).toBe(3);
  });

  it('throws rather than looping forever when every code is taken', async () => {
    const isTaken = jest.fn().mockResolvedValue(true);
    await expect(allocateShortCode(isTaken, { maxAttempts: 4 }))
      .rejects.toThrow(ShortCodeExhaustionError);
    expect(isTaken).toHaveBeenCalledTimes(4);
  });

  it('names exhaustion as a broken-uniqueness signal, not a routine outcome', async () => {
    const isTaken = jest.fn().mockResolvedValue(true);
    await expect(allocateShortCode(isTaken, { maxAttempts: 2 }))
      .rejects.toThrow(/never expected in normal use/i);
  });
});

describe('buildTrackedLinkPreview', () => {
  const base = {
    destinationUrl: 'https://learn.colaberry.com/open-house',
    allowedHosts: ALLOWED,
    utm: {
      source: 'linkedin' as const,
      medium: 'organic_social' as const,
      campaignSlug: 'cb-leadgen-oh-alumni-2026q3',
      variantCode: 'hero-a',
    },
    shortCode: 'ABCD2345',
    shortLinkOrigin: 'https://enterprise.colaberry.ai',
  };

  it('composes the short URL and the final destination', () => {
    const p = buildTrackedLinkPreview(base);
    expect(p.ok).toBe(true);
    expect(p.shortUrl).toBe('https://enterprise.colaberry.ai/r/ABCD2345');

    const final = new URL(p.finalUrl as string);
    expect(final.hostname).toBe('learn.colaberry.com');
    expect(final.searchParams.get('utm_source')).toBe('linkedin');
    expect(final.searchParams.get('utm_medium')).toBe('organic_social');
    expect(final.searchParams.get('utm_campaign')).toBe('cb-leadgen-oh-alumni-2026q3');
    expect(final.searchParams.get('utm_content')).toBe('hero-a');
  });

  it('tolerates a trailing slash on the origin without doubling it', () => {
    const p = buildTrackedLinkPreview({ ...base, shortLinkOrigin: 'https://enterprise.colaberry.ai/' });
    expect(p.shortUrl).toBe('https://enterprise.colaberry.ai/r/ABCD2345');
  });

  it('refuses to preview a destination that is not allowlisted', () => {
    // The preview is the last cheap moment to catch a mistake — everything about a published
    // tracked link is frozen afterwards.
    const p = buildTrackedLinkPreview({ ...base, destinationUrl: 'https://evil.test/x' });
    expect(p.ok).toBe(false);
    expect(p.rejection?.code).toBe('HOST_NOT_ALLOWED');
    expect(p.shortUrl).toBeUndefined();
    expect(p.finalUrl).toBeUndefined();
  });

  it('refuses a javascript: destination', () => {
    const p = buildTrackedLinkPreview({ ...base, destinationUrl: 'javascript:alert(1)' });
    expect(p.ok).toBe(false);
  });

  it('reports UTMs it overwrote in the destination', () => {
    const p = buildTrackedLinkPreview({
      ...base,
      destinationUrl: 'https://learn.colaberry.com/open-house?utm_source=LinkedIn&keep=1',
    });
    expect(p.ok).toBe(true);
    expect(p.overwritten).toEqual(['utm_source']);
    // Unrelated query parameters survive.
    expect(new URL(p.finalUrl as string).searchParams.get('keep')).toBe('1');
  });

  it('propagates a taxonomy rejection rather than emitting a malformed link', () => {
    expect(() => buildTrackedLinkPreview({
      ...base,
      utm: { ...base.utm, source: 'Facebook' as any },
    })).toThrow(/Unknown utm_source/);
  });
});

describe('generateShortCode - length guard fails CLOSED', () => {
  /**
   * `length < 4` alone let two values through, both found in review:
   *   NaN      -> `NaN < 4` is false, so it passed the guard and returned '' - precisely the
   *               zero-length code the guard exists to prevent.
   *   Infinity -> passed the guard and never terminated the loop, hanging the process.
   * `Number.isInteger` rejects NaN, Infinity and fractions in one check.
   */
  it.each([
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
    [8.5, 'a fraction'],
    [0, 'zero'],
    [-1, 'negative'],
    [3, 'below the minimum'],
  ])('throws for %p (%s)', (bad) => {
    expect(() => generateShortCode(bad as number, bytesFrom([0]))).toThrow(/at least 4/i);
  });

  it('never returns an empty code', () => {
    // The concrete harm NaN caused: an empty short code means /r/ with no code at all.
    for (const bad of [NaN, 0, -1, 3]) {
      let produced: string | null = null;
      try { produced = generateShortCode(bad as number, bytesFrom([0])); } catch { /* expected */ }
      expect(produced).toBeNull();
    }
  });
});

describe('buildTrackedLinkPreview - interpolated values are validated', () => {
  const base = {
    destinationUrl: 'https://learn.colaberry.com/open-house',
    allowedHosts: ALLOWED,
    utm: {
      source: 'linkedin' as const,
      medium: 'organic_social' as const,
      campaignSlug: 'cb-leadgen-oh-alumni-2026q3',
    },
    shortCode: 'ABCD2345',
    shortLinkOrigin: 'https://enterprise.colaberry.ai',
  };

  /**
   * Both values are system-generated today, which is exactly why they were unchecked - and
   * exactly how a string becomes attacker-controlled two refactors later. Found in review.
   */
  it.each([
    ['../../admin', 'path traversal'],
    ['ABC\r\nSet-Cookie: x=1', 'CRLF'],
    ['abcd1234', 'lowercase - not the generated alphabet'],
    ['ABCI0O1L', 'ambiguous glyphs the generator excludes'],
    ['AB', 'too short'],
    ['', 'empty'],
    ['ABCD 2345', 'whitespace'],
  ])('rejects a short code containing %p (%s)', (badCode) => {
    const p = buildTrackedLinkPreview({ ...base, shortCode: badCode });
    expect(p.ok).toBe(false);
    expect(p.shortUrl).toBeUndefined();
  });

  it.each([
    ['javascript:alert(1)', 'a script scheme'],
    ['not-a-url', 'a bare string'],
    ['//enterprise.colaberry.ai', 'protocol-relative'],
    ['https://user:pw@enterprise.colaberry.ai', 'embedded credentials'],
    ['', 'empty'],
  ])('rejects a short-link origin of %p (%s)', (badOrigin) => {
    const p = buildTrackedLinkPreview({ ...base, shortLinkOrigin: badOrigin });
    expect(p.ok).toBe(false);
    expect(p.shortUrl).toBeUndefined();
  });

  it('still accepts a well-formed code and origin', () => {
    expect(buildTrackedLinkPreview(base).ok).toBe(true);
  });
});
