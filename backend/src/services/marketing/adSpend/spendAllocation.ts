/**
 * Turn stored spend facts into "how much did each campaign spend in this window", without double
 * counting and without inventing days nobody recorded.
 *
 * ── ONE CAMPAIGN, HOWEVER IT WAS WRITTEN DOWN ──
 *
 * The Meta sync keys a campaign by its numeric id; an Ads Manager export without the Campaign ID
 * column, or a person typing, keys it by name. Those are the same campaign. Any fact that carries
 * both an id and a name teaches the alias, and every fact keyed by that name is filed under the id.
 * Campaigns are also kept apart by platform: a Google campaign and a Meta campaign that happen to
 * share a name are two campaigns, and one must never replace the other's spend.
 *
 * ── ONE FIGURE PER CAMPAIGN PER DAY ──
 *
 * The same day can be recorded several ways. For each campaign-day exactly one set of rows counts:
 *   1. the highest-priority SOURCE that covers the day: meta_api > csv > manual
 *      (the platform's own numbers beat a copy of them, a copy beats a typed estimate);
 *   2. within that source, the most SPECIFIC rows: a single-day row beats a weekly total, which
 *      beats a monthly one (so a month typed up front and the daily figures typed later do not add);
 *   3. within those, a placement breakdown (facebook, instagram) beats an unsplit total for the
 *      same day, and placements are then summed;
 *   4. if two equally specific ranges still overlap (Oct 1-7 and Oct 2-8, both typed), the later
 *      one counts. That last rule is a tie-break, not a measurement.
 * A typed weekly total still counts for any day nothing better covers, so a team that enters spend
 * by hand and later connects Facebook loses nothing.
 *
 * ── RANGES ARE SPREAD EVENLY ──
 *
 * "$700 for Oct 1-7" is $100 a day, so a window that cuts the week in half takes half. That is an
 * assumption about pacing, stated so nobody mistakes it for a measurement. Integer cents: the
 * remainder goes to the first days, so a row's parts always add back to the row exactly.
 *
 * ── COVERAGE IS PART OF THE ANSWER ──
 *
 * Missing days make ads look cheaper, so the allocation reports which days had any spend and the
 * last such day. Pure: dates are ISO 'YYYY-MM-DD', stepped as UTC calendar days, so no DST shift
 * can move one.
 */

export type SpendSource = 'meta_api' | 'csv' | 'manual';

export interface SpendFact {
  platform: string;
  campaignRef: string;
  campaignName: string | null;
  placement: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  source: SpendSource;
}

export interface CampaignSpend {
  /** platform + canonical campaign ref, lower-cased. Unique per campaign. */
  key: string;
  platform: string;
  /** The id when one is known, else the name it was recorded under. */
  campaignRef: string;
  campaignName: string | null;
  /** Every ref and name this campaign was recorded under, normalised. utm_campaign is matched against these. */
  aliases: string[];
  spendCents: number;
  /** Spend by placement ('facebook', 'instagram', ...). '' holds spend with no placement breakdown. */
  byPlacementCents: Record<string, number>;
  sources: SpendSource[];
  daysWithSpend: number;
  lastDay: string | null;
}

export interface SpendAllocation {
  campaigns: CampaignSpend[];
  totalCents: number;
  daysCovered: number;
  windowDays: number;
  lastDayRecorded: string | null;
}

const PRIORITY: Record<SpendSource, number> = { meta_api: 3, csv: 2, manual: 1 };
const DAY_MS = 86_400_000;

export const normaliseRef = (ref: string): string => ref.trim().toLowerCase();

const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Every calendar day from start to end inclusive. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toMs(start); t <= toMs(end); t += DAY_MS) out.push(toDay(t));
  return out;
}

interface Candidate { source: SpendSource; span: number; placement: string; cents: number; periodStart: string }

/** Rules 1-4 above: the cents by placement that count for one campaign-day. */
export function resolveDay(candidates: Candidate[]): { source: SpendSource; byPlacement: Record<string, number> } | null {
  if (candidates.length === 0) return null;
  const best = Math.max(...candidates.map((c) => PRIORITY[c.source]));
  let pool = candidates.filter((c) => PRIORITY[c.source] === best);
  const minSpan = Math.min(...pool.map((c) => c.span));
  pool = pool.filter((c) => c.span === minSpan);
  if (pool.some((c) => c.placement !== '')) pool = pool.filter((c) => c.placement !== '');
  // Rule 4: one row per placement - the latest-starting one when equal ranges overlap.
  const perPlacement = new Map<string, Candidate>();
  for (const c of pool) {
    const cur = perPlacement.get(c.placement);
    if (!cur || c.periodStart > cur.periodStart) perPlacement.set(c.placement, c);
  }
  const byPlacement: Record<string, number> = {};
  perPlacement.forEach((c, p) => { byPlacement[p] = c.cents; });
  return { source: pool[0].source, byPlacement };
}

export function allocateSpend(facts: SpendFact[], windowStart: string, windowEnd: string): SpendAllocation {
  const windowSet = new Set(daysBetween(windowStart, windowEnd));
  const valid = facts.filter((f) => f.amountCents >= 0 && f.periodEnd >= f.periodStart && normaliseRef(f.campaignRef));

  // Learn name -> id per platform from any fact that carries both.
  const aliasToRef = new Map<string, string>();
  for (const f of valid) {
    const ref = normaliseRef(f.campaignRef);
    const name = f.campaignName ? normaliseRef(f.campaignName) : '';
    if (name && name !== ref) aliasToRef.set(`${f.platform}|${name}`, ref);
  }
  const canonical = (f: SpendFact) => {
    const ref = normaliseRef(f.campaignRef);
    return `${f.platform}|${aliasToRef.get(`${f.platform}|${ref}`) ?? ref}`;
  };

  const grid = new Map<string, Map<string, Candidate[]>>();
  const meta = new Map<string, { platform: string; campaignRef: string; campaignName: string | null; aliases: Set<string>; idKnown: boolean }>();

  for (const f of valid) {
    const key = canonical(f);
    const ref = normaliseRef(f.campaignRef);
    const isId = key === `${f.platform}|${ref}`;
    const m = meta.get(key) ?? { platform: f.platform, campaignRef: f.campaignRef.trim(), campaignName: null, aliases: new Set<string>(), idKnown: false };
    m.aliases.add(ref);
    if (f.campaignName) { m.aliases.add(normaliseRef(f.campaignName)); m.campaignName = m.campaignName ?? f.campaignName.trim(); }
    if (isId && !m.idKnown) { m.campaignRef = f.campaignRef.trim(); m.idKnown = true; }
    meta.set(key, m);

    const days = daysBetween(f.periodStart, f.periodEnd);
    const base = Math.floor(f.amountCents / days.length);
    let remainder = f.amountCents - base * days.length;
    let byDay = grid.get(key);
    if (!byDay) { byDay = new Map(); grid.set(key, byDay); }
    for (const day of days) {
      const cents = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      if (!windowSet.has(day)) continue;
      const list = byDay.get(day) ?? [];
      list.push({ source: f.source, span: days.length, placement: f.placement, cents, periodStart: f.periodStart });
      byDay.set(day, list);
    }
  }

  const coveredDays = new Set<string>();
  const campaigns: CampaignSpend[] = [];
  grid.forEach((byDay, key) => {
    const m = meta.get(key)!;
    const c: CampaignSpend = {
      key, platform: m.platform, campaignRef: m.campaignRef, campaignName: m.campaignName,
      aliases: Array.from(m.aliases).sort(), spendCents: 0, byPlacementCents: {}, sources: [], daysWithSpend: 0, lastDay: null,
    };
    const sources = new Set<SpendSource>();
    byDay.forEach((candidates, day) => {
      const chosen = resolveDay(candidates);
      if (!chosen) return;
      coveredDays.add(day);
      sources.add(chosen.source);
      c.daysWithSpend += 1;
      if (!c.lastDay || day > c.lastDay) c.lastDay = day;
      for (const [placement, cents] of Object.entries(chosen.byPlacement)) {
        c.spendCents += cents;
        c.byPlacementCents[placement] = (c.byPlacementCents[placement] ?? 0) + cents;
      }
    });
    c.sources = (['meta_api', 'csv', 'manual'] as SpendSource[]).filter((s) => sources.has(s));
    if (c.daysWithSpend > 0) campaigns.push(c);
  });

  campaigns.sort((a, b) => b.spendCents - a.spendCents || a.key.localeCompare(b.key));
  return {
    campaigns,
    totalCents: campaigns.reduce((t, c) => t + c.spendCents, 0),
    daysCovered: coveredDays.size,
    windowDays: windowSet.size,
    lastDayRecorded: Array.from(coveredDays).sort().pop() ?? null,
  };
}
