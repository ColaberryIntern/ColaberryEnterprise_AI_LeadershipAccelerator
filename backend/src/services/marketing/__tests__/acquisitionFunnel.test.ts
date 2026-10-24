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
