/**
 * The demo directory: three states, and one link that cannot be broken.
 *
 * The property worth testing is NEGATIVE. Any list can show a link; the requirement is that a
 * project with no published demo shows no link at all, because a staff member clicking through to
 * a 404 learns nothing and reports a bug that is not one. So every assertion about `url` here has
 * a partner asserting it is null, and the SQL is read as a string to prove the token is withheld
 * by the DATABASE rather than filtered in TypeScript.
 */
const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import fs from 'fs';
import path from 'path';
import { listDemoLinks, DEMO_DIRECTORY_MAX } from '../demoLinkDirectory';

type Loose = Record<string, unknown>;

const TOKEN = 'demo-token-for-tests-only-not-a-real-secret';

function raw(over: Loose = {}): Loose {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Dispatch console',
    enrollment_id: 'enr-1',
    has_spec: true,
    enabled: true,
    share_token: TOKEN,
    event_count: 7,
    ...over,
  };
}

beforeEach(() => query.mockReset());

describe('the three states', () => {
  it('published: a spec and the flag on, so there is a link', async () => {
    query.mockResolvedValue([raw()]);
    const { rows, counts } = await listDemoLinks();
    expect(rows[0].state).toBe('published');
    expect(rows[0].url).toBe(`/api/public/demo/${TOKEN}`);
    expect(rows[0].event_count).toBe(7);
    expect(counts).toEqual({ published: 1, generated: 0, none: 0 });
  });

  it('generated: a spec, the flag off, and NO link', async () => {
    // The state that would produce a broken link if `url` were built from the token alone.
    query.mockResolvedValue([raw({ enabled: false, share_token: null })]);
    const { rows, counts } = await listDemoLinks();
    expect(rows[0].state).toBe('generated');
    expect(rows[0].url).toBeNull();
    expect(counts).toEqual({ published: 0, generated: 1, none: 0 });
  });

  it('none: no spec at all, and no link', async () => {
    query.mockResolvedValue([raw({ has_spec: false, enabled: false, share_token: null, event_count: 0 })]);
    const { rows, counts } = await listDemoLinks();
    expect(rows[0].state).toBe('none');
    expect(rows[0].url).toBeNull();
    expect(counts).toEqual({ published: 0, generated: 0, none: 1 });
  });

  it('a spec with the flag off is NEVER reported as published, even if a token leaks through', async () => {
    // Defense in depth, asserted. If the query were changed to return the token unconditionally,
    // the shape function still refuses to build a url for an unpublished demo.
    query.mockResolvedValue([raw({ enabled: false, share_token: TOKEN })]);
    const { rows } = await listDemoLinks();
    expect(rows[0].state).toBe('generated');
    expect(rows[0].url).toBeNull();
  });

  it('the flag on with no spec is not publishable either, so it is not published', async () => {
    // The rollback state: `UPDATE projects SET demo_spec = NULL` leaves the row enabled, and the
    // public route 404s it. The directory must agree with the route rather than with the column.
    query.mockResolvedValue([raw({ has_spec: false, enabled: true, share_token: TOKEN })]);
    const { rows } = await listDemoLinks();
    expect(rows[0].state).toBe('none');
    expect(rows[0].url).toBeNull();
  });
});

describe('the query itself', () => {
  it('asks only for live projects, newest first, bounded', async () => {
    query.mockResolvedValue([]);
    await listDemoLinks(50);
    const [sql, opts] = query.mock.calls[0] as [string, { replacements: Loose }];
    expect(sql).toMatch(/archived_at IS NULL/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(sql).toMatch(/LIMIT :limit/);
    // One more than asked, which is how `truncated` is a fact rather than an inference.
    expect(opts.replacements.limit).toBe(51);
  });

  it('withholds an unpublished token in the DATABASE, not in TypeScript', async () => {
    // Read as source, because this is the assertion that cannot be made behaviorally: a mocked
    // query returns whatever the test hands it. What is being pinned is that the real statement
    // never selects a token for a project whose demo is off.
    const src = fs.readFileSync(path.resolve(__dirname, '../demoLinkDirectory.ts'), 'utf8');
    expect(src).toMatch(/CASE WHEN demo_share_enabled IS TRUE THEN demo_share_token ELSE NULL END/);
    // Scoped to the STATEMENT, not the file: the module header discusses the column in prose, and
    // counting prose would make this assertion fail every time somebody explained something.
    const sql = /const SQL = `([\s\S]*?)`;/.exec(src);
    expect(sql).not.toBeNull();
    // The only place the column is selected, so there is no second path for it.
    expect(sql![1].match(/demo_share_token/g)).toHaveLength(1);
  });

  it('guards jsonb_array_length with jsonb_typeof, because the bare call ERRORS on a non-array', async () => {
    // A hand-written spec in a student's repository is exactly where `events` arrives as an object
    // or a string, and `jsonb_array_length` raises rather than returning null.
    const src = fs.readFileSync(path.resolve(__dirname, '../demoLinkDirectory.ts'), 'utf8');
    expect(src).toMatch(/jsonb_typeof\(demo_spec -> 'events'\) = 'array'/);
  });

  it('parameterizes the limit instead of interpolating it', async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../demoLinkDirectory.ts'), 'utf8');
    expect(src).not.toMatch(/LIMIT \$\{/);
    expect(src).toMatch(/replacements: \{ limit:/);
  });
});

describe('bounds and bad input', () => {
  it('caps the limit at the maximum, however large the request', async () => {
    query.mockResolvedValue([]);
    await listDemoLinks(99999);
    expect((query.mock.calls[0][1] as { replacements: Loose }).replacements.limit)
      .toBe(DEMO_DIRECTORY_MAX + 1);
  });

  it('floors a limit below one at one, rather than asking for zero rows or negative rows', async () => {
    query.mockResolvedValue([]);
    for (const bad of [0, -5, 0.4, NaN]) {
      query.mockClear();
      await listDemoLinks(bad);
      expect((query.mock.calls[0][1] as { replacements: Loose }).replacements.limit).toBe(2);
    }
  });

  it('truncates at the cap and SAYS so', async () => {
    // Three rows for a limit of two: the panel must be able to tell the reader the list is partial
    // rather than implying it is the whole estate.
    query.mockResolvedValue([raw({ id: 'a' }), raw({ id: 'b' }), raw({ id: 'c' })]);
    const { rows, truncated } = await listDemoLinks(2);
    expect(rows).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it('does not claim truncation when the page is exactly full', async () => {
    // The other direction. `truncated` inferred from a full page would cry wolf on every exact fit.
    query.mockResolvedValue([raw({ id: 'a' }), raw({ id: 'b' })]);
    const { rows, truncated } = await listDemoLinks(2);
    expect(rows).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it('returns an empty directory rather than failing when there are no projects', async () => {
    query.mockResolvedValue([]);
    const { rows, counts, truncated } = await listDemoLinks();
    expect(rows).toEqual([]);
    expect(counts).toEqual({ published: 0, generated: 0, none: 0 });
    expect(truncated).toBe(false);
  });

  it('coerces a string event_count, because pg returns some numeric types as text', async () => {
    query.mockResolvedValue([raw({ event_count: '12' })]);
    expect((await listDemoLinks()).rows[0].event_count).toBe(12);
  });

  it('reports zero rather than NaN for an unreadable event_count', async () => {
    query.mockResolvedValue([raw({ event_count: null }), raw({ id: 'b', event_count: 'nonsense' })]);
    const { rows } = await listDemoLinks();
    expect(rows[0].event_count).toBe(0);
    expect(rows[1].event_count).toBe(0);
    expect(Number.isNaN(rows[0].event_count)).toBe(false);
  });

  it('tolerates a project with no name and no enrollment without inventing either', async () => {
    query.mockResolvedValue([raw({ name: null, enrollment_id: null })]);
    const { rows } = await listDemoLinks();
    expect(rows[0].name).toBeNull();
    expect(rows[0].enrollment_id).toBeNull();
  });

  it('lets a database failure surface, so the route can log it rather than show an empty estate', async () => {
    // Failing soft here would be wrong: an empty list and a broken database look identical to a
    // reader, and "no demos exist" is a conclusion somebody would act on.
    query.mockRejectedValue(new Error('connection terminated unexpectedly'));
    await expect(listDemoLinks()).rejects.toThrow('connection terminated unexpectedly');
  });
});

describe('counts mean something', () => {
  it('counts each state across a mixed estate, summing to the row count', async () => {
    query.mockResolvedValue([
      raw({ id: 'a' }),
      raw({ id: 'b' }),
      raw({ id: 'c', enabled: false, share_token: null }),
      raw({ id: 'd', has_spec: false, enabled: false, share_token: null }),
      raw({ id: 'e', has_spec: false, enabled: false, share_token: null }),
      raw({ id: 'f', has_spec: false, enabled: false, share_token: null }),
    ]);
    const { rows, counts } = await listDemoLinks();
    expect(counts).toEqual({ published: 2, generated: 1, none: 3 });
    expect(counts.published + counts.generated + counts.none).toBe(rows.length);
    // Exactly the published ones carry a link, asserted as a set rather than one row at a time.
    expect(rows.filter((r) => r.url !== null).map((r) => r.project_id)).toEqual(['a', 'b']);
  });
});
