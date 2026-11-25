import { sequelize } from '../../../../config/database';
import { WeeklyLiveSignal } from '../../../../models/WeeklyLive';
import { readPage, toYmd } from '../pageDate';
import { fetchPage } from '../pageFetch';
import { parseCandidates, searchCost, SEARCH_RESERVE_USD, type Candidate } from '../signalSearch';
import { runSignals, sameStory, selectSignals, vet, namesAStory, shiftDays, urlKey, windowStart, MAX_SIGNALS, type SignalRow } from '../signalsJob';
import { BudgetExceeded, capFrom, reserve, withBudget } from '../researchBudget';

/** WL3.1: dates come from the page, failed pages are dropped with a reason, reruns replace, the cap holds. */
const cand = (over: Partial<Candidate> = {}): Candidate => ({ headline: 'Search headline here', publisher: 'P', url: 'https://a.com/x', alternate_url: null, factors: [1, 5], fits_weeks: [3], idea: 'A plain hook', ...over });
const page = (html: string) => async (url: string) => ({ ok: true as const, url, html });
const ld = (d: string) => `<html><head><meta property="og:title" content="Page title"><script type="application/ld+json">{"@graph":[{"datePublished":"${d}"}]}</script></head></html>`;
const FROM = '2026-11-10'; const TODAY = '2026-11-24';
const mockTx = () => jest.spyOn(sequelize, 'transaction').mockImplementation((async (cb: (t: unknown) => unknown) => cb('tx')) as never);
afterEach(() => jest.restoreAllMocks());

describe('page dates', () => {
  it('reads JSON-LD, meta, time and byline, in that order', () => {
    expect(readPage(ld('2026-11-18T23:30:00-05:00'))).toEqual({ title: 'Page title', site: null, date: '2026-11-18', dateSource: 'json-ld' });
    expect(readPage('<meta property="article:published_time" content="2026-11-12T01:00:00Z">').dateSource).toBe('meta');
    expect(readPage('<article><time datetime="2026-11-09">x</time></article>').date).toBe('2026-11-09');
    expect(readPage('<div class="byline">By Ana, Nov. 4, 2026</div>')).toMatchObject({ date: '2026-11-04', dateSource: 'byline' });
  });
  it('a page with no date, or broken JSON-LD, is null and never guessed', () => {
    expect(readPage('<script type="application/ld+json">{oops</script><p>Updated recently</p>').date).toBeNull();
    expect(toYmd('2026-02-30')).toBeNull();
    expect(toYmd('18 November 2026')).toBe('2026-11-18');
  });
});

describe('vet', () => {
  it('stores the page title and the page date', async () => {
    expect(await vet(cand(), FROM, TODAY, page(ld('2026-11-18')))).toMatchObject({ headline: 'Page title', published_at: '2026-11-18', date_confirmed: true, fetched_ok: true, dropped_reason: null });
  });
  it('no date on the page is kept as date unconfirmed', async () => {
    expect(await vet(cand({ url: 'https://a.com/canva-cuts-staff' }), FROM, TODAY, page('<title>T</title>'))).toMatchObject({ published_at: null, date_confirmed: false, fetched_ok: true, dropped_reason: null });
  });
  it('a home or index page with no date is dropped', async () => {
    expect((await vet(cand({ url: 'https://a.com/' }), FROM, TODAY, page('<title>Front Page</title>'))).dropped_reason).toContain('index page');
    expect([namesAStory('https://a.com/en/news/'), namesAStory('https://a.com/n/ai-jobs-report'), namesAStory('https://a.com/article/4120784')]).toEqual([false, true, true]);
  });
  it('403 then the alternate outlet', async () => {
    const f = jest.fn().mockResolvedValueOnce({ ok: false, url: '', reason: 'HTTP 403' }).mockResolvedValueOnce({ ok: true, url: 'https://b.com/y', html: ld('2026-11-18') });
    expect(await vet(cand({ alternate_url: 'https://b.com/y' }), FROM, TODAY, f)).toMatchObject({ url: 'https://b.com/y', publisher: 'b.com', fetched_ok: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('both outlets failing is dropped with both reasons', async () => {
    const f = jest.fn().mockResolvedValueOnce({ ok: false, url: '', reason: 'HTTP 403' }).mockResolvedValueOnce({ ok: false, url: '', reason: 'timeout' });
    expect((await vet(cand({ alternate_url: 'https://b.com/y' }), FROM, TODAY, f)).dropped_reason).toBe('HTTP 403; alternate timeout');
  });
  it('too old is dropped, except for an event factor; a future date is dropped', async () => {
    expect((await vet(cand(), FROM, TODAY, page(ld('2026-05-14')))).dropped_reason).toContain('before 2026-11-10');
    expect((await vet(cand({ factors: [8] }), FROM, TODAY, page(ld('2026-05-14')))).dropped_reason).toBeNull();
    expect((await vet(cand(), FROM, TODAY, page(ld('2026-12-25')))).dropped_reason).toContain('future');
    expect((await vet(cand({ factors: [4] }), FROM, TODAY, page(ld('2024-01-01')))).dropped_reason).toContain('published 2024-01-01');
  });
  it('names the outlet the page says it is', async () => {
    const html = `<meta property="og:site_name" content="CNBC">${ld('2026-11-18')}`;
    expect((await vet(cand({ publisher: 'Reuters' }), FROM, TODAY, page(html))).publisher).toBe('CNBC');
  });
  it('a UTC evening stamp is the Central day, a bare midnight keeps its day', async () => {
    expect(toYmd('2026-11-25T01:00:00Z')).toBe('2026-11-24');
    expect(toYmd('2026-11-18T00:00:00Z')).toBe('2026-11-18');
    expect((await vet(cand(), FROM, TODAY, page(ld('2026-11-25T01:00:00Z')))).dropped_reason).toBeNull();
  });
  it('a hook idea that breaks a content rule is removed, the signal stays', async () => {
    expect(await vet(cand({ idea: 'Get it at no cost' }), FROM, TODAY, page(ld('2026-11-18')))).toMatchObject({ idea: null, dropped_reason: null });
  });
});

it('refuses private, local and non-web addresses before any request', async () => {
  for (const u of ['http://127.0.0.1/x', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'https://localhost/', 'http://[::1]/', 'https://u:p@a.com/']) {
    expect(await fetchPage(u)).toEqual({ ok: false, url: u, reason: 'not a public web address' });
  }
});

const row = (headline: string, url: string): SignalRow => ({ headline, url, publisher: null, factors: [1], fits_weeks: [], idea: null, published_at: '2026-11-18', date_confirmed: true, fetched_ok: true, dropped_reason: null });

it('the same story from two outlets is kept once, and the same page is one row', () => {
  expect(sameStory('Canva cuts 22% of staff in restructure', 'Canva restructure cuts 22% of its staff')).toBe(true);
  expect(sameStory('Canva cuts staff', 'Disney opens Hexed')).toBe(false);
  const out = selectSignals([row('Canva cuts 22% of staff in restructure', 'https://a.com/1'), row('Canva restructure cuts 22% of its staff', 'https://b.com/2'), row('Other', 'https://www.a.com/1/?utm_source=1')]);
  expect(out).toHaveLength(2);
  expect(out[1].dropped_reason).toContain('same story');
});

it('keeps at most 18 and says why the rest were dropped', () => {
  const out = selectSignals(Array.from({ length: 21 }, (_, i) => row(`unique${i} alpha${i} beta${i}`, `https://a.com/${i}`)));
  expect(out.filter((x) => !x.dropped_reason)).toHaveLength(MAX_SIGNALS);
  expect(out.filter((x) => /over the 18 limit/.test(x.dropped_reason || ''))).toHaveLength(3);
});

describe('runSignals', () => {
  const input = { planId: 'p1', airDate: '2026-11-30' };
  let destroy: jest.SpyInstance; let create: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockTx();
    destroy = jest.spyOn(WeeklyLiveSignal, 'destroy').mockResolvedValue(0); create = jest.spyOn(WeeklyLiveSignal, 'bulkCreate').mockResolvedValue([]);
  });
  it('replaces the plan rows in one transaction and reports a short list', async () => {
    const search = jest.fn().mockResolvedValueOnce([cand()]).mockResolvedValue([]);
    const r = await runSignals(input, { search, fetchPage: page(ld('2026-11-18')), today: TODAY });
    expect(r).toEqual({ kept: 1, dropped: 0, short: true, failedGroups: [] });
    expect(destroy).toHaveBeenCalledWith({ where: { plan_id: 'p1' }, transaction: 'tx' });
    expect(create.mock.calls[0][1]).toEqual({ transaction: 'tx' });
    expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(search.mock.calls[0][1]).toMatchObject({ from: '2026-11-16', to: TODAY });
  });
  it('stops at the cost cap and replaces nothing', async () => {
    const search = jest.fn().mockRejectedValue(new BudgetExceeded(49.9, 0.25, 50));
    await expect(runSignals(input, { search, today: TODAY })).rejects.toThrow(/cost cap is \$50\.00/);
    expect(search).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });
  it('one failed group is reported; all failing throws and keeps the old rows', async () => {
    const search = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue([]);
    expect((await runSignals(input, { search, fetchPage: page(''), today: TODAY })).failedGroups).toEqual(['1+6']);
    destroy.mockClear();
    await expect(runSignals(input, { search: jest.fn().mockRejectedValue(new Error('x')), today: TODAY })).rejects.toThrow(/Every news search failed/);
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe('cost cap', () => {
  const mock = (spent: number) => {
    mockTx();
    return jest.spyOn(sequelize, 'query').mockImplementation((async (sql: string) => (/SUM\(cost_usd\)/.test(sql) ? [{ spent }] : [{ id: 'r1' }])) as never);
  };
  it('reserves under the cap and refuses over it without inserting', async () => {
    const q = mock(49.75);
    expect(await reserve('p1', 'x', 0.25, 50)).toBe('r1');
    q.mockClear();
    await expect(reserve('p1', 'x', 0.26, 50)).rejects.toBeInstanceOf(BudgetExceeded);
    expect(q.mock.calls.some((c) => /INSERT/.test(String(c[0])))).toBe(false);
  });
  it('settles to the real cost; a refused call to zero; a timeout keeps its reservation', async () => {
    const q = mock(0);
    const settled = () => q.mock.calls.filter((c) => /UPDATE/.test(String(c[0]))).map((c) => (c[1] as { replacements: { c: number } }).replacements.c);
    expect(await withBudget('p1', 'x', 0.25, async () => ({ value: 7, costUsd: 0.04 }))).toBe(7);
    expect(settled()).toEqual([0.04]);
    await expect(withBudget('p1', 'x', 0.25, async () => { throw Object.assign(new Error('bad key'), { status: 401 }); })).rejects.toThrow('bad key');
    expect(settled()).toEqual([0.04, 0]);
    await expect(withBudget('p1', 'x', 0.25, async () => { throw new Error('timeout'); })).rejects.toThrow('timeout');
    expect(settled()).toEqual([0.04, 0]);
  });
  it('unknown usage is charged at the worst case; searches are billed', () => {
    expect(searchCost('gpt-4o', undefined, 2)).toBe(SEARCH_RESERVE_USD);
    expect(searchCost('gpt-4o', { input_tokens: 10_000, output_tokens: 1000 }, 2)).toBeCloseTo(0.055, 6);
  });
});

it('parseCandidates keeps valid items only and survives a malformed answer', () => {
  expect(parseCandidates('sorry')).toEqual([]);
  expect(parseCandidates('{"items": "no"}')).toEqual([]);
  const items = [cand(), { headline: 'no url here' }, cand({ url: 'javascript:alert(1)' })];
  expect(parseCandidates(`Here you go: ${JSON.stringify({ items })} done`)).toHaveLength(1);
});

it('shiftDays crosses months', () => { expect(shiftDays('2026-11-05', -14)).toBe('2026-10-22'); });

it('the window starts 14 days before the air date, and always covers at least a week', () => {
  expect(windowStart('2026-11-30', '2026-11-24')).toBe('2026-11-16');
  expect(windowStart('2026-11-23', '2026-11-24')).toBe('2026-11-09');
  expect(windowStart('2027-02-01', '2026-11-24')).toBe('2026-11-17');
});

it('a query string that names the page is a different page; tracking is ignored', () => {
  expect(urlKey('https://a.com/item?id=1')).not.toBe(urlKey('https://a.com/item?id=2'));
  expect(urlKey('https://www.a.com/x/?utm_source=q&fbclid=1#top')).toBe(urlKey('https://a.com/x'));
});

it.each([['fifty', 50], ['', 50], [undefined, 50], ['-5', 50], ['Infinity', 50], ['0', 0], ['20', 20]])('cap setting %s is %s', (raw, n) => { expect(capFrom(raw as string | undefined)).toBe(n); });
