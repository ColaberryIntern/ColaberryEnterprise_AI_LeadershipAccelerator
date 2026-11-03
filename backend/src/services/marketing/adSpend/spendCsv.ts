import { parse } from 'csv-parse/sync';
import { normalisePlacement, parseDay, parseMoneyToCents, Platform, SpendInput, SpendInputSchema } from './spendInput';

/**
 * Read an ad platform's spend export into spend rows, reporting every line it could not use.
 *
 * Built for Meta Ads Manager's export (Reports -> Export table data -> CSV) at campaign level,
 * with "Breakdown -> By time -> Day" for one row per day, and optionally "By delivery -> Platform"
 * for the Facebook / Instagram split. The column names are matched loosely because they change
 * with the account's language settings and the columns a user chose, and the same reader accepts
 * a hand-made sheet with Date / Campaign / Spend.
 *
 * NOTHING IS GUESSED. A line with no recognisable date, campaign or amount is reported back with
 * its line number, not imported as a zero. A non-USD amount column refuses the whole file, because
 * summing euros as dollars is a wrong number that looks right.
 *
 * Ads Manager adds a totals row with an empty campaign; it is skipped and counted, never imported,
 * because importing it would double the spend.
 */

export const MAX_CSV_ROWS = 5000;
export const MAX_CSV_BYTES = 2_000_000;

const COLUMNS: Record<string, string[]> = {
  start: ['reporting starts', 'day', 'date', 'start date', 'period start', 'start'],
  end: ['reporting ends', 'end date', 'period end', 'end'],
  campaignId: ['campaign id', 'campaign_id'],
  campaignName: ['campaign name', 'campaign', 'campaign_name'],
  amount: ['amount spent (usd)', 'amount spent', 'spend', 'cost', 'amount', 'spend (usd)'],
  placement: ['platform', 'publisher platform', 'placement'],
  impressions: ['impressions'],
  clicks: ['link clicks', 'clicks (all)', 'clicks'],
  currency: ['currency'],
  accountId: ['account id', 'ad account id'],
};

export interface CsvRowError { line: number; message: string }

export interface CsvParseResult {
  rows: SpendInput[];
  errors: CsvRowError[];
  skippedTotals: number;
  /** Which file column was read for each field, so the preview can show its working. */
  mapping: Record<string, string | null>;
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const a of aliases) {
    const i = lower.indexOf(a);
    if (i >= 0) return headers[i];
  }
  return null;
}

const int = (raw: string | undefined): number | null => {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw.replace(/[,\s]/g, ''));
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export function parseSpendCsv(text: string, platform: Platform = 'meta'): CsvParseResult {
  if (text.length > MAX_CSV_BYTES) {
    return { rows: [], errors: [{ line: 0, message: `File is larger than ${MAX_CSV_BYTES / 1_000_000} MB` }], skippedTotals: 0, mapping: {} };
  }
  let records: Record<string, string>[];
  try {
    records = parse(text, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
  } catch (err: unknown) {
    return { rows: [], errors: [{ line: 0, message: `Not a readable CSV: ${err instanceof Error ? err.message : String(err)}` }], skippedTotals: 0, mapping: {} };
  }
  const headers = records.length ? Object.keys(records[0]) : [];
  const mapping: Record<string, string | null> = {};
  for (const [field, aliases] of Object.entries(COLUMNS)) mapping[field] = findColumn(headers, aliases);

  const errors: CsvRowError[] = [];
  const foreign = headers.find((h) => /amount spent \((?!usd\))[a-z]{3}\)/i.test(h));
  if (foreign) {
    return { rows: [], errors: [{ line: 0, message: `"${foreign}" is not in US dollars. Change the ad account currency view to USD and export again.` }], skippedTotals: 0, mapping };
  }
  const missing = (['start', 'amount'] as const).filter((f) => !mapping[f]);
  if (!mapping.campaignId && !mapping.campaignName) missing.push('campaign' as never);
  if (missing.length) {
    return {
      rows: [], skippedTotals: 0, mapping,
      errors: [{ line: 1, message: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Found: ${headers.join(', ') || 'none'}.` }],
    };
  }
  if (records.length > MAX_CSV_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `More than ${MAX_CSV_ROWS} rows. Split the export by month.` }], skippedTotals: 0, mapping };
  }

  const rows: SpendInput[] = [];
  let skippedTotals = 0;
  records.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const get = (f: string) => (mapping[f] ? (r[mapping[f] as string] ?? '').trim() : '');
    const campaignId = get('campaignId');
    const campaignName = get('campaignName');
    if (!campaignId && !campaignName) { skippedTotals += 1; return; }

    const currency = get('currency');
    if (currency && currency.toUpperCase() !== 'USD') {
      errors.push({ line, message: `Currency ${currency} is not USD` });
      return;
    }
    const start = parseDay(get('start'));
    const end = parseDay(get('end')) ?? start;
    const cents = parseMoneyToCents(get('amount') || '0');
    if (!start) { errors.push({ line, message: `Unreadable date "${get('start')}"` }); return; }
    if (cents === null) { errors.push({ line, message: `Unreadable amount "${get('amount')}"` }); return; }

    const parsed = SpendInputSchema.safeParse({
      platform,
      accountId: get('accountId') || null,
      campaignRef: campaignId || campaignName,
      campaignName: campaignName || null,
      placement: normalisePlacement(get('placement')),
      periodStart: start,
      periodEnd: end,
      amountCents: cents,
      impressions: int(get('impressions')),
      clicks: int(get('clicks')),
      note: null,
    });
    if (!parsed.success) {
      errors.push({ line, message: parsed.error.issues.map((x) => x.message).join('; ') });
      return;
    }
    rows.push(parsed.data);
  });

  return { rows: combineSameKey(rows), errors, skippedTotals, mapping };
}

/**
 * Lines that share a stored identity (campaign, placement, days) are ADDED into one row. An ad-set
 * or ad-level export has one line per ad set per day; written one by one, each would overwrite the
 * last and keep only one ad set's spend, while the preview total showed all of them.
 */
export function combineSameKey(rows: SpendInput[]): SpendInput[] {
  const byKey = new Map<string, SpendInput>();
  for (const r of rows) {
    const key = [r.platform, r.campaignRef.toLowerCase(), r.placement, r.periodStart, r.periodEnd].join('|');
    const cur = byKey.get(key);
    if (!cur) { byKey.set(key, { ...r }); continue; }
    cur.amountCents += r.amountCents;
    if (r.impressions != null) cur.impressions = (cur.impressions ?? 0) + r.impressions;
    if (r.clicks != null) cur.clicks = (cur.clicks ?? 0) + r.clicks;
    cur.campaignName = cur.campaignName ?? r.campaignName;
  }
  return Array.from(byKey.values());
}
