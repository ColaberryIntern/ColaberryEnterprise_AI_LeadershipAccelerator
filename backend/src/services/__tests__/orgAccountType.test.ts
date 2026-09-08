import {
  resolveAccountType,
  normalizeEntrySite,
  grantsTrainingEnrollment,
  accountTypeLabel,
  isOrgAccountType,
  lookupEntrySite,
  ORG_ACCOUNT_TYPES,
  DEFAULT_ACCOUNT_TYPE,
} from '../orgAccountType';

/**
 * Three business accounts, decided by the entry site.
 *
 * The load-bearing test is the last block: a consulting client must not get a
 * training enrollment. That is the mistake this exists to fix — AI Flotation
 * registrations created free training accounts for people who had come to have
 * something built.
 *
 * The second most important property is that an UNKNOWN site behaves exactly as
 * today. This runs on live public registration, so an unmapped brand page must
 * keep working rather than start producing accounts of a new kind.
 */

describe('the entry site decides', () => {
  it('maps a known consulting site', () => {
    expect(resolveAccountType({ entrySite: 'aiflotation.com' }).accountType).toBe('client');
  });

  it('accepts a full URL, a bare host, or a referrer with a path', () => {
    // The front end may send document.referrer, location.hostname, or a
    // constant. Which one arrives must not change the account a person gets.
    for (const form of [
      'aiflotation.com',
      'https://aiflotation.com',
      'https://aiflotation.com/get-started?utm=x',
      'HTTPS://AIFlotation.com/',
      'aiflotation.com:443',
    ]) {
      expect(resolveAccountType({ entrySite: form }).accountType).toBe('client');
    }
  });

  it('matches www and bare separately, because the table lists both', () => {
    expect(resolveAccountType({ entrySite: 'www.aiflotation.com' }).accountType).toBe('client');
  });

  it('does NOT map the retired dataflotation domain', () => {
    // aiflotation replaced it. A retired domain must not quietly keep minting
    // consulting accounts.
    expect(resolveAccountType({ entrySite: 'dataflotation.com' }).matched).toBe(false);
  });

  it('still maps a consulting site when a path is present', () => {
    expect(resolveAccountType({ entrySite: 'https://aiflotation.com/start' }).accountType).toBe(
      'client',
    );
  });
});

describe('one domain can mean two things', () => {
  // Colaberry Enterprise is the Business entrance today and will later offer
  // consulting too. A hostname-only table could never express that, so these
  // tests pin the mechanism before the page exists.
  const TABLE = {
    'ent.example': 'enterprise_customer',
    'ent.example/consulting': 'client',
  } as const;

  it('prefers the longest matching key', () => {
    expect(lookupEntrySite('ent.example/consulting', TABLE)).toBe('client');
    expect(lookupEntrySite('ent.example/consulting/start', TABLE)).toBe('client');
  });

  it('falls back to the bare host when no path matches', () => {
    expect(lookupEntrySite('ent.example/pricing', TABLE)).toBe('enterprise_customer');
    expect(lookupEntrySite('ent.example', TABLE)).toBe('enterprise_customer');
  });

  it('a general domain never shadows a specific page', () => {
    // The property that makes the future change one line: adding a consulting
    // page to an already-mapped Business domain must win for that path only.
    expect(lookupEntrySite('ent.example/consulting', TABLE)).not.toBe(
      lookupEntrySite('ent.example', TABLE),
    );
  });

  it('returns nothing for an unmapped host', () => {
    expect(lookupEntrySite('other.example/consulting', TABLE)).toBeUndefined();
  });
});

describe('an unknown site keeps today’s behaviour', () => {
  it.each(['', null, undefined, 'somewhere-new.example', 'https://unmapped.io/signup'])(
    'defaults to enterprise_customer for %j',
    (site) => {
      const r = resolveAccountType({ entrySite: site as any });
      expect(r.accountType).toBe(DEFAULT_ACCOUNT_TYPE);
      expect(r.accountType).toBe('enterprise_customer');
      expect(r.matched).toBe(false);
    },
  );

  it('reports that it did not match, so an unmapped brand is visible in logs', () => {
    expect(resolveAccountType({ entrySite: 'unmapped.io' })).toMatchObject({
      matched: false,
      host: 'unmapped.io',
    });
  });
});

describe('an explicit type overrides the site', () => {
  it('honours a valid internal override', () => {
    const r = resolveAccountType({ accountType: 'client', entrySite: 'colaberry.ai' });
    expect(r.accountType).toBe('client');
  });

  it('ignores an invalid one rather than trusting it', () => {
    // A typo must not silently create an account of an unknown kind.
    const r = resolveAccountType({ accountType: 'consulting', entrySite: 'colaberry.ai' });
    expect(r.accountType).toBe('enterprise_customer');
  });

  it('rejects unknown values at the type guard', () => {
    expect(isOrgAccountType('client')).toBe(true);
    expect(isOrgAccountType('consulting')).toBe(false);
  });
});

describe('only consulting skips the training enrollment', () => {
  it('does not enrol a consulting client', () => {
    // The AI Flotation mistake, in one assertion.
    expect(grantsTrainingEnrollment('client')).toBe(false);
  });

  it('still enrols a business account', () => {
    // A manager who cannot see the curriculum cannot evaluate it.
    expect(grantsTrainingEnrollment('enterprise_customer')).toBe(true);
  });

  it('covers every declared type, so a new one cannot be forgotten', () => {
    for (const t of ORG_ACCOUNT_TYPES) {
      expect(typeof grantsTrainingEnrollment(t)).toBe('boolean');
    }
  });
});

describe('labels', () => {
  it('shows client as Consulting to a human', () => {
    expect(accountTypeLabel('client')).toBe('Consulting');
  });

  it('labels a business account', () => {
    expect(accountTypeLabel('enterprise_customer')).toBe('Business');
  });

  it('labels the other documented org types as Business', () => {
    // community_partner, church, nonprofit_partner, internal, sponsor all exist
    // in the model's vocabulary and none of them is a consulting engagement.
    for (const t of ['community_partner', 'church', 'nonprofit_partner', 'internal', 'sponsor']) {
      expect(accountTypeLabel(t)).toBe('Business');
    }
  });

  it('falls back to Business for a null or legacy value', () => {
    // Existing rows predate the field; they are business accounts.
    expect(accountTypeLabel(null)).toBe('Business');
    expect(accountTypeLabel('something_old')).toBe('Business');
  });
});

describe('normalizeEntrySite', () => {
  it.each([
    ['https://a.com/x?y=1#z', 'a.com/x'],
    ['HTTP://A.COM', 'a.com'],
    ['a.com:8080', 'a.com'],
    ['  a.com  ', 'a.com'],
    ['https://a.com/consulting/', 'a.com/consulting'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeEntrySite(input)).toBe(expected);
  });

  it('keeps the path, because one domain will soon mean two things', () => {
    expect(normalizeEntrySite('https://enterprise.colaberry.ai/consulting')).toBe(
      'enterprise.colaberry.ai/consulting',
    );
  });

  it('does not strip www, so a missing table entry stays visible', () => {
    expect(normalizeEntrySite('https://www.a.com')).toBe('www.a.com');
  });
});
