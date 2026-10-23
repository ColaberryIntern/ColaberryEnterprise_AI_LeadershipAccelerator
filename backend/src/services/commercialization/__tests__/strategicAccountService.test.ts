const m = { query: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import {
  normalizeAccountName,
  resolveAccount,
  linkLeadToAccount,
  backfillLeadOrganizations,
  promoteToStrategicAccount,
  STRATEGIC_ACCOUNT_TYPE,
} from '../strategicAccountService';

/**
 * C8.3: "Deduplication proven by test." This file is that proof.
 *
 * THE REAL COLLISION, measured on production 2026-10-23 and used as the fixture below:
 * three organizations are named exactly "Colaberry" (22 members; 1 member with lead
 * 24472; 1 member), and twelve leads carry the company text "Colaberry".
 *
 * The hazard is not a CREATE TABLE. It is the one-line backfill
 *   UPDATE leads SET organization_id = o.id FROM organizations o
 *   WHERE lower(trim(leads.company)) = lower(trim(o.name))
 * which does not error — it silently picks one of the three and makes it authoritative
 * for all twelve. Every test here exists to prove that cannot happen.
 */
const COLABERRY = [
  { id: 'org-a', name: 'Colaberry', organization_type: 'enterprise_customer', members: 22 },
  { id: 'org-b', name: 'Colaberry', organization_type: 'enterprise_customer', members: 1 },
  { id: 'org-c', name: 'Colaberry', organization_type: 'enterprise_customer', members: 1 },
];
const JOHN_DEERE = [
  { id: 'org-jd', name: 'John Deere', organization_type: 'enterprise_customer', members: 2 },
];

/** Route each query by shape so call ORDER never matters. */
function mockDb(opts: {
  byName?: Record<string, Array<Record<string, unknown>>>;
  leadCompany?: string | null;
  groups?: Array<{ key: string; sample: string; leads: number }>;
  inserted?: string;
}) {
  const byName = opts.byName ?? {};
  m.query.mockImplementation((sql: string, o: { replacements?: Record<string, unknown> }) => {
    if (sql.includes('FROM organizations o') && sql.includes('= :key')) {
      return Promise.resolve(byName[String(o?.replacements?.key)] ?? []);
    }
    if (sql.includes('SELECT company FROM leads')) {
      return Promise.resolve([{ company: opts.leadCompany ?? null }]);
    }
    if (sql.includes('GROUP BY 1') && sql.includes('FROM leads')) {
      return Promise.resolve(opts.groups ?? []);
    }
    if (sql.includes('INSERT INTO organizations')) {
      return Promise.resolve([{ id: opts.inserted ?? 'org-new' }]);
    }
    return Promise.resolve([]); // UPDATEs
  });
}

const updates = () => m.query.mock.calls.filter(([s]) => /^\s*UPDATE/i.test(String(s)));
const inserts = () => m.query.mock.calls.filter(([s]) => /INSERT INTO/i.test(String(s)));

beforeEach(() => m.query.mockReset());

describe('normalizeAccountName is conservative on purpose', () => {
  it('folds case and collapses whitespace', () => {
    expect(normalizeAccountName('  Colaberry  ')).toBe('colaberry');
    expect(normalizeAccountName('John   Deere')).toBe('john deere');
  });

  it('does NOT strip suffixes, because merging two real accounts is the worse error', () => {
    // An aggressive normalizer would fold these together. Leaving a spelling unlinked is
    // visible and fixable; silently merging two organizations loses data with no trace.
    expect(normalizeAccountName('Acme Inc')).not.toBe(normalizeAccountName('Acme'));
    expect(normalizeAccountName('Acme, LLC')).not.toBe(normalizeAccountName('Acme LLC'));
  });

  it('treats blank and null as no name at all', () => {
    expect(normalizeAccountName(null)).toBe('');
    expect(normalizeAccountName('   ')).toBe('');
  });
});

describe('resolveAccount refuses to guess', () => {
  it('returns ambiguous for the three real Colaberry rows', async () => {
    mockDb({ byName: { colaberry: COLABERRY } });
    const r = await resolveAccount('Colaberry');
    expect(r.status).toBe('ambiguous');
    if (r.status === 'ambiguous') expect(r.candidates).toHaveLength(3);
  });

  it('does NOT fall back to the biggest candidate', async () => {
    // org-a has 22 members. Member count is a LEARNER-org signal and says nothing about
    // which row is the right commercial account, so "pick the biggest" would be a guess
    // wearing a heuristic's clothes.
    mockDb({ byName: { colaberry: COLABERRY } });
    const r = await resolveAccount('Colaberry');
    expect(JSON.stringify(r)).not.toMatch(/"status":"matched"/);
  });

  it('matches when exactly one organization carries the name', async () => {
    mockDb({ byName: { 'john deere': JOHN_DEERE } });
    const r = await resolveAccount('John Deere');
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.account.id).toBe('org-jd');
  });

  it('returns none for an unknown company, and never queries on an empty name', async () => {
    mockDb({ byName: {} });
    expect((await resolveAccount('Nobody Ltd')).status).toBe('none');
    m.query.mockClear();
    expect((await resolveAccount('   ')).status).toBe('none');
    expect(m.query).not.toHaveBeenCalled();
  });
});

describe('linkLeadToAccount — the twelve leads must stay unlinked', () => {
  it('REFUSES to link a lead whose company is ambiguous, and writes nothing', async () => {
    mockDb({ leadCompany: 'Colaberry', byName: { colaberry: COLABERRY } });
    const r = await linkLeadToAccount(4242);
    expect(r).toMatchObject({ linked: false, reason: 'ambiguous' });
    expect(updates()).toHaveLength(0);
  });

  it('links a lead whose company resolves to exactly one account', async () => {
    mockDb({ leadCompany: 'John Deere', byName: { 'john deere': JOHN_DEERE } });
    const r = await linkLeadToAccount(7);
    expect(r).toEqual({ linked: true, organizationId: 'org-jd' });
    expect(updates()).toHaveLength(1);
  });

  it('writes nothing for a lead with no company and for one with no match', async () => {
    mockDb({ leadCompany: null });
    expect(await linkLeadToAccount(1)).toEqual({ linked: false, reason: 'no_company' });
    mockDb({ leadCompany: 'Nobody Ltd', byName: {} });
    expect(await linkLeadToAccount(2)).toEqual({ linked: false, reason: 'no_match' });
    expect(updates()).toHaveLength(0);
  });
});

describe('backfillLeadOrganizations — the collision is reported, not absorbed', () => {
  const GROUPS = [
    { key: 'colaberry', sample: 'Colaberry', leads: 12 },
    { key: 'john deere', sample: 'John Deere', leads: 3 },
    { key: 'nobody ltd', sample: 'Nobody Ltd', leads: 5 },
  ];
  const BY_NAME = { colaberry: COLABERRY, 'john deere': JOHN_DEERE };

  it('is a dry run by DEFAULT, so an accidental call writes nothing', async () => {
    mockDb({ groups: GROUPS, byName: BY_NAME });
    const r = await backfillLeadOrganizations();
    expect(r.dryRun).toBe(true);
    expect(updates()).toHaveLength(0);
  });

  it('leaves all twelve ambiguous leads unlinked and names the collision', async () => {
    mockDb({ groups: GROUPS, byName: BY_NAME });
    const r = await backfillLeadOrganizations({ dryRun: false });

    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0]).toMatchObject({ company: 'Colaberry', leads: 12 });
    expect(r.ambiguous[0].candidates).toHaveLength(3);

    // Only John Deere's three were linked. The twelve are counted, never written.
    expect(r.linked).toBe(3);
    expect(r.unmatched).toBe(5);
    expect(r.examined).toBe(20);

    const written = updates();
    expect(written).toHaveLength(1);
    expect(JSON.stringify(written[0])).toContain('org-jd');
    expect(JSON.stringify(written)).not.toContain('org-a');
    expect(JSON.stringify(written)).not.toContain('org-b');
    expect(JSON.stringify(written)).not.toContain('org-c');
  });

  it('re-running changes nothing, because the UPDATE is guarded by IS DISTINCT FROM', async () => {
    mockDb({ groups: GROUPS, byName: BY_NAME });
    await backfillLeadOrganizations({ dryRun: false });
    expect(String(updates()[0][0])).toMatch(/IS DISTINCT FROM/);
  });
});

describe('promoteToStrategicAccount — the other way a tenth Colaberry appears', () => {
  it('REFUSES to insert when the name is ambiguous', async () => {
    // Calling INSERT without looking first is how the parallel universe gets built.
    mockDb({ byName: { colaberry: COLABERRY } });
    const r = await promoteToStrategicAccount('Colaberry');
    expect(r).toMatchObject({ promoted: false, reason: 'ambiguous' });
    expect(inserts()).toHaveLength(0);
  });

  it('reuses the existing organization rather than creating a second one', async () => {
    mockDb({ byName: { 'john deere': JOHN_DEERE } });
    const r = await promoteToStrategicAccount('John Deere');
    expect(r).toEqual({ promoted: true, organizationId: 'org-jd', created: false });
    expect(inserts()).toHaveLength(0);
    expect(String(updates()[0][0])).toContain('organization_type');
  });

  it('creates one only when nothing of that name exists', async () => {
    mockDb({ byName: {}, inserted: 'org-fresh' });
    const r = await promoteToStrategicAccount('Totally New Co');
    expect(r).toEqual({ promoted: true, organizationId: 'org-fresh', created: true });
    expect(inserts()).toHaveLength(1);
    expect(String(inserts()[0][0])).toContain('INSERT INTO organizations');
  });

  it('tags the account with the agreed type rather than inventing one', async () => {
    expect(STRATEGIC_ACCOUNT_TYPE).toBe('strategic_account');
    mockDb({ byName: {}, inserted: 'org-fresh' });
    await promoteToStrategicAccount('Totally New Co');
    const [, opts] = inserts()[0] as [string, { replacements: Record<string, unknown> }];
    expect(opts.replacements.t).toBe('strategic_account');
  });
});
