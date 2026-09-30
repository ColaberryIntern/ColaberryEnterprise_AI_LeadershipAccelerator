/* eslint-disable */
// Unit tests for the outbound do-not-send list.
//
// The second describe block is the one that actually matters operationally:
// it walks the reporting registry (the source of truth for every cron-driven
// report) and fails if a suppressed address has been re-added to any recipient
// list. Without it, one careless copy/paste puts 80 emails a week back into a
// mailbox that is meant to be silent.

const {
  isSuppressed,
  stripSuppressed,
  scrubRecipients,
  assertNoSuppressed,
  SUPPRESSED,
} = require('../suppressedRecipients');

const SUPPRESSED_ADDR = 'alimuwwakkil@gmail.com';

describe('suppressedRecipients.isSuppressed', () => {
  it('matches the bare address', () => {
    expect(isSuppressed(SUPPRESSED_ADDR)).toBe(true);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(isSuppressed('  AliMuwwakkil@Gmail.COM ')).toBe(true);
  });

  it('matches inside a display-name form', () => {
    expect(isSuppressed(`Ali Muwwakkil <${SUPPRESSED_ADDR}>`)).toBe(true);
  });

  it('does not match the work address', () => {
    expect(isSuppressed('ali@colaberry.com')).toBe(false);
  });

  it('does not match a lookalike address', () => {
    expect(isSuppressed('alimuwwakkil@gmail.com.example.net')).toBe(false);
  });

  it('tolerates non-string input', () => {
    expect(isSuppressed(undefined)).toBe(false);
    expect(isSuppressed(null)).toBe(false);
    expect(isSuppressed(42)).toBe(false);
  });
});

describe('suppressedRecipients.stripSuppressed', () => {
  it('removes the address from an array and preserves the rest', () => {
    expect(stripSuppressed([SUPPRESSED_ADDR, 'ram@colaberry.com']))
      .toEqual(['ram@colaberry.com']);
  });

  it('returns an empty array when the address was the only member', () => {
    expect(stripSuppressed([SUPPRESSED_ADDR])).toEqual([]);
  });

  it('removes the address from a comma-joined string', () => {
    expect(stripSuppressed(`ram@colaberry.com, ${SUPPRESSED_ADDR}`))
      .toBe('ram@colaberry.com');
  });

  it('returns undefined when a string field held only the address', () => {
    expect(stripSuppressed(SUPPRESSED_ADDR)).toBeUndefined();
  });

  it('passes null and undefined through unchanged', () => {
    expect(stripSuppressed(null)).toBeNull();
    expect(stripSuppressed(undefined)).toBeUndefined();
  });
});

describe('suppressedRecipients.scrubRecipients', () => {
  it('drops cc entirely when it held only the suppressed address', () => {
    const out = scrubRecipients({
      to: 'ali@colaberry.com',
      cc: [SUPPRESSED_ADDR],
      subject: 'x',
    });
    expect(out.to).toBe('ali@colaberry.com');
    expect('cc' in out).toBe(false);
    expect(out.subject).toBe('x');
  });

  it('keeps the surviving members of cc and bcc', () => {
    const out = scrubRecipients({
      to: 'ali@colaberry.com',
      cc: [SUPPRESSED_ADDR, 'ram@colaberry.com'],
      bcc: ['addie.m.mack@gmail.com', SUPPRESSED_ADDR],
    });
    expect(out.cc).toEqual(['ram@colaberry.com']);
    expect(out.bcc).toEqual(['addie.m.mack@gmail.com']);
  });

  it('does not mutate the caller-supplied object', () => {
    const input = { to: 'ali@colaberry.com', cc: [SUPPRESSED_ADDR] };
    scrubRecipients(input);
    expect(input.cc).toEqual([SUPPRESSED_ADDR]);
  });

  it('is idempotent - scrubbing twice equals scrubbing once', () => {
    const once = scrubRecipients({ to: 'ali@colaberry.com', cc: [SUPPRESSED_ADDR, 'ram@colaberry.com'] });
    expect(scrubRecipients(once)).toEqual(once);
  });

  it('handles an empty object', () => {
    expect(scrubRecipients({})).toEqual({});
    expect(scrubRecipients()).toEqual({});
  });
});

describe('suppressedRecipients.assertNoSuppressed', () => {
  it('throws and names the offending field when the address is present', () => {
    expect(() => assertNoSuppressed({ to: 'ali@colaberry.com', cc: [SUPPRESSED_ADDR] }))
      .toThrow(/cc: alimuwwakkil@gmail\.com/);
  });

  it('passes a clean recipient set', () => {
    expect(() => assertNoSuppressed({ to: 'ali@colaberry.com', cc: ['ram@colaberry.com'] }))
      .not.toThrow();
  });
});

describe('reportingRegistry never targets a suppressed address', () => {
  const { REPORTS } = require('../reportingRegistry');

  it('exposes at least one report (guards against an empty-registry false pass)', () => {
    expect(Array.isArray(REPORTS)).toBe(true);
    expect(REPORTS.length).toBeGreaterThan(0);
  });

  it.each(Array.from(SUPPRESSED))('no report cc/bcc/to contains %s', (addr) => {
    const offenders = [];
    for (const report of REPORTS) {
      const r = report.recipients || {};
      for (const field of ['to', 'cc', 'bcc']) {
        const value = r[field];
        if (value == null) continue;
        const list = Array.isArray(value) ? value : String(value).split(',');
        for (const entry of list) {
          if (String(entry).trim().toLowerCase().includes(addr)) {
            offenders.push(`${report.name} -> ${field}: ${entry}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
