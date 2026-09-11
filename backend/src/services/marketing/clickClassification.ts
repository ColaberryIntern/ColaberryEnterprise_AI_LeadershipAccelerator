import crypto from 'crypto';

/**
 * Classifying an inbound click. PURE — no I/O, no database, no request object.
 *
 * ── The case that actually matters here is not crawlers ───────────────────────────────
 *
 * Search-engine spiders are the obvious bots, and they are the least important ones. The
 * expensive case for a marketing system is the SOCIAL PLATFORM LINK PREVIEW FETCHER:
 * `facebookexternalhit`, `LinkedInBot`, `Twitterbot`, `Slackbot`, `WhatsApp`, `TelegramBot`.
 *
 * Every one of those fetches a link the moment it is posted, in order to render the preview
 * card. So on a marketing platform they arrive on EXACTLY the links we care about, at exactly
 * the moment we start caring, and several of them fetch more than once. Counting them means
 * every post begins life with phantom clicks that never came from a person, and cost-per-click
 * is computed against an inflated denominator. That is not a rounding error — it is a number
 * that looks plausible and is wrong.
 *
 * They are recorded, not discarded: `link_clicks` keeps the row with `is_bot = true` and a
 * reason, so the filtering is auditable and reversible. Deleting them would make the
 * classification unfalsifiable, and a bot heuristic that cannot be checked against what it
 * excluded is one nobody can trust later.
 */

export interface BotVerdict {
  isBot: boolean;
  /** Short, stable reason — stored in `link_clicks.bot_reason`, so keep it queryable. */
  reason: string | null;
}

/**
 * Ordered most-specific first, so the recorded reason is the useful one.
 *
 * Each entry is a lowercase substring, not a regex: user-agent strings are attacker- and
 * vendor-controlled, and a regex over untrusted input is a ReDoS surface for no benefit here.
 */
const BOT_SIGNATURES: Array<[string, string]> = [
  // Social preview fetchers — the ones that matter, see the header.
  ['facebookexternalhit', 'social_preview_facebook'],
  ['facebookcatalog', 'social_preview_facebook'],
  ['linkedinbot', 'social_preview_linkedin'],
  ['twitterbot', 'social_preview_twitter'],
  ['slackbot', 'social_preview_slack'],
  ['telegrambot', 'social_preview_telegram'],
  ['whatsapp', 'social_preview_whatsapp'],
  ['discordbot', 'social_preview_discord'],
  ['pinterest', 'social_preview_pinterest'],
  ['redditbot', 'social_preview_reddit'],
  ['bingpreview', 'social_preview_bing'],
  ['skypeuripreview', 'social_preview_skype'],
  ['embedly', 'social_preview_embedly'],
  ['quora link preview', 'social_preview_quora'],
  ['outlook-ios', 'mail_preview_outlook'],
  ['google-safety', 'safety_scanner_google'],
  ['barracuda', 'safety_scanner_barracuda'],
  ['proofpoint', 'safety_scanner_proofpoint'],
  ['mimecast', 'safety_scanner_mimecast'],
  ['symantec', 'safety_scanner_symantec'],

  // Search and SEO crawlers.
  ['googlebot', 'crawler_google'],
  ['bingbot', 'crawler_bing'],
  ['duckduckbot', 'crawler_duckduckgo'],
  ['yandexbot', 'crawler_yandex'],
  ['baiduspider', 'crawler_baidu'],
  ['ahrefsbot', 'crawler_seo'],
  ['semrushbot', 'crawler_seo'],
  ['mj12bot', 'crawler_seo'],
  ['dotbot', 'crawler_seo'],
  ['slurp', 'crawler_yahoo'],
  ['applebot', 'crawler_apple'],

  // Automation and scripted clients.
  ['headlesschrome', 'automation_headless'],
  ['phantomjs', 'automation_headless'],
  ['puppeteer', 'automation_headless'],
  ['playwright', 'automation_headless'],
  ['selenium', 'automation_headless'],
  ['python-requests', 'automation_script'],
  ['python-urllib', 'automation_script'],
  ['go-http-client', 'automation_script'],
  ['java/', 'automation_script'],
  ['okhttp', 'automation_script'],
  ['axios/', 'automation_script'],
  ['node-fetch', 'automation_script'],
  ['curl/', 'automation_script'],
  ['wget/', 'automation_script'],
  ['libwww-perl', 'automation_script'],
  ['httpclient', 'automation_script'],

  // Generic catch-alls LAST, so a specific match wins the reason.
  ['bot', 'generic_bot'],
  ['crawler', 'generic_crawler'],
  ['spider', 'generic_spider'],
  ['scraper', 'generic_scraper'],
  ['monitoring', 'generic_monitor'],
  ['uptime', 'generic_monitor'],
  ['preview', 'generic_preview'],
];

/**
 * Is this user agent a non-human client?
 *
 * A MISSING user agent counts as a bot. Effectively every real browser sends one, so its
 * absence means a scripted client or something deliberately hiding — and for a click counter
 * the safe default is to exclude rather than inflate. The reason is recorded distinctly so the
 * decision can be revisited against real data rather than argued about.
 */
export function classifyUserAgent(userAgent: string | null | undefined): BotVerdict {
  if (typeof userAgent !== 'string' || userAgent.trim() === '') {
    return { isBot: true, reason: 'missing_user_agent' };
  }
  const ua = userAgent.toLowerCase();

  // Match on POSITION IN THE STRING, not position in the list.
  //
  // A first-match-in-list-order scan gets this wrong, and a real user agent proves it:
  // Telegram identifies itself as `TelegramBot (like TwitterBot)`, so it contains BOTH
  // signatures and a list scan credits whichever we happened to write down first. Reordering
  // the list to fix that is whack-a-mole — the next agent that name-drops another breaks it
  // again.
  //
  // The identifying product token comes FIRST in a user agent; anything mentioned later is
  // compatibility noise ("like Gecko", "like TwitterBot"). So the earliest match in the string
  // is the actual client. List order still breaks ties, which is what keeps the specific
  // signatures ahead of the generic catch-alls when both begin at the same index.
  let best: { index: number; reason: string } | null = null;
  for (let i = 0; i < BOT_SIGNATURES.length; i += 1) {
    const [needle, reason] = BOT_SIGNATURES[i];
    const at = ua.indexOf(needle);
    if (at === -1) continue;
    if (best === null || at < best.index) best = { index: at, reason };
  }

  return best ? { isBot: true, reason: best.reason } : { isBot: false, reason: null };
}

/** Platform click IDs promoted to their own indexed columns. */
export const NORMALIZED_CLICK_ID_KEYS = ['fbclid', 'gclid', 'msclkid', 'ttclid'] as const;
export type NormalizedClickIdKey = typeof NORMALIZED_CLICK_ID_KEYS[number];

/** Click IDs kept in the JSONB overflow until a platform is adopted properly. */
const OVERFLOW_CLICK_ID_KEYS = [
  'wbraid', 'gbraid', 'li_fat_id', 'epik', 'twclid', 'scid', 'igshid', 'irclickid',
];

export interface ExtractedClickIds {
  fbclid: string | null;
  gclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
  /** Everything recognised but not yet promoted to a column. */
  click_ids: Record<string, string>;
}

/** Query values arrive as string | string[] | undefined from Express. */
function firstString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (Array.isArray(value)) {
    // Express gives an array when a parameter repeats. Take the first and ignore the rest -
    // a repeated click ID is either a mistake or an attempt to confuse the parser, and
    // concatenating them would store a value no platform ever issued.
    for (const v of value) {
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
  }
  return null;
}

/** Long enough for any real click ID; short enough that nobody stuffs a payload into one. */
const MAX_CLICK_ID_LENGTH = 255;

/**
 * Pulls platform click IDs out of a query object.
 *
 * Truncates rather than rejects: an over-long value is far more likely to be a tracking
 * parameter we have not seen than an attack, and dropping the click entirely to punish a long
 * string would lose real attribution. The column is VARCHAR(255), so this also stops a long
 * value failing the insert and taking the whole click row with it.
 */
export function extractClickIds(query: Record<string, unknown>): ExtractedClickIds {
  const out: ExtractedClickIds = {
    fbclid: null, gclid: null, msclkid: null, ttclid: null, click_ids: {},
  };

  for (const key of NORMALIZED_CLICK_ID_KEYS) {
    const v = firstString(query[key]);
    if (v) out[key] = v.slice(0, MAX_CLICK_ID_LENGTH);
  }
  for (const key of OVERFLOW_CLICK_ID_KEYS) {
    const v = firstString(query[key]);
    if (v) out.click_ids[key] = v.slice(0, MAX_CLICK_ID_LENGTH);
  }
  return out;
}

export interface UrlAttribution extends ExtractedClickIds {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

/** UTM values are stored in VARCHAR(200) columns; truncate rather than fail the insert. */
const MAX_UTM_LENGTH = 200;

/**
 * Reads attribution out of the LANDING PAGE URL, server-side.
 *
 * ── Why the URL and not the request body ──────────────────────────────────────────────
 *
 * The browser tracker already sends `page_url`, and the UTMs and click IDs are IN it — they
 * are what the ad platform appended when it sent the visitor. Parsing them here rather than
 * reading separate body fields has one decisive advantage: **adopting a new click ID becomes a
 * backend change alone.** The alternative means shipping a frontend release, and waiting for
 * every cached copy of the tracker to refresh, before a single click of a new platform can be
 * attributed.
 *
 * That is not hypothetical for this codebase. The tracker sends `utm_source`, `utm_campaign`
 * and `utm_medium` as body fields, and `utm_term`/`utm_content` were never added — so they
 * have been unavailable server-side for as long as the tracker has existed, despite being
 * present in the URL of every click that carried them.
 *
 * Neither source is trustworthy: both are client-supplied, and neither is used for any
 * authorization decision. This is analytics data, and the URL is the more faithful record of
 * what actually happened.
 */
export function extractAttributionFromUrl(pageUrl: string | null | undefined): UrlAttribution {
  const empty: UrlAttribution = {
    utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
    fbclid: null, gclid: null, msclkid: null, ttclid: null, click_ids: {},
  };
  if (typeof pageUrl !== 'string' || pageUrl.trim() === '') return empty;

  let params: URLSearchParams;
  try {
    params = new URL(pageUrl).searchParams;
  } catch {
    // A relative or malformed page_url is not an error worth failing a page view over - the
    // tracker fires on real navigations and this is a best-effort read. Returning empty
    // attribution loses one row's provenance; throwing would lose the page view entirely.
    return empty;
  }

  const query: Record<string, unknown> = {};
  params.forEach((value, key) => {
    // First value wins on a repeat, matching extractClickIds.
    if (!(key in query)) query[key] = value;
  });

  const clickIds = extractClickIds(query);
  const utm = (key: string): string | null => {
    const v = params.get(key);
    return v && v.trim() !== '' ? v.slice(0, MAX_UTM_LENGTH) : null;
  };

  return {
    ...clickIds,
    utm_source: utm('utm_source'),
    utm_medium: utm('utm_medium'),
    utm_campaign: utm('utm_campaign'),
    utm_content: utm('utm_content'),
    utm_term: utm('utm_term'),
  };
}

/**
 * SHA-256 of the client IP. The raw address is never returned, and never stored.
 *
 * Matches what `qrRedirectRoutes` already does. The hash still supports unique-visitor counts
 * and abuse detection, which is all a click log needs; the address itself is personal data
 * with a retention cost and no additional analytic value here.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (typeof ip !== 'string' || ip.trim() === '') return null;
  return crypto.createHash('sha256').update(ip.trim()).digest('hex');
}

/**
 * The client IP from a proxied request.
 *
 * `x-forwarded-for` is a client-settable header, so this value is NOT trustworthy for
 * authorization — and it is not used for any. It feeds a hash used for unique-ish counting,
 * where a spoofed value costs an inaccurate count and nothing more. Recorded because the same
 * header read in an access-control decision would be a vulnerability.
 */
export function clientIpFrom(
  headers: Record<string, unknown>,
  fallback?: string | null,
): string | null {
  const xff = headers['x-forwarded-for'];
  const raw = firstString(xff);
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return fallback && fallback.trim() !== '' ? fallback : null;
}
