import { sequelize } from '../../../config/database';
import { WeeklyLiveSignal } from '../../../models/WeeklyLive';
import { classifyError } from '../../../utils/errorClassifier';
import { normalizeFactors } from '../scoring';
import { lintField } from '../contentLint';
import { centralDate } from '../curriculumMap';
import { BudgetExceeded } from './researchBudget';
import { fetchPage as realFetch, type FetchPage } from './pageFetch';
import { readPage } from './pageDate';
import { FACTOR_GROUPS, searchGroup as realSearch, type Candidate, type SearchInput } from './signalSearch';

/**
 * The signals job (WL3.1): search, then FETCH every candidate and read its date from the page. A page
 * that cannot be fetched gets one alternate outlet, then is dropped with a reason. Kept: at most 18.
 * Fewer than 12 is reported as `short`, never padded. Re-running a plan replaces its rows in one
 * transaction, so a rerun never duplicates and a failed rerun leaves the old rows in place.
 *
 * Failure modes: over the cost cap stops the job (BudgetExceeded, nothing replaced). One search group
 * failing is logged and reported in `failedGroups`; all groups failing throws. No retry beyond the
 * SDK's one; rerunning the plan is the recovery path.
 */
export const MAX_SIGNALS = 18;
export const MIN_SIGNALS = 12;
const WINDOW_DAYS = 14;
const FETCH_CONCURRENCY = 4;
/** Trends, entertainment and seasonal events are about the air week, so an older page is still current. */
const EVENT_FACTORS = new Set([4, 8, 9]);

export interface SignalRow {
  headline: string; publisher: string | null; url: string; factors: number[]; fits_weeks: number[]; idea: string | null;
  published_at: string | null; date_confirmed: boolean; fetched_ok: boolean; dropped_reason: string | null;
}
export interface SignalsResult { kept: number; dropped: number; short: boolean; failedGroups: string[]; }

export function shiftDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Same page, ignoring www, trailing slash, query and fragment. */
export function urlKey(raw: string): string {
  try { const u = new URL(raw); return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase(); } catch { return raw; }
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'its', 'are', 'says', 'new', 'how', 'why']);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
/** Two headlines tell the same story when over half of their words overlap (two outlets, one event). */
export function sameStory(a: string, b: string): boolean {
  const x = words(a); const y = words(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) > 0.6 && shared >= 3;
}

export async function vet(c: Candidate, from: string, today: string, fetchPage: FetchPage): Promise<SignalRow> {
  const base = { headline: c.headline, publisher: c.publisher || null, factors: normalizeFactors(c.factors), fits_weeks: [...new Set(c.fits_weeks)].sort((a, b) => a - b), idea: c.idea || null };
  const drop = (url: string, reason: string, fetched = false): SignalRow => ({ ...base, url: url.slice(0, 1000), published_at: null, date_confirmed: false, fetched_ok: fetched, dropped_reason: reason.slice(0, 200) });
  let page = await fetchPage(c.url);
  if (!page.ok && c.alternate_url && urlKey(c.alternate_url) !== urlKey(c.url)) {
    const first = page.reason;
    page = await fetchPage(c.alternate_url);
    if (!page.ok) return drop(c.url, `${first}; alternate ${page.reason}`);
  }
  if (!page.ok) return drop(c.url, page.reason);
  const facts = readPage(page.html);
  // The page's own title wins: the search answer's headline may be paraphrased or invented.
  const headline = (facts.title || c.headline).slice(0, 500);
  if (facts.date && facts.date > today) return { ...drop(page.url, `page date ${facts.date} is in the future`, true), headline };
  if (facts.date && facts.date < from && !base.factors.some((f) => EVENT_FACTORS.has(f))) {
    return { ...drop(page.url, `published ${facts.date}, before ${from}`, true), headline };
  }
  const idea = base.idea && lintField({ path: 'idea', kind: 'voiceover', text: base.idea }).length ? null : base.idea;
  return { ...base, idea, headline, url: page.url.slice(0, 1000), published_at: facts.date, date_confirmed: facts.date !== null, fetched_ok: true, dropped_reason: null };
}

/** Pure: mark duplicates and anything past 18 as dropped; confirmed dates and more factors rank first. */
export function selectSignals(rows: SignalRow[]): SignalRow[] {
  const order = rows.map((r, i) => ({ r, i })).sort((a, b) => Number(b.r.date_confirmed) - Number(a.r.date_confirmed)
    || b.r.factors.length - a.r.factors.length || String(b.r.published_at).localeCompare(String(a.r.published_at)) || a.i - b.i);
  const kept: SignalRow[] = []; const out: SignalRow[] = []; const seen = new Set<string>();
  for (const { r } of order) {
    if (seen.has(urlKey(r.url))) continue; // the same page twice is one row
    seen.add(urlKey(r.url));
    if (r.dropped_reason) { out.push(r); continue; }
    const dup = kept.find((k) => sameStory(k.headline, r.headline));
    if (dup) out.push({ ...r, dropped_reason: `same story as ${dup.url}`.slice(0, 200) });
    else if (kept.length >= MAX_SIGNALS) out.push({ ...r, dropped_reason: `over the ${MAX_SIGNALS} limit` });
    else { kept.push(r); out.push(r); }
  }
  return out;
}

export interface SignalsDeps { search?: typeof realSearch; fetchPage?: FetchPage; today?: string; }

export async function runSignals(input: { planId: string; airDate: string; forceNews?: string; avoid?: string }, deps: SignalsDeps = {}): Promise<SignalsResult> {
  const { search = realSearch, fetchPage = realFetch, today = centralDate() } = deps;
  const s: SearchInput = { ...input, from: shiftDays(input.airDate < today ? input.airDate : today, -WINDOW_DAYS), to: today };
  const candidates: Candidate[] = []; const failedGroups: string[] = [];
  for (const group of FACTOR_GROUPS) {
    try { candidates.push(...await search(group, s)); } catch (e) {
      if (e instanceof BudgetExceeded) throw e;
      failedGroups.push(group.join('+'));
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'weekly_live.signals_search', outcome: 'failure', error_class: classifyError(e), context: { plan_id: input.planId, group } }));
    }
  }
  if (failedGroups.length === FACTOR_GROUPS.length) throw Object.assign(new Error('Every news search failed. Try again in a few minutes.'), { name: 'UpstreamUnavailable' });
  const vetted: SignalRow[] = [];
  for (let i = 0; i < candidates.length; i += FETCH_CONCURRENCY) {
    vetted.push(...await Promise.all(candidates.slice(i, i + FETCH_CONCURRENCY).map((c) => vet(c, s.from, today, fetchPage))));
  }
  const rows = selectSignals(vetted);
  await sequelize.transaction(async (transaction) => {
    await WeeklyLiveSignal.destroy({ where: { plan_id: input.planId }, transaction });
    await WeeklyLiveSignal.bulkCreate(rows.map((r) => ({ ...r, plan_id: input.planId })), { transaction });
  });
  const kept = rows.filter((r) => !r.dropped_reason).length;
  const result = { kept, dropped: rows.length - kept, short: kept < MIN_SIGNALS, failedGroups };
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'weekly_live.signals', outcome: failedGroups.length || result.short ? 'partial' : 'success', context: { plan_id: input.planId, ...result } }));
  return result;
}
