/**
 * hireTalentDirectory - GET /api/public/hire/talent, assembled.
 *
 * The gate is `hireTalentIndex` (listed = published + public + a visible linked Hire case
 * study). Each listed person's card is built from their PUBLIC portfolio projection - the
 * same allow-list /portfolio/:slug serves - so the directory can never show more about a
 * person than their own public page does.
 *
 * AN EXPLICIT, BOUNDED CACHE. Building a public portfolio reads the profile, the resume,
 * the repository inventory and asks GitHub which repos a stranger can open. Per person, on
 * every directory load, that is too much. Cards are cached for 120s - the same window the
 * route's Cache-Control already promises - and at most 500 of them. The GATE is never
 * cached: a withdrawn publication drops the person on the next request, because the index
 * is recomputed every time and a card is only ever used for someone the index still lists.
 */
import { getPublicPortfolioBySlug } from '../career/careerPortfolioPageService';
import { loadHireIndex, type HireIndexEntry } from './hireTalentIndex';
import { readCaseStudyOrders } from './hireStudioSettings';
import { matchesQuery, toTalentCard, type HireTalentCard } from './hireTalentProjection';
import { HIRE_MAX_LIMIT, type HireTalentQuery } from './hireTalentQuery';

export interface HireTalentDirectory {
  readonly ok: true;
  readonly totals: { listed: number; caseStudies: number; verifiedCommits: number; industries: number };
  readonly spotlight: readonly HireTalentCard[];
  readonly spotlightSource: 'flagged' | 'latest';
  readonly talent: readonly HireTalentCard[];
  readonly facets: {
    track: readonly { key: string; count: number }[];
    industry: readonly { key: string; count: number }[];
    capability: readonly { key: string; count: number }[];
  };
  readonly nextCursor: string | null;
}

interface Listed { readonly card: HireTalentCard; readonly entry: HireIndexEntry }

const CARD_TTL_MS = 120_000;
const CARD_CACHE_MAX = 500;
const cardCache = new Map<string, { at: number; key: string; card: HireTalentCard }>();

/** Exposed for tests only: the cache must be resettable between cases. */
export function resetHireCardCache(): void { cardCache.clear(); }

async function cardFor(entry: HireIndexEntry, order: readonly string[], now: Date): Promise<HireTalentCard | null> {
  // Keyed on the inputs that change the card, so a re-publish, an availability edit or a new ★
  // misses.
  const key = JSON.stringify([entry.facts, entry.cases.map((c) => [c.slug, c.publishedAt, c.featured]), order]);
  const hit = cardCache.get(entry.page.slug);
  if (hit && hit.key === key && now.getTime() - hit.at < CARD_TTL_MS) return hit.card;
  // `null`: resolve NO case-study links. The card never shows them, and resolving them
  // here would re-run the gate per person (one loadPublishedRecordBySlug per linked row) -
  // the index above has already decided, in one batch, which case studies count.
  const result = await getPublicPortfolioBySlug(entry.page.slug, now, null);
  if (!result) return null; // unpublished between the index read and this one
  const card = toTalentCard(result.portfolio, entry.facts, entry.cases, order);
  if (cardCache.size >= CARD_CACHE_MAX) cardCache.delete(cardCache.keys().next().value as string);
  cardCache.set(entry.page.slug, { at: now.getTime(), key, card });
  return card;
}

const slugify = (v: string | null): string =>
  String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function latestPublished(l: Listed): string {
  return l.entry.cases.reduce((m, c) => (c.publishedAt > m ? c.publishedAt : m), '');
}

/** The ordering a sort key means. `featured`: spotlighted first, then most recent. */
export function sortListed(list: readonly Listed[], sort: HireTalentQuery['sort']): Listed[] {
  const byRecent = (a: Listed, b: Listed) => latestPublished(b).localeCompare(latestPublished(a)) || a.card.slug.localeCompare(b.card.slug);
  const out = [...list];
  if (sort === 'case_studies') return out.sort((a, b) => b.card.caseStudyCount - a.card.caseStudyCount || byRecent(a, b));
  if (sort === 'verified_commits') return out.sort((a, b) => b.card.verifiedCommitCount - a.card.verifiedCommitCount || byRecent(a, b));
  if (sort === 'newest') return out.sort(byRecent);
  return out.sort((a, b) => Number(b.card.spotlight) - Number(a.card.spotlight) || byRecent(a, b));
}

function facet(values: string[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Pure assembly over the listed set: filters, sort, spotlight, totals, facets, page. */
export function assembleDirectory(listed: readonly Listed[], query: HireTalentQuery): HireTalentDirectory {
  const industriesOf = (l: Listed) => [...new Set(l.entry.cases.map((c) => slugify(c.industry)).filter(Boolean))];
  const capsOf = (l: Listed) => l.card.capabilities.map((c) => slugify(c.name));

  const filtered = listed.filter((l) => (!query.track || l.card.track === query.track)
    && (!query.industry || industriesOf(l).includes(query.industry))
    && (!query.capability || capsOf(l).includes(query.capability))
    && (!query.q || matchesQuery(l.card, l.entry.cases, query.q)));

  const sorted = sortListed(filtered, query.sort);
  const limit = Math.min(query.limit ?? HIRE_MAX_LIMIT, HIRE_MAX_LIMIT);
  const offset = query.cursor ? Number(query.cursor) : 0;
  const pageItems = sorted.slice(offset, offset + limit);

  // Spotlight: admins' picks first (max 3). With none flagged, the three most recent
  // listings, labelled for what they are ('latest'), never presented as a pick.
  const flagged = sortListed(listed.filter((l) => l.card.spotlight), 'newest').slice(0, 3);
  const spotlight = flagged.length ? flagged : sortListed(listed, 'newest').slice(0, 3);

  return {
    ok: true,
    totals: {
      listed: listed.length,
      caseStudies: listed.reduce((n, l) => n + l.entry.cases.length, 0),
      verifiedCommits: listed.reduce((n, l) => n + l.card.verifiedCommitCount, 0),
      industries: new Set(listed.flatMap(industriesOf)).size,
    },
    spotlight: spotlight.map((l) => l.card),
    spotlightSource: flagged.length ? 'flagged' : 'latest',
    talent: pageItems.map((l) => l.card),
    facets: {
      track: facet(listed.map((l) => l.card.track ?? '')),
      industry: facet(listed.flatMap(industriesOf)),
      capability: facet(listed.flatMap(capsOf)),
    },
    nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
  };
}

/**
 * Every listed person's saved ★ order, in one read. If that read fails the directory still
 * answers, with the featured pick as each signature (what it showed before the order existed),
 * and the failure is logged: a missing ★ is not worth a 500 on the public directory.
 */
async function ordersFor(index: readonly HireIndexEntry[], now: Date): Promise<Map<string, string[]>> {
  try {
    return await readCaseStudyOrders(index.map((e) => e.page.enrollment_id));
  } catch (err: any) { // any thrown value: only name and message are read, both optional-chained
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'hire_talent_order_unread', outcome: 'partial', error_class: err?.name || 'Error',
      context: { listed: index.length, message: String(err?.message || '').slice(0, 200) },
    }));
    return new Map();
  }
}

/** The route's entry point. A database failure propagates (the route answers 500). */
export async function getHireTalentDirectory(query: HireTalentQuery, now: Date = new Date()): Promise<HireTalentDirectory> {
  const index = await loadHireIndex(['public']);
  const orders = await ordersFor(index, now);
  const listed: Listed[] = [];
  for (const entry of index) {
    try {
      // eslint-disable-next-line no-await-in-loop -- bounded by the listed set, and cached
      const card = await cardFor(entry, orders.get(entry.page.enrollment_id) ?? [], now);
      if (card) listed.push({ card, entry });
    } catch (err: any) { // any thrown value: only name and message are read, both optional-chained
      console.warn(JSON.stringify({
        timestamp: now.toISOString(), level: 'warn', service: 'backend',
        event: 'hire_talent_person_dropped', outcome: 'partial', error_class: err?.name || 'Error',
        context: { slug: entry.page.slug, message: String(err?.message || '').slice(0, 200) },
      }));
    }
  }
  return assembleDirectory(listed, query);
}
