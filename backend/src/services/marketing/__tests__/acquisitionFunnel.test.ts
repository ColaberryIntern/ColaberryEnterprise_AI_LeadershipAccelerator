const landingPageTraffic = jest.fn();
const query = jest.fn();

jest.mock('../landingPageTraffic', () => ({ landingPageTraffic: (...a: unknown[]) => landingPageTraffic(...a) }));
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import { acquisitionFunnel } from '../acquisitionFunnel';

/**
 * The funnel's job is to be believed, so most of these tests are about honesty rather than arithmetic.
 *
 * The figures involved are close enough to be confused: the live page measured 38 page loads from
 * 16 visitors across 24 sessions - three true numbers for one page. A dashboard that stacks those
 * without saying which is which invites somebody to quote the flattering one in a board meeting.
 */

const page = (over: Record<string, unknown> = {}) => ({
  slug: 'ai-learning-platform', brand_slug: 'colaberry-training', status: 'published',
  site_slug: 'training', visitors: 16, sessions: 24, views: 38, ad_clicks: 12,
  utm_tagged: 12, identified_leads: 2, cta_clicks: 8, cta_clickers: 4, engaged_visitors: 9,
  first_seen: null, last_seen: null, ...over,
});

/** `downstream` runs first, then `byCampaign`. */
function mockQueries(down: Record<string, string>, campaigns: unknown[] = []) {
  query.mockReset();
  query.mockResolvedValueOnce([down]).mockResolvedValueOnce(campaigns);
}

beforeEach(() => { landingPageTraffic.mockReset(); query.mockReset(); });

describe('the stages', () => {
  it('reports people and sessions separately, and says which is which', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '109', accounts: '109', in_crm: '108', returned: '5' });

    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s]));

    // The ONE stage that is not people. Conflating it would overstate reach.
    expect(byKey.ad_clicks.unit).toBe('sessions');
    expect(byKey.visitors.unit).toBe('people');
    expect(byKey.signups.unit).toBe('people');
    funnel.stages.filter((s) => s.key !== 'ad_clicks').forEach((s) => expect(s.unit).toBe('people'));
  });

  it('carries the real downstream counts through, not the traffic ones', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '109', accounts: '108', in_crm: '107', returned: '5' });

    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(byKey.signups).toBe(109);
    expect(byKey.accounts).toBe(108);
    expect(byKey.in_crm).toBe(107);
    expect(byKey.returned).toBe(5);
  });

  it('sums traffic across pages rather than showing one', async () => {
    landingPageTraffic.mockResolvedValue([
      page({ visitors: 16, cta_clickers: 4 }),
      page({ slug: 'second', visitors: 10, cta_clickers: 1 }),
    ]);
    mockQueries({ signups: '0', accounts: '0', in_crm: '0', returned: '0' });

    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(byKey.visitors).toBe(26);
    expect(byKey.cta).toBe(5);
  });

  it('every stage explains what it does not mean', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '1', accounts: '1', in_crm: '1', returned: '0' });

    const funnel = await acquisitionFunnel(30);
    funnel.stages.forEach((s) => expect(s.note.length).toBeGreaterThan(10));
  });
});

/**
 * The permission gate. Measured 2026-10-29: 957 ad sessions, 314 signups, 313 in the CRM,
 * 6 returned - and only 73 of 423 leads in the window had ticked consent. The page showed the
 * collapse from 313 to 6 and offered no reason for it, when most of the gap is people nobody
 * has permission to contact. These tests hold that reason on the page.
 */
describe('the permission gate', () => {
  it('reports who we are allowed to email', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '314', accounts: '313', in_crm: '313', opted_in: '59', returned: '6' });
    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(byKey.opted_in).toBe(59);
  });

  it('sits where the narrowing happens, after the CRM and before the return', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '314', accounts: '313', in_crm: '313', opted_in: '59', returned: '6' });
    const funnel = await acquisitionFunnel(30);
    const keys = funnel.stages.map((s) => s.key);
    expect(keys.indexOf('opted_in')).toBeGreaterThan(keys.indexOf('in_crm'));
    expect(keys.indexOf('opted_in')).toBeLessThan(keys.indexOf('returned'));
  });

  it('is not derived from the stage above it', async () => {
    // Independently measured like every other stage, so a consent count ABOVE the CRM count
    // survives rather than being clamped. Someone can tick the box and fail to sync.
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '10', accounts: '4', in_crm: '4', opted_in: '7', returned: '1' });
    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(byKey.opted_in).toBe(7);
  });

  it('reads an absent consent count as zero rather than dropping the stage', async () => {
    // A server that answers without the field must still render the gate, because a missing
    // stage reads as "no gate here" and that is the exact misreading this change removes.
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '10', accounts: '4', in_crm: '4', returned: '1' });
    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(byKey.opted_in).toBe(0);
  });
});

describe('a later stage may exceed an earlier one', () => {
  it('does not clamp signups down to visitors', async () => {
    // The real case: a page with no tracker produces zero visitors and real signups. Clamping
    // would hide the measurement gap, which is the one thing this panel exists to surface.
    landingPageTraffic.mockResolvedValue([page({ visitors: 0, site_slug: null, engaged_visitors: 0, cta_clickers: 0, ad_clicks: 0 })]);
    mockQueries({ signups: '40', accounts: '40', in_crm: '0', returned: '0' });

    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(byKey.visitors).toBe(0);
    expect(byKey.signups).toBe(40);
  });
});

describe('pages that cannot be measured', () => {
  it('names them instead of reporting their zeros as performance', async () => {
    landingPageTraffic.mockResolvedValue([
      page(),
      page({ slug: 'untracked-one', site_slug: null }),
      page({ slug: 'untracked-two', site_slug: null, brand_slug: null }),
    ]);
    mockQueries({ signups: '0', accounts: '0', in_crm: '0', returned: '0' });

    const funnel = await acquisitionFunnel(30);
    expect(funnel.untrackedPages).toEqual([
      'colaberry-training/untracked-one',
      'no brand/untracked-two',
    ]);
  });

  it('reports none when every page carries a tracker', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '1', accounts: '1', in_crm: '1', returned: '0' });
    expect((await acquisitionFunnel(30)).untrackedPages).toEqual([]);
  });
});

describe('nothing recorded', () => {
  it('says empty rather than drawing a funnel of zeros', async () => {
    landingPageTraffic.mockResolvedValue([]);
    mockQueries({ signups: '0', accounts: '0', in_crm: '0', returned: '0' });

    const funnel = await acquisitionFunnel(30);
    expect(funnel.empty).toBe(true);
    expect(funnel.stages.every((s) => s.count === 0)).toBe(true);
  });

  it('is NOT empty when a single stage has one person', async () => {
    landingPageTraffic.mockResolvedValue([]);
    mockQueries({ signups: '1', accounts: '0', in_crm: '0', returned: '0' });
    expect((await acquisitionFunnel(30)).empty).toBe(false);
  });

  it('survives a downstream query that returns no row at all', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    query.mockReset();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const funnel = await acquisitionFunnel(30);
    const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(byKey.signups).toBe(0);
    expect(byKey.visitors).toBe(16);
  });
});

describe('the window', () => {
  it('passes the day count to both the traffic and the downstream queries', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '0', accounts: '0', in_crm: '0', returned: '0' });

    const funnel = await acquisitionFunnel(7);
    expect(funnel.windowDays).toBe(7);
    expect(landingPageTraffic).toHaveBeenCalledWith(7);
    expect(query.mock.calls[0][1].replacements.days).toBe('7');
  });
});

/**
 * The SQL form, because mocking `sequelize.query` means no test above can see the SQL at all.
 *
 * This shipped to production broken. `l.source = ANY(:sources)` looks right and is right in
 * hand-written SQL, but Sequelize expands a replacement ARRAY into a comma-separated list, so
 * Postgres receives `ANY('a','b','c')` and answers "syntax error at or near ,". The endpoint
 * 500'd. Proved against the live database afterwards, both directions: ANY errors, IN returns
 * 271 rows.
 *
 * A mocked query cannot catch a syntax error, so this asserts the one property that distinguishes
 * the working form from the broken one. It is a guard against regression, NOT a substitute for
 * running the query - which is the actual lesson here.
 */
describe('the array is interpolated in a form Postgres accepts', () => {
  it('uses IN (:sources), never = ANY(:sources)', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '1', accounts: '1', in_crm: '1', returned: '0' });

    await acquisitionFunnel(30);

    const statements = query.mock.calls.map((c) => String(c[0]));
    expect(statements.length).toBeGreaterThanOrEqual(2);
    statements.forEach((sql) => {
      expect(sql).not.toMatch(/=\s*ANY\s*\(\s*:sources\s*\)/);
      expect(sql).toMatch(/IN\s*\(\s*:sources\s*\)/);
    });
  });

  it('passes the sources as an array, which is why the form matters', async () => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '1', accounts: '1', in_crm: '1', returned: '0' });

    await acquisitionFunnel(30);
    expect(Array.isArray(query.mock.calls[0][1].replacements.sources)).toBe(true);
  });
});

/**
 * ADS-7: one campaign must read as ONE row, because the split was invisible as data.
 *
 * `leads.utm_source` holds two shapes for the same traffic. Measured in production:
 * fb 315, ig 131, fb|paid 43, ig|paid 30. Grouping that column raw returned Facebook
 * TWICE - once as "Facebook" and once as the literal `fb|paid` - with each half's
 * CRM-sync and opt-in rate computed separately, and the donut drawing two slices whose
 * percentages were both wrong. The centre total stayed correct, which is exactly what
 * made it read as data rather than as a bug.
 *
 * It matters for `LIMIT 20` too: duplicate halves consume slots, so grouping raw can
 * push a genuinely distinct campaign off the bottom of a top-20 list.
 *
 * ── WHY THESE ASSERT SQL AND NOT A COLLAPSED ROW ────────────────────────────────────
 * The canonicalisation happens IN the statement, so a mocked `sequelize.query` can never
 * exercise the collapse - whatever the mock returns is returned. The one property a unit
 * test can hold is that the statement still canonicalises in BOTH clauses, which is the
 * difference between the fixed form and the defect.
 *
 * Same posture as the IN/ANY block above, and the same caveat: a guard against
 * regression, NOT a substitute for running the query. The collapse itself was verified
 * against production on 2026-11-11 - the campaigns read returned 3 rows with 3 distinct
 * sources (`fb`, `ig`, and untagged) and no piped shape surviving, while the raw column
 * still held fb|paid 43 and ig|paid 30.
 *
 * Added because this suite had NO coverage of the canonicalisation at all: the fix could
 * be reverted in acquisitionFunnel.ts and every test here would stay green, which is the
 * definition of a contract too weak to be worth having.
 */
describe('one campaign reads as one row (ADS-7)', () => {
  /** Runs the funnel and returns the campaigns statement. `downstream` is issued first. */
  const campaignSql = async (): Promise<string> => {
    landingPageTraffic.mockResolvedValue([page()]);
    mockQueries({ signups: '1', accounts: '1', in_crm: '1', returned: '0' });
    await acquisitionFunnel(30);
    return String(query.mock.calls[1][0]);
  };

  /** Everything from GROUP BY up to ORDER BY - the clause the defect lived in. */
  const groupByClause = (sql: string): string => (sql.match(/GROUP BY[\s\S]*?(?=ORDER BY)/) || [''])[0];

  it('canonicalises utm_source in the SELECT, so the row is labelled by the canonical source', async () => {
    expect(await campaignSql())
      .toMatch(/lower\(btrim\(split_part\(l\.utm_source,\s*'\|',\s*1\)\)\)\s+AS\s+utm_source/);
  });

  it('and in the GROUP BY, which is where the split actually happened', async () => {
    // The SELECT alone would not merge anything: grouping is what makes two halves one row.
    expect(groupByClause(await campaignSql()))
      .toMatch(/lower\(btrim\(split_part\(l\.utm_source,\s*'\|',\s*1\)\)\)/);
  });

  it('never groups by the RAW column, which is the defect itself', async () => {
    // Anchored immediately after GROUP BY: the raw column legitimately appears INSIDE the
    // canonicalising expression, so a bare substring check would pass either way.
    expect(groupByClause(await campaignSql())).not.toMatch(/GROUP BY\s+l\.utm_source\b/);
  });

  it('still groups by campaign as well, so the fix did not flatten distinct campaigns together', async () => {
    expect(groupByClause(await campaignSql())).toMatch(/l\.utm_campaign/);
  });

  it('CONTROL: the campaigns statement really was captured, so none of the above is vacuous', async () => {
    const sql = await campaignSql();
    expect(sql).toMatch(/FROM\s+leads/);
    expect(sql).toMatch(/LIMIT 20/);
    expect(sql.length).toBeGreaterThan(200);
  });

  it('CONTROL: a pattern that must NOT match, proving these regexes can fail', async () => {
    // Without this, a typo in the expressions above could make every assertion match
    // nothing and still pass as a `not.toMatch`.
    expect(await campaignSql()).not.toMatch(/split_part\(l\.utm_campaign/);
  });
});
