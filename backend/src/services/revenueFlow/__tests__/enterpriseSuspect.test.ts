import { SuspectRow, countCompanies, suspectReasons } from '../enterpriseSuspect';

/**
 * R23 Phase 4 — the flags that tell a test row from a prospect.
 *
 * What these hold, in order of how badly it would hurt to get them wrong:
 *
 * 1. A CLEAN ROW MUST PRODUCE NO FLAGS. This is the case that runs on every real deal, and a
 *    false flag beside a real $54,000 engagement costs more trust than the whole feature
 *    saves. Several tests below exist only to pin names a careless pattern WOULD flag:
 *    "Latest Logistics", "Demolition Services", "notcolaberry.com".
 *
 * 2. THE ROW THAT ACTUALLY ARRIVED MUST BE CAUGHT. "Acme Test Logistics" landed in production
 *    within hours of the Phase 3 deploy on 2026-11-21. It is pinned verbatim, because a
 *    flagging feature that misses the row that motivated it is worse than none: it would
 *    report a clean funnel.
 *
 * 3. BLANK IS NOT A DUPLICATE OF BLANK. Three rows with no company are three rows with one
 *    problem, not three duplicates. Counting them as duplicates would put two flags on every
 *    unnamed row and make the duplicate flag mean nothing.
 */

function row(over: Partial<SuspectRow> = {}): SuspectRow {
  return {
    company: 'Acme Industrial',
    full_name: 'Dana Reyes',
    email: 'dana.reyes@acme-industrial.com',
    ...over,
  };
}

/** Flags for one row considered alone, which is every case except the duplicate check. */
function reasons(over: Partial<SuspectRow> = {}): string[] {
  const r = row(over);
  return suspectReasons(r, countCompanies([r]));
}

describe('enterpriseSuspect — a clean row is not flagged', () => {
  it('produces no flags at all for an ordinary inquiry', () => {
    expect(reasons()).toEqual([]);
  });

  it('does not flag a company whose name merely CONTAINS the letters "test"', () => {
    // Without the leading word boundary this flags, and "Latest" is a plausible real name.
    expect(reasons({ company: 'Latest Logistics Group' })).toEqual([]);
  });

  it('does not flag a company whose name STARTS with the letters "demo"', () => {
    // Without the trailing word boundary this flags. Demolition contractors are real buyers.
    expect(reasons({ company: 'Demolition Services of Texas' })).toEqual([]);
  });

  it('does not flag a domain that merely ends with our domain name as a substring', () => {
    // The endsWith trap: 'notcolaberry.com' must not read as a subdomain of colaberry.com.
    expect(reasons({ email: 'buyer@notcolaberry.com' })).toEqual([]);
  });

  it('does not flag a domain that merely ends with a throwaway name as a substring', () => {
    expect(reasons({ email: 'buyer@notexample.com' })).toEqual([]);
  });

  it('does not flag a registered domain whose second level happens to be a reserved word', () => {
    // '.test' is a reserved TLD; 'test.io' is a real, registerable domain. Matching the label
    // anywhere in the name rather than as the TLD would flag this, and it is a real address.
    expect(reasons({ company: 'Western Valve', email: 'dana@test.io' })).toEqual([]);
  });
});

describe('enterpriseSuspect — the row that actually arrived', () => {
  it('flags the production row verbatim, naming the field that tripped', () => {
    const flags = reasons({ company: 'Acme Test Logistics' });
    expect(flags).toContain('looks like a test row (company name)');
  });

  it('flags it whatever case it was typed in', () => {
    expect(reasons({ company: 'ACME TEST LOGISTICS' }))
      .toContain('looks like a test row (company name)');
  });
});

describe('enterpriseSuspect — placeholder text, per field', () => {
  it('names the company name when that is what tripped', () => {
    expect(reasons({ company: 'Test Co' })).toEqual(['looks like a test row (company name)']);
  });

  it('names the contact name when that is what tripped', () => {
    expect(reasons({ full_name: 'Test User' })).toEqual(['looks like a test row (contact name)']);
  });

  it('names the contact email when the local part is what tripped', () => {
    expect(reasons({ email: 'test@acme-industrial.com' }))
      .toEqual(['looks like a test row (contact email)']);
  });

  it('reads the local part only, so a real name at a domain containing the word is clean', () => {
    // The DOMAIN carrying "testing" is a separate question from the local part carrying it.
    // This address is at a real registered domain and the person is not called "test".
    expect(reasons({ email: 'dana@testing-labs.com' })).toEqual([]);
  });

  it('emits ONE flag listing every field that tripped, not one flag per field', () => {
    const flags = reasons({
      company: 'Demo Corp', full_name: 'Sample Person', email: 'asdf@acme-industrial.com',
    });
    expect(flags).toEqual([
      'looks like a test row (company name, contact name, contact email)',
    ]);
  });

  it.each(['tests', 'testing', 'demo', 'sample', 'example', 'dummy', 'placeholder', 'asdf', 'qwerty'])(
    'flags the placeholder word %s in a company name',
    (word) => {
      expect(reasons({ company: `${word} industries` }))
        .toContain('looks like a test row (company name)');
    },
  );
});

describe('enterpriseSuspect — the address tells us whose row this is', () => {
  it('flags one of our own domains as us rather than a prospect', () => {
    expect(reasons({ email: 'ali@colaberry.com' }))
      .toEqual(['the contact email is one of our own domains, so this is us and not a prospect']);
  });

  it('flags a subdomain of one of ours, because staff mail is still staff mail', () => {
    expect(reasons({ email: 'ops@mail.colaberry.ai' }))
      .toContain('the contact email is one of our own domains, so this is us and not a prospect');
  });

  it('flags refactored.ai, which is the same company under a different name', () => {
    expect(reasons({ email: 'team@refactored.ai' }))
      .toContain('the contact email is one of our own domains, so this is us and not a prospect');
  });

  it('flags a throwaway mailbox provider', () => {
    expect(reasons({ email: 'buyer@mailinator.com' }))
      .toContain('the contact email is at a throwaway or reserved domain');
  });

  it.each(['example.com', 'example.org', 'test.com', 'yopmail.com'])(
    'flags the throwaway domain %s',
    (domain) => {
      expect(reasons({ email: `buyer@${domain}` }))
        .toContain('the contact email is at a throwaway or reserved domain');
    },
  );

  it.each(['.test', '.example', '.invalid', '.localhost', '.local'])(
    'flags the RFC-reserved TLD %s, which can never be registered',
    (tld) => {
      expect(reasons({ email: `buyer@acme${tld}` }))
        .toContain('the contact email is at a throwaway or reserved domain');
    },
  );

  it('flags a bare reserved label with no dot in front of it', () => {
    expect(reasons({ email: 'buyer@test' }))
      .toContain('the contact email is at a throwaway or reserved domain');
  });

  it('ignores case in the domain, since nobody types addresses consistently', () => {
    expect(reasons({ email: 'ALI@COLABERRY.COM' }))
      .toContain('the contact email is one of our own domains, so this is us and not a prospect');
  });
});

describe('enterpriseSuspect — what the row is missing', () => {
  it('flags a blank company, because an unnamed row cannot be safely priced', () => {
    expect(reasons({ company: '' }))
      .toContain('no company name recorded, so the deal cannot be named or priced');
  });

  it('treats whitespace as blank rather than as a company name', () => {
    expect(reasons({ company: '   ' }))
      .toContain('no company name recorded, so the deal cannot be named or priced');
  });

  it('flags a blank email, because an inquiry nobody can answer cannot become a deal', () => {
    expect(reasons({ email: '' }))
      .toContain('no contact email recorded, so the inquiry cannot be answered');
  });

  it('flags a null company and a null email together', () => {
    const flags = reasons({ company: null, email: null });
    expect(flags).toContain('no company name recorded, so the deal cannot be named or priced');
    expect(flags).toContain('no contact email recorded, so the inquiry cannot be answered');
  });
});

describe('enterpriseSuspect — duplicates', () => {
  const rows = [
    row({ company: 'Western Valve', email: 'a@western-valve.com' }),
    row({ company: 'western valve', email: 'b@western-valve.com' }),
    row({ company: 'Northside Glass', email: 'c@northside.com' }),
  ];

  it('flags BOTH halves of a duplicate, not just the second one', () => {
    const counts = countCompanies(rows);
    expect(suspectReasons(rows[0], counts)).toContain('duplicate company name');
    expect(suspectReasons(rows[1], counts)).toContain('duplicate company name');
  });

  it('leaves the unique row alone', () => {
    expect(suspectReasons(rows[2], countCompanies(rows))).toEqual([]);
  });

  it('does NOT treat two blank companies as duplicates of each other', () => {
    const blanks = [row({ company: '' }), row({ company: null })];
    const counts = countCompanies(blanks);
    for (const b of blanks) {
      const flags = suspectReasons(b, counts);
      expect(flags).toContain('no company name recorded, so the deal cannot be named or priced');
      expect(flags).not.toContain('duplicate company name');
    }
  });

  it('counts by trimmed, lowercased name so spacing does not hide a duplicate', () => {
    const counts = countCompanies([row({ company: ' Western Valve ' }), row({ company: 'WESTERN VALVE' })]);
    expect(counts.get('western valve')).toBe(2);
  });

  it('counts nothing for a set of blank names', () => {
    expect(countCompanies([row({ company: '' }), row({ company: null })]).size).toBe(0);
  });
});

describe('enterpriseSuspect — the shape of the answer', () => {
  it('puts the test-row flag first, because it is the first thing a reader reads', () => {
    const flags = reasons({ company: 'Test Co', email: 'ali@colaberry.com' });
    expect(flags[0]).toBe('looks like a test row (company name)');
  });

  it('can return several flags for one genuinely bad row', () => {
    const r = row({ company: '', full_name: 'Test User', email: 'test@example.com' });
    const flags = suspectReasons(r, countCompanies([r]));
    expect(flags).toEqual([
      'looks like a test row (contact name, contact email)',
      'the contact email is at a throwaway or reserved domain',
      'no company name recorded, so the deal cannot be named or priced',
    ]);
  });
});
