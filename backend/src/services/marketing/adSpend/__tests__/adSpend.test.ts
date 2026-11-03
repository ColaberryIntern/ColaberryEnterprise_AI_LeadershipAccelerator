import { allocateSpend, daysBetween, SpendFact } from '../spendAllocation';
import { buildProfitability, CohortRow } from '../profitability';
import { parseSpendCsv } from '../spendCsv';
import { parseDay, parseMoneyToCents, SpendInputSchema } from '../spendInput';
import { insightToInput, readMetaAdsConfig, runMetaSpendSync, SyncDeps } from '../metaSpendSync';
import { canonicalUtmSource, mergeSourceShapes, PLACEMENT_FOR_SOURCE, SourceCampaignGroup } from '../utmSource';

const fact = (over: Partial<SpendFact>): SpendFact => ({
  platform: 'meta', campaignRef: '527', campaignName: 'AI Platform', placement: '',
  periodStart: '2026-10-01', periodEnd: '2026-10-01', amountCents: 10000, source: 'manual', ...over,
});

describe('allocateSpend', () => {
  it('spreads a range evenly and keeps every cent', () => {
    const a = allocateSpend([fact({ periodStart: '2026-10-01', periodEnd: '2026-10-03', amountCents: 1000 })], '2026-10-01', '2026-10-31');
    expect(a.totalCents).toBe(1000);
    expect(a.campaigns[0].daysWithSpend).toBe(3);
  });

  it('takes only the part of a range inside the window', () => {
    const a = allocateSpend([fact({ periodStart: '2026-09-25', periodEnd: '2026-10-04', amountCents: 10000 })], '2026-10-01', '2026-10-31');
    expect(a.totalCents).toBe(4000); // 4 of 10 days
  });

  it('uses one source per campaign per day: meta_api over csv over manual, never the sum', () => {
    const a = allocateSpend([
      fact({ periodStart: '2026-10-01', periodEnd: '2026-10-07', amountCents: 70000, source: 'manual' }),  // $100/day typed
      fact({ periodStart: '2026-10-02', periodEnd: '2026-10-02', amountCents: 12000, source: 'csv' }),
      fact({ periodStart: '2026-10-02', periodEnd: '2026-10-02', amountCents: 12500, source: 'meta_api', placement: 'facebook' }),
      fact({ periodStart: '2026-10-02', periodEnd: '2026-10-02', amountCents: 2500, source: 'meta_api', placement: 'instagram' }),
      fact({ periodStart: '2026-10-03', periodEnd: '2026-10-03', amountCents: 9000, source: 'csv' }),
    ], '2026-10-01', '2026-10-31');
    // day 1 manual 100, day 2 meta 125+25, day 3 csv 90, days 4-7 manual 4 x 100
    expect(a.totalCents).toBe(10000 + 15000 + 9000 + 40000);
    expect(a.campaigns[0].byPlacementCents).toEqual({ '': 59000, facebook: 12500, instagram: 2500 }) // manual 5 days + csv 1 day carry no placement;
    expect(a.campaigns[0].sources).toEqual(['meta_api', 'csv', 'manual']);
  });

  it('treats campaign refs case- and space-insensitively', () => {
    const a = allocateSpend([fact({ campaignRef: ' ABC ' }), fact({ campaignRef: 'abc', periodStart: '2026-10-02', periodEnd: '2026-10-02' })], '2026-10-01', '2026-10-31');
    expect(a.campaigns).toHaveLength(1);
    expect(a.campaigns[0].spendCents).toBe(20000);
  });

  it('reports coverage so missing days are visible', () => {
    const a = allocateSpend([fact({ periodStart: '2026-10-01', periodEnd: '2026-10-10' })], '2026-10-01', '2026-10-31');
    expect(a.daysCovered).toBe(10);
    expect(a.windowDays).toBe(31);
    expect(a.lastDayRecorded).toBe('2026-10-10');
  });

  it('steps calendar days across DST and month ends', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

const cohort = (over: Partial<CohortRow>): CohortRow => ({
  utmSource: 'fb', utmCampaign: '527', signups: 100, payers: 0, mrr: 0, collectedCents: 0, ...over,
});
const spend = (ref: string, cents: number, extra: Partial<{ campaignName: string; byPlacementCents: Record<string, number>; platform: string }> = {}) => ({
  key: `${extra.platform ?? 'meta'}|${ref.toLowerCase()}`, platform: extra.platform ?? 'meta', campaignRef: ref, campaignName: extra.campaignName ?? null,
  aliases: [ref.toLowerCase(), ...(extra.campaignName ? [extra.campaignName.toLowerCase()] : [])],
  spendCents: cents, byPlacementCents: extra.byPlacementCents ?? { '': cents }, sources: ['meta_api' as const], daysWithSpend: 30, lastDay: '2026-10-31',
});

describe('buildProfitability', () => {
  it('combines fb and ig signups of one campaign and computes every ratio', () => {
    const { rows, totals } = buildProfitability(
      [spend('527', 200000, { byPlacementCents: { facebook: 150000, instagram: 50000 } })],
      [cohort({ signups: 274, payers: 3, mrr: 497, collectedCents: 300000 }), cohort({ utmSource: 'ig', signups: 97, payers: 1, mrr: 199, collectedCents: 19900 })],
    );
    const r = rows[0];
    expect(r).toMatchObject({ spend: 2000, signups: 371, payers: 4, mrr: 696, collected: 3199, profit: 1199, roas: 1.6, cac: 500, verdict: 'profitable', paybackMonths: 0 });
    expect(r.costPerSignup).toBeCloseTo(5.39, 2);
    expect(r.bySource.find((s) => s.utmSource === 'ig')).toMatchObject({ spend: 500, costPerSignup: 5.15 });
    expect(totals.roas).toBe(1.6);
  });

  it('computes payback months from MRR when cash has not covered spend yet', () => {
    const { rows } = buildProfitability([spend('527', 300000)], [cohort({ payers: 2, mrr: 348, collectedCents: 39800 })]);
    expect(rows[0].paybackMonths).toBeCloseTo((3000 - 398) / 348, 1);
    expect(rows[0].verdict).toBe('paying_back');
  });

  it('calls a campaign slow when payback exceeds the target, and no_payers when nobody pays', () => {
    expect(buildProfitability([spend('527', 1000000)], [cohort({ payers: 1, mrr: 149 })]).rows[0].verdict).toBe('slow');
    const none = buildProfitability([spend('527', 50000)], [cohort({})]).rows[0];
    expect(none.verdict).toBe('no_payers');
    expect(none.cac).toBeNull(); // not infinity, not zero
    expect(none.paybackMonths).toBeNull();
  });

  it('matches spend by campaign name when utm_campaign carries the name', () => {
    const { rows } = buildProfitability([spend('120210000000001', 10000, { campaignName: 'Fall AI Push' })], [cohort({ utmCampaign: 'fall ai push' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(100);
  });

  it('keeps unmatched spend in the total and lists it, so a typo cannot flatter the ads', () => {
    const { rows, totals } = buildProfitability([spend('527', 100000), spend('999', 50000)], [cohort({ payers: 1, mrr: 149, collectedCents: 178800 })]);
    expect(totals.spend).toBe(1500);
    expect(totals.unmatchedSpend).toBe(500);
    expect(rows.find((r) => r.campaignRef === '999')?.verdict).toBe('no_signups');
    expect(totals.roas).toBeCloseTo(1788 / 1500, 2);
  });

  it('does not credit organic or untagged payers to ad spend', () => {
    const { rows, totals } = buildProfitability([spend('527', 100000)], [
      cohort({ payers: 0 }),
      cohort({ utmSource: null, utmCampaign: null, signups: 8, payers: 2, mrr: 398, collectedCents: 357600 }),
    ]);
    expect(rows.find((r) => r.verdict === 'no_spend')?.signups).toBe(8);
    expect(totals.collected).toBe(0);
    expect(totals.payers).toBe(0);
  });
});

describe('spend input', () => {
  it('parses money without floating point drift', () => {
    expect(parseMoneyToCents('$1,234.56')).toBe(123456);
    expect(parseMoneyToCents('0.1')).toBe(10);
    expect(parseMoneyToCents('19.99')).toBe(1999);
    expect(parseMoneyToCents('-5')).toBeNull();
    expect(parseMoneyToCents('12.345')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
  });

  it('reads ISO and US dates and rejects impossible ones', () => {
    expect(parseDay('2026-10-31')).toBe('2026-10-31');
    expect(parseDay('10/31/2026')).toBe('2026-10-31');
    expect(parseDay('2/30/2026')).toBeNull();
  });

  it('refuses reversed, future, overlong and absurd entries', () => {
    const ok = { platform: 'meta', campaignRef: '527', periodStart: '2026-10-01', periodEnd: '2026-10-07', amountCents: 5000 };
    expect(SpendInputSchema.safeParse(ok).success).toBe(true);
    expect(SpendInputSchema.safeParse({ ...ok, periodEnd: '2026-09-01' }).success).toBe(false);
    expect(SpendInputSchema.safeParse({ ...ok, periodStart: '2099-01-01', periodEnd: '2099-01-02' }).success).toBe(false);
    expect(SpendInputSchema.safeParse({ ...ok, periodStart: '2024-01-01' }).success).toBe(false);
    expect(SpendInputSchema.safeParse({ ...ok, amountCents: 2_000_000_000 }).success).toBe(false);
    expect(SpendInputSchema.safeParse({ ...ok, campaignRef: '  ' }).success).toBe(false);
    expect(SpendInputSchema.safeParse({ ...ok, platform: 'myspace' }).success).toBe(false);
  });
});

describe('parseSpendCsv', () => {
  const adsManager = [
    'Reporting starts,Reporting ends,Campaign name,Campaign ID,Platform,Amount spent (USD),Impressions,Link clicks',
    '2026-10-01,2026-10-01,AI Platform,52708443249234,Facebook,"1,234.56",50000,800',
    '2026-10-01,2026-10-01,AI Platform,52708443249234,Instagram,100.00,9000,120',
    ',,,,,1334.56,59000,920',
  ].join('\n');

  it('reads an Ads Manager export, skipping the totals row', () => {
    const r = parseSpendCsv(adsManager);
    expect(r.errors).toEqual([]);
    expect(r.skippedTotals).toBe(1);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ campaignRef: '52708443249234', campaignName: 'AI Platform', placement: 'facebook', amountCents: 123456, impressions: 50000, clicks: 800 });
  });

  it('accepts a hand-made sheet with Date, Campaign, Spend', () => {
    const r = parseSpendCsv('Date,Campaign,Spend\n10/05/2026,Fall Push,$250\n');
    expect(r.rows[0]).toMatchObject({ periodStart: '2026-10-05', periodEnd: '2026-10-05', campaignRef: 'Fall Push', amountCents: 25000 });
  });

  it('reports bad lines by number instead of importing zeros', () => {
    const r = parseSpendCsv('Date,Campaign,Spend\nnot-a-date,A,10\n2026-10-02,B,ten\n2026-10-03,C,5\n');
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ line: 2, message: 'Unreadable date "not-a-date"' }, { line: 3, message: 'Unreadable amount "ten"' }]);
  });

  it('refuses a non-USD export outright', () => {
    const r = parseSpendCsv('Day,Campaign ID,Amount spent (EUR)\n2026-10-01,1,10\n');
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toMatch(/not in US dollars/);
  });

  it('names the missing columns', () => {
    const r = parseSpendCsv('Foo,Bar\n1,2\n');
    expect(r.errors[0].message).toMatch(/Missing columns: start, amount, campaign/);
  });
});

describe('Meta sync', () => {
  const env = { META_ADS_ACCESS_TOKEN: 'EAAsecretXYZ', META_AD_ACCOUNT_ID: 'act_123456789' } as NodeJS.ProcessEnv;
  const deps = (responses: Array<{ status: number; body: unknown }>, write = jest.fn(async (rows: unknown[]) => rows.length)): SyncDeps & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      env,
      sleep: jest.fn(async () => undefined),
      write,
      http: jest.fn(async ({ url }) => { calls.push(url); const r = responses.shift(); if (!r) throw new Error('no more'); return r; }),
    } as SyncDeps & { calls: string[] };
  };
  const row = (over: Record<string, string> = {}) => ({
    campaign_id: '527', campaign_name: 'AI', spend: '125.50', impressions: '1000', clicks: '20',
    date_start: '2026-10-01', date_stop: '2026-10-01', publisher_platform: 'instagram', ...over,
  });

  it('skips without calling Meta when not configured, and says why', async () => {
    const d = deps([]);
    const r = await runMetaSpendSync({ since: '2026-10-01', until: '2026-10-30' }, { ...d, env: {} as NodeJS.ProcessEnv });
    expect(r.outcome).toBe('skipped');
    expect(r.error).toMatch(/META_ADS_ACCESS_TOKEN/);
    expect(d.calls).toHaveLength(0);
  });

  it('follows pagination and writes every day and placement', async () => {
    const d = deps([
      { status: 200, body: { currency: 'USD' } },
      { status: 200, body: { data: [row(), row({ publisher_platform: 'facebook', spend: '300' })], paging: { next: 'https://graph.facebook.com/next' } } },
      { status: 200, body: { data: [row({ date_start: '2026-10-02', date_stop: '2026-10-02' })] } },
    ]);
    const r = await runMetaSpendSync({ since: '2026-10-01', until: '2026-10-02' }, d);
    expect(r).toMatchObject({ outcome: 'success', rowsWritten: 3 });
    const written = (d.write as jest.Mock).mock.calls[0][0];
    expect(written[0]).toMatchObject({ campaignRef: '527', placement: 'instagram', amountCents: 12550 });
    expect(d.calls[1]).toContain('breakdowns=publisher_platform');
    expect(d.calls[1]).toContain('time_increment=1');
  });

  it('retries a rate limit, then succeeds', async () => {
    const d = deps([
      { status: 200, body: { currency: 'USD' } },
      { status: 400, body: { error: { message: 'User request limit reached', code: 17 } } },
      { status: 200, body: { data: [row()] } },
    ]);
    const r = await runMetaSpendSync({ since: '2026-10-01', until: '2026-10-01' }, d);
    expect(r.outcome).toBe('success');
    expect(d.sleep).toHaveBeenCalledWith(2000);
  });

  it('does not retry a bad token, writes nothing, and classifies it', async () => {
    const d = deps([{ status: 400, body: { error: { message: 'Invalid OAuth access token', code: 190 } } }]);
    const r = await runMetaSpendSync({ since: '2026-10-01', until: '2026-10-01' }, d);
    expect(r).toMatchObject({ outcome: 'failure', errorClass: 'AuthError', rowsWritten: 0 });
    expect(d.sleep).not.toHaveBeenCalled();
    expect(d.write).not.toHaveBeenCalled();
    expect(r.error).not.toContain('EAAsecretXYZ');
  });

  it('retries Meta ads throttling (80004 with HTTP 400) instead of failing the run', async () => {
    const d = deps([
      { status: 200, body: { currency: 'USD' } },
      { status: 400, body: { error: { message: 'There have been too many calls to this ad-account', code: 80004 } } },
      { status: 200, body: { data: [row()] } },
    ]);
    const r = await runMetaSpendSync({ since: '2026-10-01', until: '2026-10-01' }, d);
    expect(r.outcome).toBe('success');
    expect(d.sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after three temporary failures', async () => {
    const d = deps([500, 500, 500].map((status) => ({ status, body: { error: { message: 'Service unavailable', code: 2 } } })));
    const r = await runMetaSpendSync({ since: '2026-10-01', until: '2026-10-01' }, d);
    expect(r).toMatchObject({ outcome: 'failure', errorClass: 'UpstreamUnavailable' });
    expect(d.calls).toHaveLength(3);
  });

  it('refuses a non-USD ad account rather than summing it as dollars', async () => {
    const d = deps([{ status: 200, body: { currency: 'EUR' } }]);
    const r = await runMetaSpendSync({ since: '2026-10-01', until: '2026-10-01' }, d);
    expect(r).toMatchObject({ outcome: 'failure', errorClass: 'ContractViolation' });
    expect(d.write).not.toHaveBeenCalled();
  });

  it('drops unusable API rows instead of writing zeros', () => {
    expect(insightToInput({ campaign_id: '1', date_start: '2026-10-01', spend: 'n/a' }, '1')).toBeNull();
    expect(insightToInput({ date_start: '2026-10-01', spend: '5' }, '1')).toBeNull();
  });

  it('reads config strictly and never needs the token to be shown', () => {
    expect(readMetaAdsConfig({ META_ADS_ACCESS_TOKEN: 't', META_AD_ACCOUNT_ID: 'act_x1' } as NodeJS.ProcessEnv).reason).toMatch(/not a numeric/);
    expect(readMetaAdsConfig(env)).toMatchObject({ configured: true, accountId: '123456789' });
  });
});


/** Regressions for the independent review of 2026-11-02. Each names the defect it pins. */
describe('review regressions', () => {
  it('#1 a CSV keyed by name and the Meta sync keyed by id are ONE campaign, not double spend', () => {
    const a = allocateSpend([
      fact({ campaignRef: 'AI Platform', campaignName: 'AI Platform', source: 'csv', amountCents: 9000 }),
      fact({ campaignRef: '120210000000001', campaignName: 'AI Platform', source: 'meta_api', amountCents: 10000 }),
    ], '2026-10-01', '2026-10-31');
    expect(a.campaigns).toHaveLength(1);
    expect(a.totalCents).toBe(10000); // the sync wins the day; the CSV copy is not added
    expect(a.campaigns[0].campaignRef).toBe('120210000000001');
    expect(a.campaigns[0].aliases).toEqual(['120210000000001', 'ai platform']);
  });

  it('#2 a typed month and typed daily rows for the same days do not add up', () => {
    const a = allocateSpend([
      fact({ periodStart: '2026-10-01', periodEnd: '2026-10-31', amountCents: 310000 }), // $100/day estimate
      fact({ periodStart: '2026-10-01', periodEnd: '2026-10-01', amountCents: 12000 }),  // the real day
    ], '2026-10-01', '2026-10-31');
    expect(a.totalCents).toBe(300000 + 12000); // 30 days of the estimate + the 1 real day
  });

  it('#2 a placement split replaces an unsplit total for the same day and source', () => {
    const a = allocateSpend([
      fact({ source: 'csv', amountCents: 15000 }),
      fact({ source: 'csv', placement: 'facebook', amountCents: 12000 }),
      fact({ source: 'csv', placement: 'instagram', amountCents: 3000 }),
    ], '2026-10-01', '2026-10-31');
    expect(a.totalCents).toBe(15000);
    expect(a.campaigns[0].byPlacementCents).toEqual({ facebook: 12000, instagram: 3000 });
  });

  it('#7 one campaign used by id in some URLs and by name in others becomes one row', () => {
    const { rows } = buildProfitability(
      [{ key: 'meta|527', platform: 'meta', campaignRef: '527', campaignName: 'Fall', aliases: ['527', 'fall'], spendCents: 100000,
        byPlacementCents: { '': 100000 }, sources: ['meta_api'], daysWithSpend: 30, lastDay: null }],
      [
        { utmSource: 'fb', utmCampaign: '527', signups: 50, payers: 1, mrr: 149, collectedCents: 0 },
        { utmSource: 'fb', utmCampaign: 'Fall', signups: 30, payers: 1, mrr: 199, collectedCents: 0 },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ signups: 80, payers: 2, spend: 1000 });
    expect(rows[0].bySource).toHaveLength(1); // both fb groups combined under Facebook
  });

  it('#7 two campaigns sharing the name used in utm_campaign are attributed together, not one dropped', () => {
    const mk = (id: string) => ({ key: `meta|${id}`, platform: 'meta', campaignRef: id, campaignName: 'Retarget', aliases: [id, 'retarget'],
      spendCents: 50000, byPlacementCents: { '': 50000 }, sources: ['meta_api' as const], daysWithSpend: 30, lastDay: null });
    const { rows, totals } = buildProfitability([mk('1'), mk('2')], [{ utmSource: 'fb', utmCampaign: 'retarget', signups: 40, payers: 0, mrr: 0, collectedCents: 0 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(1000);
    expect(totals.unmatchedSpend).toBe(0);
  });

  it('#8 a Google campaign and a Meta campaign with the same name never replace each other', () => {
    const a = allocateSpend([
      fact({ platform: 'google', campaignRef: 'fall_launch', campaignName: null, source: 'manual', amountCents: 5000 }),
      fact({ platform: 'meta', campaignRef: 'fall_launch', campaignName: null, source: 'csv', amountCents: 7000 }),
    ], '2026-10-01', '2026-10-31');
    expect(a.campaigns).toHaveLength(2);
    expect(a.totalCents).toBe(12000);
    const { rows } = buildProfitability(a.campaigns, [{ utmSource: 'fb', utmCampaign: 'fall_launch', signups: 10, payers: 0, mrr: 0, collectedCents: 0 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(120); // both platforms' spend against the shared tag
  });

  it('#9 a deposit covering a tiny spend is not "Paid back" while nobody pays', () => {
    const { rows } = buildProfitability([spend('527', 4000)], [cohort({ signups: 3, payers: 0, collectedCents: 5000 })]);
    expect(rows[0].verdict).toBe('no_payers');
    expect(rows[0].paybackMonths).toBeNull();
  });

  it('shows per-placement spend only when every cent of the row was broken down', () => {
    const { rows } = buildProfitability([spend('527', 20000, { byPlacementCents: { facebook: 10000, '': 10000 } })],
      [cohort({ signups: 10 }), cohort({ utmSource: 'ig', signups: 5 })]);
    expect(rows[0].bySource.every((b) => b.spend === null)).toBe(true);
  });

  it('CSV: an ad-set level export is summed per campaign-day, so the preview total is what is stored', () => {
    const r = parseSpendCsv('Day,Campaign ID,Ad set name,Amount spent (USD)\n2026-10-01,527,A,10\n2026-10-01,527,B,15\n');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amountCents).toBe(2500);
  });

  it('rejects an impossible date with a 400-style issue instead of reaching the database', () => {
    const res = SpendInputSchema.safeParse({ platform: 'meta', campaignRef: '1', periodStart: '2026-02-30', periodEnd: '2026-02-30', amountCents: 1 });
    expect(res.success).toBe(false);
  });
});

describe('canonicalUtmSource', () => {
  it('reduces every shape of the same source to one key', () => {
    expect(canonicalUtmSource('fb|paid')).toBe('fb');
    expect(canonicalUtmSource(' FB ')).toBe('fb');
    expect(canonicalUtmSource('Fb|Paid')).toBe('fb');
    expect(canonicalUtmSource('ig|paid')).toBe('ig');
  });

  it('reads a medium-only value as no source, not as a placement named after the medium', () => {
    expect(canonicalUtmSource('|paid')).toBe('');
  });

  it('treats null, undefined and blank alike, the way the report always has', () => {
    expect(canonicalUtmSource(null)).toBe('');
    expect(canonicalUtmSource(undefined)).toBe('');
    expect(canonicalUtmSource('   ')).toBe('');
  });

  it('is idempotent, so applying it at a second read cannot shift the key', () => {
    for (const raw of ['fb|paid', ' IG ', '', '|paid', 'google|cpc']) {
      expect(canonicalUtmSource(canonicalUtmSource(raw))).toBe(canonicalUtmSource(raw));
    }
  });

  it('keys the placement map in canonical form, so a new alias cannot bypass the canonicalizer', () => {
    for (const key of Object.keys(PLACEMENT_FOR_SOURCE)) expect(canonicalUtmSource(key)).toBe(key);
  });
});

describe('the two shapes of utm_source are one placement line, not two', () => {
  it('ADS-3: fb and fb|paid on one campaign stay one line, and it keeps its spend', () => {
    const { rows } = buildProfitability(
      [spend('527', 200000, { byPlacementCents: { facebook: 150000, instagram: 50000 } })],
      [
        cohort({ utmSource: 'fb', signups: 200, payers: 2, mrr: 398, collectedCents: 200000 }),
        cohort({ utmSource: 'fb|paid', signups: 100, payers: 1, mrr: 199, collectedCents: 100000 }),
        cohort({ utmSource: 'ig', signups: 97, payers: 1, mrr: 199, collectedCents: 19900 }),
      ],
    );
    const fb = rows[0].bySource.filter((s) => s.utmSource === 'fb');
    expect(fb).toHaveLength(1);
    expect(fb[0].signups).toBe(300);
    // This is the whole point. `fb|paid` misses the placement map, so split in two this line's
    // spend and cost-per-signup would both read null while its signups stayed visible beside them.
    expect(fb[0].spend).toBe(1500);
    expect(fb[0].costPerSignup).toBeCloseTo(5, 2);
    expect(rows[0].bySource.map((s) => s.utmSource).sort()).toEqual(['fb', 'ig']);
  });

  it('labels the surviving line with the canonical code, so the card never prints fb|paid', () => {
    const { rows } = buildProfitability([spend('527', 100000)], [cohort({ utmSource: 'FB|paid' })]);
    expect(rows[0].bySource[0].utmSource).toBe('fb');
  });

  it('leaves an untagged group with no source rather than inventing one', () => {
    const { rows } = buildProfitability([], [cohort({ utmSource: null, utmCampaign: null, signups: 8 })]);
    expect(rows[0].bySource[0].utmSource).toBeNull();
  });
});

describe('mergeSourceShapes (the spend entry form suggestions)', () => {
  const group = (over: Partial<SourceCampaignGroup>): SourceCampaignGroup => ({
    utmSource: 'fb', utmCampaign: '527', signups: 10, lastSignup: '2026-11-01T00:00:00.000Z', ...over,
  });

  it('offers one suggestion per campaign and placement, with the signups added', () => {
    const merged = mergeSourceShapes([
      group({ utmSource: 'fb', signups: 10, lastSignup: '2026-11-01T00:00:00.000Z' }),
      group({ utmSource: 'fb|paid', signups: 7, lastSignup: '2026-11-03T00:00:00.000Z' }),
    ], 100);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ utmSource: 'fb', utmCampaign: '527', signups: 17, lastSignup: '2026-11-03T00:00:00.000Z' });
  });

  it('keeps genuinely different placements and campaigns apart', () => {
    const merged = mergeSourceShapes([group({ utmSource: 'fb' }), group({ utmSource: 'ig' }), group({ utmCampaign: '999' })], 100);
    expect(merged).toHaveLength(3);
  });

  it('matches campaigns the way the report does, so one report row is never two suggestions', () => {
    expect(mergeSourceShapes([group({ utmCampaign: 'Fall AI Push' }), group({ utmCampaign: 'fall ai push' })], 100)).toHaveLength(1);
  });

  it('returns the most recent first and respects the limit', () => {
    const merged = mergeSourceShapes([
      group({ utmCampaign: 'a', lastSignup: '2026-10-01T00:00:00.000Z' }),
      group({ utmCampaign: 'b', lastSignup: '2026-11-03T00:00:00.000Z' }),
      group({ utmCampaign: 'c', lastSignup: '2026-10-20T00:00:00.000Z' }),
    ], 2);
    expect(merged.map((m) => m.utmCampaign)).toEqual(['b', 'c']);
  });

  it('handles an empty read and leaves the rows it was given untouched', () => {
    const rows = [group({ utmSource: 'fb|paid' })];
    const snapshot = JSON.stringify(rows);
    mergeSourceShapes(rows, 100);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(mergeSourceShapes([], 100)).toEqual([]);
  });
});
