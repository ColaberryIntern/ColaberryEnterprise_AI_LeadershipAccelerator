import { companyAndIndustryNews, headlinesForPrompt, industryHint, keepFetched, newsUrl, searchNews } from '../enterpriseIntakeNews';
import { hoursPerYear, rankByRoi, roiLabel, roiOf } from '../enterpriseIntakeRoi';

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Acme Logistics opens Dallas hub - Freight Weekly</title><link>https://news.example/1</link><guid>1</guid><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item>
<item><title>Old Acme story</title><link>https://news.example/2</link><guid>2</guid><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate></item>
</channel></rss>`;

const ok = (body: string) => ({ ok: true, status: 200, text: async () => body });

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  delete (global as any).fetch;
});

describe('searchNews', () => {
  const now = new Date('2026-11-21T12:00:00Z');

  it('reads the feed, drops items older than 6 months, and dates from the feed', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(ok(RSS));
    const items = await searchNews('"Acme Logistics"', now);
    expect(items).toEqual([{ headline: 'Acme Logistics opens Dallas hub - Freight Weekly', date: '2026-10-01', url: 'https://news.example/1' }]);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(newsUrl('"Acme Logistics"'));
    expect(url.startsWith('https://news.google.com/rss/search?q=')).toBe(true);
    expect(init.signal).toBeDefined();
  });

  it('a timeout or error returns [] (research carries on)', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    expect(await searchNews('x', now)).toEqual([]);
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' });
    expect(await searchNews('x', now)).toEqual([]);
    (global as any).fetch = jest.fn().mockResolvedValue(ok('not xml at all'));
    expect(await searchNews('x', now)).toEqual([]);
  });

  it('an empty query makes no request', async () => {
    (global as any).fetch = jest.fn();
    expect(await searchNews('  ', now)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('industryHint', () => {
  it('prefers the site description, then title, then department', () => {
    expect(industryHint({ description: 'Welcome to Acme, regional freight trucking and warehousing' }, 'Operations')).toBe('acme regional freight trucking warehousing');
    expect(industryHint({ title: 'Acme | Commercial Glass Installers' }, 'Operations')).toBe('acme commercial glass installers');
    expect(industryHint(null, 'Finance')).toBe('finance');
    expect(industryHint(null, 'Company-wide')).toBe('business operations');
  });

  it('searches the company by name and AI in the industry', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(ok(RSS));
    const out = await companyAndIndustryNews('Acme Logistics', null, 'Finance');
    expect(out.industryQuery).toBe('finance artificial intelligence');
    expect((global.fetch as jest.Mock).mock.calls.map((c) => c[0])).toEqual([newsUrl('"Acme Logistics"'), newsUrl('finance artificial intelligence')]);
  });
});

describe('keepFetched', () => {
  const fetched = [{ headline: 'Acme opens Dallas hub', date: '2026-10-01', url: 'u1' }];
  it('keeps exact (case and punctuation insensitive) matches with the feed date and link; drops inventions', () => {
    expect(keepFetched([{ headline: 'ACME opens Dallas hub!', why_it_matters: 'x' }, { headline: 'Acme wins award', why_it_matters: 'y' }], fetched))
      .toEqual([{ headline: 'Acme opens Dallas hub', why_it_matters: 'x', date: '2026-10-01', url: 'u1' }]);
  });
  it('prompt list says none found when empty', () => {
    expect(headlinesForPrompt('COMPANY NEWS', [])).toBe('COMPANY NEWS:\nnone found');
  });
});

describe('ROI', () => {
  it('hours a year from their weekly hours', () => {
    expect(hoursPerYear(20)).toBe(1040);
    expect(hoursPerYear('7.5')).toBe(390);
    expect(hoursPerYear(null)).toBeNull();
    expect(hoursPerYear(0)).toBeNull();
  });

  it('clamps shares to 0-80 and orders low/high', () => {
    expect(roiOf({ title: 'a', share_low: 90, share_high: 10 }, 20)).toEqual({ share_low: 10, share_high: 80, hours_low: 104, hours_high: 832 });
    expect(roiOf({ title: 'b' }, null)).toEqual({ share_low: 0, share_high: 0, hours_low: null, hours_high: null });
  });

  it('ranks by potential hours, highest first; by share when no hours; stable on ties', () => {
    const opts = [{ title: 'small', share_low: 5, share_high: 10 }, { title: 'big', share_low: 30, share_high: 50 }, { title: 'small2', share_low: 5, share_high: 10 }];
    expect(rankByRoi(opts, 20).map((o) => o.title)).toEqual(['big', 'small', 'small2']);
    expect(rankByRoi(opts, null).map((o) => o.title)).toEqual(['big', 'small', 'small2']);
  });

  it('labels plainly', () => {
    expect(roiLabel({ share_low: 30, share_high: 50, hours_low: 312, hours_high: 520 })).toBe('about 312 to 520 hours a year (30-50% of the stated hours)');
    expect(roiLabel({ share_low: 30, share_high: 50, hours_low: null, hours_high: null })).toBe('30-50% of the work (no hours given)');
    expect(roiLabel(null)).toBe('not estimated');
  });
});
