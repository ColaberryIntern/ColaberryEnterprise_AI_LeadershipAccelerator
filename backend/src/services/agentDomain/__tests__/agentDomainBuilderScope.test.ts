/**
 * AF8.3 — My Domain must show an intern the domain they BUILD, and must refuse to guess.
 *
 * ## The gap this closes
 *
 * All six granted interns opened My Domain on 17 Oct 2026 and got `resolved_identities=0,
 * domains=0`: a page that loads and says nothing. `loadProvisionedDomainsForOwner` scopes by
 * accountable MANAGER, which is right for a manager and useless for an intern — they are
 * recorded as `intended_builder`, a plain text name with no foreign key. AF2.4 recorded that
 * limit when the resolver was written.
 *
 * ## Why the ambiguity guard is the point, not the match
 *
 * AF2.6 was a whole ticket spent on a name resolving to the wrong record, and its lesson was to
 * follow a foreign key. There is no foreign key here, so the guard carries the weight: a caller
 * whose email maps to more than one `community_members` row gets NOTHING, because at that point
 * the platform cannot say who they are and guessing is how one intern sees another's domain.
 *
 * These tests drive a fake `sequelize.query` rather than a database. That is a real limit and
 * worth stating: they prove the DECISIONS (how many rows, which branch, what is refused), not
 * that the SQL is valid. The SQL was exercised separately against production.
 */
import {
  loadProvisionedDomainsForBuilder,
  loadMyDomains,
} from '../agentDomainProvisionedReader';

type Call = { sql: string; bind: unknown[] };

/**
 * A fake that answers by inspecting the SQL it is handed, so each test states only what it
 * cares about. `calls` is kept so a test can assert what was ASKED, not just what came back.
 */
function fakeSequelize(opts: {
  names?: Array<{ display_name: string }>;
  builderRows?: Array<Record<string, unknown>>;
  ownerRows?: Array<Record<string, unknown>>;
}) {
  const calls: Call[] = [];
  const query = jest.fn(async (sql: string, o: any) => {
    calls.push({ sql, bind: (o && o.bind) || [] });
    // Dispatch on the WHERE clause, not on any mention of a column.
    //
    // The first version of this fake tested `includes('intended_builder')` before
    // `includes('manager_identity_id')`, and the owner query matched it — because BASE_SQL
    // SELECTS intended_builder for every row, so both queries contain the string. The owner
    // branch silently returned the builder's rows and one test failed for a reason that had
    // nothing to do with the code under test. A fake that answers the wrong question is worse
    // than no fake: it fails confusingly, and it can just as easily pass confusingly.
    if (sql.includes('cm.display_name')) return opts.names ?? [];
    if (sql.includes('adp.manager_identity_id = ANY')) return opts.ownerRows ?? [];
    if (sql.includes('lower(btrim(adp.intended_builder))')) return opts.builderRows ?? [];
    throw new Error(`fake sequelize got an unrecognised query:\n${sql.slice(0, 200)}`);
  });
  return { sequelize: { query } as any, calls, query };
}

const DOMAIN = (key: string, extra: Record<string, unknown> = {}) => ({
  domain_key: key, stories: 50, stories_verified: 0, build_authorizations: 0, ...extra,
});

describe('AF8.3 builder scoping resolves an intern to their own domain', () => {
  it('returns the domain whose intended_builder is the caller', async () => {
    const { sequelize } = fakeSequelize({
      names: [{ display_name: 'Sarbjit Kaur' }],
      builderRows: [DOMAIN('marketing')],
    });
    const rows = await loadProvisionedDomainsForBuilder(sequelize, 'sarbjitsaini83@yahoo.com');
    expect(rows.map((r) => r.domain_key)).toEqual(['marketing']);
  });

  it('matches the NAME the platform holds, not anything the caller supplied', async () => {
    // The email goes in; the name used in the comparison comes out of community_members. A
    // caller cannot ask to be someone else by sending a different name.
    const { sequelize, calls } = fakeSequelize({
      names: [{ display_name: 'Mihret Netsereab' }],
      builderRows: [DOMAIN('product_experience')],
    });
    await loadProvisionedDomainsForBuilder(sequelize, 'mihretnetsereab@gmail.com');
    const builderCall = calls.find((c) => c.sql.includes('intended_builder'))!;
    expect(builderCall.bind).toEqual(['Mihret Netsereab']);
  });

  it('tolerates case and surrounding whitespace on both sides', async () => {
    const { sequelize, calls } = fakeSequelize({ names: [{ display_name: 'Tashima Diah' }] });
    await loadProvisionedDomainsForBuilder(sequelize, '  TASH.DIAH@GMAIL.COM ');
    const nameCall = calls[0];
    expect(nameCall.bind[0]).toBe('TASH.DIAH@GMAIL.COM');     // trimmed before binding
    expect(nameCall.sql).toMatch(/lower\(e\.email\) = lower\(\$1\)/);
    expect(calls[1].sql).toMatch(/lower\(btrim\(adp\.intended_builder\)\) = lower\(btrim\(\$1\)\)/);
  });
});

describe('AF8.3 builder scoping refuses rather than guesses', () => {
  it('returns NOTHING when the email maps to two community rows', async () => {
    // The AF2.6 failure mode, closed. Two rows means the platform cannot say who this is, and
    // picking one is how an intern sees somebody else's domain.
    const { sequelize, query } = fakeSequelize({
      names: [{ display_name: 'Sarbjit Kaur' }, { display_name: 'Sarbjit K' }],
      builderRows: [DOMAIN('marketing')],
    });
    const rows = await loadProvisionedDomainsForBuilder(sequelize, 'ambiguous@example.com');
    expect(rows).toEqual([]);
    // And it must not even ASK the second question — an ambiguous caller gets no lookup at all.
    expect(query.mock.calls.some(([sql]: any[]) => String(sql).includes('intended_builder')))
      .toBe(false);
  });

  it('returns NOTHING when the email maps to no community row', async () => {
    const { sequelize } = fakeSequelize({ names: [], builderRows: [DOMAIN('marketing')] });
    expect(await loadProvisionedDomainsForBuilder(sequelize, 'nobody@example.com')).toEqual([]);
  });

  it.each(['', '   ', null, undefined])('returns NOTHING for a blank email (%p)', async (email) => {
    const { sequelize, query } = fakeSequelize({ builderRows: [DOMAIN('marketing')] });
    expect(await loadProvisionedDomainsForBuilder(sequelize, email as any)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('AF8.3 My Domain combines the two relationships without doubling anything', () => {
  it('shows managed and built together', async () => {
    const { sequelize } = fakeSequelize({
      names: [{ display_name: 'Someone Both' }],
      ownerRows: [DOMAIN('curriculum', { manager_identity_id: 'id-1' })],
      builderRows: [DOMAIN('marketing')],
    });
    const rows = await loadMyDomains(sequelize, 'both@example.com', ['id-1']);
    expect(rows.map((r) => r.domain_key)).toEqual(['curriculum', 'marketing']);
  });

  it('de-duplicates a domain the caller both manages and builds', async () => {
    // A domain appearing twice reads as a data error rather than as two true facts.
    const { sequelize } = fakeSequelize({
      names: [{ display_name: 'Someone Both' }],
      ownerRows: [DOMAIN('marketing', { manager_identity_id: 'id-1' })],
      builderRows: [DOMAIN('marketing')],
    });
    const rows = await loadMyDomains(sequelize, 'both@example.com', ['id-1']);
    expect(rows.map((r) => r.domain_key)).toEqual(['marketing']);
  });

  it('an intern who manages nothing still sees what they build', async () => {
    // The exact case that returned an empty page to all six.
    const { sequelize } = fakeSequelize({
      names: [{ display_name: 'Quincy Nkwain Ninying' }],
      ownerRows: [],
      builderRows: [DOMAIN('platform')],
    });
    const rows = await loadMyDomains(sequelize, 'qninying@gmail.com', []);
    expect(rows.map((r) => r.domain_key)).toEqual(['platform']);
  });

  it('someone who is neither still gets an empty list, never everything', async () => {
    const { sequelize } = fakeSequelize({ names: [{ display_name: 'Nobody' }] });
    expect(await loadMyDomains(sequelize, 'nobody@example.com', [])).toEqual([]);
  });
});
