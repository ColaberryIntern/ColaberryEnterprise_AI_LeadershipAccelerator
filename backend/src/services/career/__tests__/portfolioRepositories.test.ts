/**
 * portfolioRepositories - the rule that decides which repositories a public page NAMES.
 *
 * The first test here is the regression test for a defect that was live in production: the
 * projection read key names the profile does not emit, so every repository was counted as
 * private and none was named. It uses the exact row shape captured from production on
 * 2026-10-17 rather than a tidied-up fixture, because a tidied-up fixture is what let the
 * bug survive in the first place.
 */
import { buildRepositories } from '../portfolioRepositories';

/** Copied verbatim from `getCareerProfile` output on production, 2026-10-17. */
const PROD_SHAPE = [
  { repo_url: 'https://github.com/qninying/HosPulse', repo_owner: 'qninying', repo_name: 'HosPulse', language: 'md', file_count: 228, last_sync_at: '2026-10-17T06:17:23.503Z' },
  { repo_url: 'https://github.com/qninying/relay', repo_owner: 'qninying', repo_name: 'relay', language: 'TypeScript', file_count: 91, last_sync_at: '2026-10-17T06:17:41.243Z' },
  { repo_url: 'https://github.com/qninying/ambit', repo_owner: 'qninying', repo_name: 'ambit', language: 'TypeScript', file_count: 147, last_sync_at: '2026-10-17T12:17:40.182Z' },
  { repo_url: 'https://github.com/qninying/ai-operations-center', repo_owner: 'qninying', repo_name: 'ai-operations-center', language: 'TypeScript', file_count: 369, last_sync_at: '2026-10-17T06:17:38.945Z' },
];

const all = (rows: any[]) => new Set<string>(rows.map((r) => r.repo_url));

describe('the production shape, which the old code could not read', () => {
  it('names the repositories instead of counting all four as private', () => {
    // THE DEFECT: live payload for quincy-nkwain-ninying was repositories: [] with
    // private_repository_count: 4, for four repositories that are public and syncing.
    const out = buildRepositories(PROD_SHAPE, all(PROD_SHAPE));
    expect(out.repositories.map((r) => r.name)).toEqual([
      'HosPulse', 'relay', 'ambit', 'ai-operations-center',
    ]);
    expect(out.privateCount).toBe(0);
  });

  it('still reads the older html_url / name shape, so nothing that worked stops working', () => {
    const rows = [{ name: 'portfolio', html_url: 'https://github.com/x/portfolio' }];
    const out = buildRepositories(rows, all([{ repo_url: 'https://github.com/x/portfolio' }]));
    expect(out.repositories).toEqual([{ name: 'portfolio', url: 'https://github.com/x/portfolio' }]);
  });
});

describe('the reachability gate', () => {
  it('counts, and does NOT name, a repository a stranger cannot open', () => {
    // baidhani/HomeHub: 404 at the commit and at the repository root, probed 2026-10-17.
    const rows = [
      { repo_url: 'https://github.com/baidhani/Sifra', repo_name: 'Sifra' },
      { repo_url: 'https://github.com/baidhani/HomeHub', repo_name: 'HomeHub' },
    ];
    const out = buildRepositories(rows, new Set(['https://github.com/baidhani/Sifra']));
    expect(out.repositories).toEqual([
      { name: 'Sifra', url: 'https://github.com/baidhani/Sifra' },
    ]);
    expect(out.privateCount).toBe(1);
    // The NAME of an unreachable repository is itself a disclosure and must not appear.
    expect(JSON.stringify(out)).not.toContain('HomeHub');
  });

  it('names nothing at all when the set is empty, rather than falling back to naming all', () => {
    // The page service hands over an empty set when GitHub could not be reached. Failing
    // open here would publish private repository names on a GitHub outage.
    const out = buildRepositories(PROD_SHAPE, new Set<string>());
    expect(out.repositories).toEqual([]);
    expect(out.privateCount).toBe(4);
  });

  it('ignores the stored flags entirely once a measured set is supplied', () => {
    // The stored flag is the thing that could not be trusted; a row claiming to be public
    // does not get named on its own say-so.
    const rows = [{ repo_url: 'https://github.com/a/b', repo_name: 'b', private: false }];
    expect(buildRepositories(rows, new Set<string>()).repositories).toEqual([]);
  });

  it('matches a stored .git suffix or trailing slash against the normalized set', () => {
    const rows = [
      { repo_url: 'https://github.com/a/b.git', repo_name: 'b' },
      { repo_url: 'https://github.com/a/c/', repo_name: 'c' },
    ];
    const out = buildRepositories(rows, new Set([
      'https://github.com/a/b', 'https://github.com/a/c',
    ]));
    expect(out.repositories.map((r) => r.name)).toEqual(['b', 'c']);
  });
});

describe('without a measured set, the old stored-flag rule still applies', () => {
  it('names a public row and counts a private one', () => {
    const rows = [
      { name: 'portfolio', html_url: 'https://github.com/x/portfolio', private: false },
      { name: 'secret', html_url: 'https://github.com/x/secret', private: true },
    ];
    const out = buildRepositories(rows);
    expect(out.repositories).toEqual([
      { name: 'portfolio', url: 'https://github.com/x/portfolio' },
    ]);
    expect(out.privateCount).toBe(1);
  });
});

describe('junk', () => {
  it('counts a row with no usable URL rather than dropping it silently', () => {
    // The work exists; we just cannot point at it. Saying nothing would understate.
    const out = buildRepositories([{ repo_name: 'x' }, null, 'nonsense', 7], new Set());
    expect(out.repositories).toEqual([]);
    expect(out.privateCount).toBe(1);
  });

  it('refuses a non-http URL as a URL', () => {
    const rows = [{ repo_url: 'javascript:alert(1)', repo_name: 'x' }];
    expect(buildRepositories(rows, new Set()).repositories).toEqual([]);
  });

  it('survives a non-array', () => {
    for (const bad of [null, undefined, 'x', 42, {}]) {
      expect(buildRepositories(bad as never)).toEqual({ repositories: [], privateCount: 0 });
    }
  });

  it('counts one repository once when two connection rows carry it', () => {
    const rows = [
      { repo_url: 'https://github.com/a/b', repo_name: 'b' },
      { repo_url: 'https://github.com/a/b', repo_name: 'b' },
    ];
    const out = buildRepositories(rows, new Set(['https://github.com/a/b']));
    expect(out.repositories).toHaveLength(1);
    expect(out.privateCount).toBe(0);
  });

  it('falls back to a neutral name rather than printing undefined', () => {
    const rows = [{ repo_url: 'https://github.com/a/b' }];
    expect(buildRepositories(rows, new Set(['https://github.com/a/b'])).repositories)
      .toEqual([{ name: 'repository', url: 'https://github.com/a/b' }]);
  });
});
