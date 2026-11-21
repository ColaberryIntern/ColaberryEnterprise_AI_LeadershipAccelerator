/**
 * enterpriseIntakeNews - recent news about the company and AI in its industry (v2, 2026-11-21).
 *
 * Ali: "we do our research, you, your industry, trends, news, updates, AI etc." The research
 * step used to read only the company's website. This adds two Google News searches (the public
 * RSS search feed: no key, no cost): the company by name, and AI in its industry.
 *
 * Only headlines WE fetched can reach the brief: the model may pick and explain them, and
 * `keepFetched` drops any headline that is not one of these (so no invented news).
 *
 * Failure handling: one 10s timeout per search; any failure (network, non-200, unreadable feed)
 * returns [] and research carries on without news. Never throws.
 */
import { parseRssFeed } from '../intel/rssParser';

export interface NewsItem {
  headline: string;
  date: string | null;
  url: string | null;
}

const FEED = 'https://news.google.com/rss/search';
const TIMEOUT_MS = 10_000;
const MAX_ITEMS = 8;
const MAX_AGE_DAYS = 180;
const MAX_FEED_BYTES = 2_000_000;

export const newsUrl = (query: string): string => `${FEED}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

export async function searchNews(query: string, now = new Date()): Promise<NewsItem[]> {
  const q = query.trim();
  if (!q) return [];
  const started = Date.now();
  try {
    const r = await fetch(newsUrl(q), {
      headers: { 'User-Agent': 'Colaberry AI Ops', Accept: 'application/rss+xml, application/xml' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw Object.assign(new Error(`news feed ${r.status}`), { error_class: 'UpstreamUnavailable' });
    const xml = (await r.text()).slice(0, MAX_FEED_BYTES);
    const oldest = now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const items = parseRssFeed(xml, 'google-news')
      .filter((x) => x.title && (!x.publishedAt || x.publishedAt.getTime() >= oldest))
      .slice(0, MAX_ITEMS)
      .map((x) => ({ headline: x.title.slice(0, 300), date: x.publishedAt ? x.publishedAt.toISOString().slice(0, 10) : null, url: x.url }));
    console.log(JSON.stringify({ level: 'info', service: 'enterprise-intake-news', event: 'enterprise_news_fetched', outcome: 'success',
      duration_ms: Date.now() - started, context: { items: items.length } }));
    return items;
  } catch (err) {
    const name = (err as Error)?.name;
    console.warn(JSON.stringify({ level: 'warn', service: 'enterprise-intake-news', event: 'enterprise_news_failed', outcome: 'failure',
      error_class: name === 'TimeoutError' || name === 'AbortError' ? 'TimeoutError' : (err as { error_class?: string })?.error_class || 'UpstreamUnavailable',
      duration_ms: Date.now() - started, context: { message: String((err as Error)?.message || err).slice(0, 200) } }));
    return [];
  }
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'our', 'we', 'you', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'by', 'home', 'welcome', 'inc', 'llc', 'company']);

/** A few words that say what the company does: the site description, else its title, else the department. */
export function industryHint(page: { title?: string; description?: string } | null, department: string): string {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const fromSite = words(page?.description || '').slice(0, 5);
  if (fromSite.length >= 2) return fromSite.join(' ');
  const fromTitle = words(page?.title || '').slice(0, 4);
  if (fromTitle.length >= 2) return fromTitle.join(' ');
  return department && !['Company-wide', 'Other'].includes(department) ? department.toLowerCase() : 'business operations';
}

/** Company news, and AI news for the industry. Both may be empty. */
export async function companyAndIndustryNews(
  company: string,
  page: { title?: string; description?: string } | null,
  department: string,
): Promise<{ company: NewsItem[]; industry: NewsItem[]; industryQuery: string }> {
  const industryQuery = `${industryHint(page, department)} artificial intelligence`;
  const [c, ind] = await Promise.all([company.trim() ? searchNews(`"${company.trim()}"`) : Promise.resolve([]), searchNews(industryQuery)]);
  return { company: c, industry: ind, industryQuery };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Google News titles end in " - <Source>"; the model often drops it when it copies a headline. */
export const withoutSource = (headline: string): string => headline.replace(/\s+[-|]\s+[^-|]{1,60}$/, '').trim();

/** The same headline, allowing the dropped source and a little trimming at the end (not a rewrite). */
function sameHeadline(picked: string, fetched: string): boolean {
  const p = norm(picked);
  const full = norm(fetched);
  const bare = norm(withoutSource(fetched));
  if (!p) return false;
  if (p === full || p === bare) return true;
  // A shortened copy: the model's text is the start of ours and keeps most of it.
  return p.length >= 20 && bare.startsWith(p) && p.length >= bare.length * 0.8;
}

/**
 * Keep only the model's items whose headline is one we fetched, and take the headline, date and
 * link from the feed, never from the model. Live check 2026-11-21: exact matching dropped every
 * headline, because the model left off Google's " - Source" suffix.
 */
export function keepFetched<T extends { headline: string }>(picked: T[], fetched: NewsItem[]): Array<T & { date: string | null; url: string | null }> {
  const out: Array<T & { date: string | null; url: string | null }> = [];
  const used = new Set<NewsItem>();
  for (const p of picked) {
    const f = fetched.find((x) => !used.has(x) && sameHeadline(p.headline, x.headline));
    if (!f) continue;
    used.add(f);
    out.push({ ...p, headline: f.headline, date: f.date, url: f.url });
  }
  return out;
}

export const headlinesForPrompt = (label: string, items: NewsItem[]): string =>
  `${label}:\n${items.length ? items.map((x) => `- ${x.headline}${x.date ? ` (${x.date})` : ''}`).join('\n') : 'none found'}`;
