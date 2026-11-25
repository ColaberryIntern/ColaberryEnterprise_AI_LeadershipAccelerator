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
 * Fewer than 12 triggers ONE more search round that names
 * what was found; still fewer is reported as `short`, never padded. Re-running a plan replaces its rows in one
 * transaction, so a rerun never duplicates and a failed rerun leaves the old rows in place.
 *
 * Failure modes: over the cost cap stops the job (BudgetExceeded, nothing replaced). One search group
 * failing is logged and reported in `failedGroups`; all groups failing throws. No automatic retry
 * (one reservation pays for one call); rerunning the plan is the recovery path.
 */
export const MAX_SIGNALS = 18;
export const MIN_SIGNALS = 12;
const WINDOW_DAYS = 14;
const FETCH_CONCURRENCY = 4;
/** Trends, entertainment and seasonal events are about the air week, so an older page is still current. */
const EVENT_FACTORS = new Set([4, 8, 9]);
/** ...but not any age: a season schedule is published months ahead, an old page is not about this week. */
const EVENT_MAX_AGE_DAYS = 210;
/** When the air date is far out, [air date - 14, today] is too short or empty, so search at least this many days. */
const MIN_WINDOW_DAYS = 7;

export interface SignalRow {
  headline: string; publisher: string | null; url: string; factors: number[]; fits_weeks: number[]; idea: string | null;
  published_at: string | null; date_confirmed: boolean; fetched_ok: boolean; dropped_reason: string | null;
}
export interface SignalsResult { kept: number; dropped: number; short: boolean; failedGroups: string[]; }

export function shiftDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The search window's first day: air date - 14, but never less than 7 days before today. */
export function windowStart(airDate: string, today: string): string {
  const spec = shiftDays(airDate, -WINDOW_DAYS); const latest = shiftDays(today, -MIN_WINDOW_DAYS);
  return spec < latest ? spec : latest;
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|src$|cmpid$)/i;
/** Same page, ignoring www, trailing slash, fragment and tracking parameters. Other parameters can name the page. */
export function urlKey(raw: string): string {
  try { const u = new URL(raw); const q = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).map(([k, v]) => `${k}=${v}`).sort().join('&'); return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase() + (q && `?${q}`); } catch { return raw; }
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

/** An undated page whose address does not name a story (a home page, /news/) is an index, not a signal. */
export function namesAStory(url: string): boolean {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  return /[-_][^-_]+[-_]/.test(last) || /\d{5,}/.test(last);
}

/** Roundups and newsletters retell many stories, so they cannot date or source any one of them. */
const ROUNDUP = /\b(round-?up|newsletter|digest|news (bytes|briefs?|flash)|week(ly)? in (ai|review)|(news|ai) (this|of the) week|this week in|the week of|weekly (brief|recap|wrap))\b/i;
export function isRoundup(headline: string, url: string): boolean {
  return ROUNDUP.test(headline) || /\/(weekly|newsletters?|roundup|digest)s?\//i.test(new URL(url).pathname);
}

export async function vet(c: Candidate, from: string, today: string, fetchPage: FetchPage): Promise<SignalRow> {
  const base = { headline: c.headline, publisher: c.publisher || null, factors: normalizeFactors(c.factors), fits_weeks: [...new Set(c.fits_weeks)].sort((a, b) => a - b), idea: c.idea || null };
  const drop = (url: string, reason: string, fetched = false): SignalRow => ({ ...base, url: url.slice(0, 1000), published_at: null, date_confirmed: false, fetched_ok: fetched, dropped_reason: reason.slice(0, 200) });
  let page = await fetchPage(c.url); let alternate = false;
  if (!page.ok && c.alternate_url && urlKey(c.alternate_url) !== urlKey(c.url)) {
    const first = page.reason;
    page = await fetchPage(c.alternate_url); alternate = true;
    if (!page.ok) return drop(c.url, `${first}; alternate ${page.reason}`);
  }
  if (!page.ok) return drop(c.url, page.reason);
  const facts = readPage(page.html);
  // The page's own title wins: the search answer's headline may be paraphrased or invented.
  const headline = (facts.title || c.headline).slice(0, 500);
  // The outlet whose page was read: the named publisher belongs to the first URL only.
  if (facts.site) base.publisher = facts.site;
  else if (alternate) base.publisher = new URL(page.url).hostname.replace(/^www\./, '');
  if (isRoundup(headline, page.url)) return { ...drop(page.url, 'a roundup or newsletter, not one story', true), headline };
  if (facts.date && facts.date > today) return { ...drop(page.url, `page date ${facts.date} is in the future`, true), headline };
  if (!facts.date && !namesAStory(page.url)) return { ...drop(page.url, 'a home or index page, not one story', true), headline };
  const oldest = base.factors.some((f) => EVENT_FACTORS.has(f)) ? shiftDays(today, -EVENT_MAX_AGE_DAYS) : from;
  if (facts.date && facts.date < oldest) {
    return { ...drop(page.url, `published ${facts.date}, before ${oldest}`, true), headline };
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
  const s: SearchInput = { ...input, from: windowStart(input.airDate, today), to: today };
  const failedGroups = new Set<string>();
  const round = async (have: string[]): Promise<SignalRow[]> => {
    const found = await Promise.allSettled(FACTOR_GROUPS.map((group) => search(group, { ...s, have })));
    const candidates: Candidate[] = [];
    found.forEach((f, i) => {
      if (f.status === 'fulfilled') { candidates.push(...f.value); return; }
      if (f.reason instanceof BudgetExceeded) throw f.reason;
      failedGroups.add(FACTOR_GROUPS[i].join('+'));
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'weekly_live.signals_search', outcome: 'failure', error_class: classifyError(f.reason), context: { plan_id: input.planId, group: FACTOR_GROUPS[i] } }));
    });
    if (found.every((f) => f.status === 'rejected')) throw Object.assign(new Error('Every news search failed. Try again in a few minutes.'), { name: 'UpstreamUnavailable' });
    const vetted: SignalRow[] = [];
    for (let i = 0; i < candidates.length; i += FETCH_CONCURRENCY) {
      vetted.push(...await Promise.all(candidates.slice(i, i + FETCH_CONCURRENCY).map((c) => vet(c, s.from, today, fetchPage))));
    }
    return vetted;
  };
  const first = await round([]);
  let rows = selectSignals(first);
  const keptNow = rows.filter((r) => !r.dropped_reason);
  if (keptNow.length < MIN_SIGNALS) {
    // The extra round is a bonus: if it fails or hits the cap, the first round still stands.
    try { rows = selectSignals([...first, ...await round(keptNow.map((r) => r.headline))]); } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'weekly_live.signals_topup', outcome: 'failure', error_class: e instanceof BudgetExceeded ? 'BudgetExceeded' : classifyError(e), context: { plan_id: input.planId } }));
    }
  }
  await sequelize.transaction(async (transaction) => {
    await WeeklyLiveSignal.destroy({ where: { plan_id: input.planId }, transaction });
    await WeeklyLiveSignal.bulkCreate(rows.map((r) => ({ ...r, plan_id: input.planId })), { transaction });
  });
  const kept = rows.filter((r) => !r.dropped_reason).length;
  const result = { kept, dropped: rows.length - kept, short: kept < MIN_SIGNALS, failedGroups: [...failedGroups] };
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'weekly_live.signals', outcome: failedGroups.size || result.short ? 'partial' : 'success', context: { plan_id: input.planId, ...result } }));
  return result;
}
