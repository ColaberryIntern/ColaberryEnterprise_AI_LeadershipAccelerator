import { parsePersonRef } from '../personRef';

/**
 * Ref parsing, which is the gate every admin "click a name" link passes through.
 *
 * Parsing is tested rather than resolution because parsing is where a bad input
 * would reach a query. The two lookups are one-line SELECTs by primary key and
 * are verified against production instead (see the person-360 skill).
 */

describe('parsePersonRef', () => {
  it('reads an email and normalises it', () => {
    expect(parsePersonRef('  Somebody@Example.COM ')).toEqual({
      kind: 'email', value: 'somebody@example.com',
    });
  });

  it('reads the lead form', () => {
    expect(parsePersonRef('lead:24945')).toEqual({ kind: 'lead', value: '24945' });
    // Case-insensitive, because a hand-typed URL is a real way in.
    expect(parsePersonRef('LEAD:7')).toEqual({ kind: 'lead', value: '7' });
  });

  it('treats a bare integer as a lead id', () => {
    // This is the shape a redirect from /admin/leads/:id hands over.
    expect(parsePersonRef('938')).toEqual({ kind: 'lead', value: '938' });
  });

  it('reads the enrollment form only for a uuid-shaped value', () => {
    const uuid = 'c31ea314-6ee0-4469-96d2-d30aac469bdc';
    expect(parsePersonRef(`enrollment:${uuid}`)).toEqual({ kind: 'enrollment', value: uuid });
    expect(parsePersonRef('enrollment:not-a-uuid')).toBeNull();
  });

  describe('refuses rather than guesses', () => {
    it.each([
      ['empty', ''],
      ['whitespace', '   '],
      ['null', null],
      ['undefined', undefined],
      ['a bare word', 'martin'],
      ['a non-numeric lead id', 'lead:abc'],
      ['a negative lead id', 'lead:-1'],
      ['an email with no local part', '@example.com'],
    ])('%s', (_label, input) => {
      expect(parsePersonRef(input as string | null | undefined)).toBeNull();
    });

    it('does not accept a lead id with injected SQL', () => {
      // The value reaches a query, so the shape check is the defence. Bound
      // parameters make this safe anyway; refusing it early means a malformed
      // link fails as "not found" rather than as a database error.
      expect(parsePersonRef("lead:1; DROP TABLE leads")).toBeNull();
      expect(parsePersonRef("enrollment:' OR '1'='1")).toBeNull();
    });
  });
});
