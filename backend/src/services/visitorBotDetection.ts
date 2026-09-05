/**
 * Who on the live visitor list is a machine.
 *
 * WHAT THIS CATCHES, AND WHAT IT DOES NOT
 * This matches user agents that SAY they are crawlers. That is a real and large
 * share of the traffic — a 3-day sample of production held 412 sessions from
 * `Googlebot/2.1` and 37 from `Baiduspider-render/2.0`, all self-identifying in
 * the string.
 *
 * It does NOT catch a crawler that lies. The same sample held roughly 400 more
 * sessions spread evenly across `Chrome/135.0.0.0` through `Chrome/146.0.0.0`,
 * all "Windows NT 10.0; Win64; x64", ~30 sessions each — one scraper rotating
 * its version number behind a clean desktop string. Nothing in the user agent
 * distinguishes that from a real person, and pretending otherwise would put a
 * confident "human" label on a bot, which is worse than leaving it unlabelled.
 *
 * So the user-agent half is deliberately a LOW-FALSE-POSITIVE filter: it removes
 * the crawlers that announce themselves and says nothing about the rest.
 *
 * The liars are caught by the BEHAVIOURAL half at the bottom of this file, added
 * once the disguised crawl became visible on the live dashboard. The two halves
 * answer different questions and are reported separately — `is_bot` for "it said
 * so", `is_likely_bot` for "it behaved that way" — because the second is a
 * judgement and the reader deserves to know which one fired.
 */

/**
 * Lowercase substrings that appear in self-identifying automated clients.
 *
 * Grounded in what production actually served (Googlebot, Baiduspider) plus the
 * common crawlers, previewers and monitors that would otherwise be counted as
 * people. Ordered roughly by how often they appear here.
 *
 * Constrained to `[a-z0-9 ._/+-]` so the SQL builder below can interpolate them
 * without an injection question ever arising — enforced by an assertion at
 * module load, not by a comment asking the next author to be careful.
 */
export const BOT_UA_PATTERNS: readonly string[] = [
  // Search engine crawlers
  'googlebot',
  'bingbot',
  'baiduspider',
  'yandexbot',
  'duckduckbot',
  'slurp',
  'sogou',
  'exabot',
  'petalbot',
  'applebot',
  // AI / dataset crawlers
  'gptbot',
  'oai-searchbot',
  'chatgpt-user',
  'claudebot',
  'anthropic-ai',
  'perplexitybot',
  'ccbot',
  'bytespider',
  'amazonbot',
  'meta-externalagent',
  // Social and messaging link previewers
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'telegrambot',
  'whatsapp',
  'embedly',
  // SEO and monitoring tools
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'screaming frog',
  'pingdom',
  'uptimerobot',
  'statuscake',
  'datadog',
  // Generic automation clients and headless browsers
  'headlesschrome',
  'phantomjs',
  'puppeteer',
  'playwright',
  'selenium',
  'python-requests',
  'scrapy',
  'httpclient',
  'okhttp',
  'axios/',
  'go-http-client',
  'java/',
  'libwww-perl',
  'curl/',
  'wget/',
  // Broad catch-alls, last so the specific names above document themselves
  'bot/',
  'bot;',
  'bot)',
  'spider',
  'crawler',
  'crawling',
  'archiver',
  'monitoring',
];

const SAFE_PATTERN = /^[a-z0-9 ._/+;)-]+$/;

// Fail at import rather than at query time. A pattern with a quote in it would
// otherwise reach the SQL builder below and only misbehave under load.
for (const pattern of BOT_UA_PATTERNS) {
  if (!SAFE_PATTERN.test(pattern)) {
    throw new Error(`[visitorBotDetection] unsafe bot pattern: ${JSON.stringify(pattern)}`);
  }
}

/**
 * Does this user agent belong to a self-identifying bot?
 *
 * A missing user agent is NOT treated as a bot. Roughly 487 sessions in the same
 * sample carried a null agent (the standalone tracker snippet does not always
 * send one), and they are spread across ai-flotation and cpn — real properties
 * with real visitors. Guessing "bot" there would hide people.
 */
export function isBotUserAgent(userAgent?: string | null): boolean {
  if (!userAgent || typeof userAgent !== 'string') return false;
  const ua = userAgent.toLowerCase();
  return BOT_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}

/**
 * The same rule as SQL, so the live LIST and the live COUNT cannot disagree.
 *
 * Filtering the list in JavaScript while counting in SQL is how you get a
 * headline reading 12 above a table showing 3 — the exact class of defect this
 * dashboard just came out of. One rule, expressed twice, applied in the same
 * place in both queries.
 *
 * `column` is a caller-supplied identifier and every call site passes a literal;
 * the patterns are the module constants asserted above.
 */
export function botExclusionSql(column: string): string {
  const clauses = BOT_UA_PATTERNS.map((p) => `${column} ILIKE '%${p}%'`).join(' OR ');
  return `(${column} IS NULL OR NOT (${clauses}))`;
}

// ---------------------------------------------------------------------------
// Behavioural detection — for crawlers that present a clean browser string
// ---------------------------------------------------------------------------

/**
 * Some crawlers lie, and the user-agent rules above cannot see them.
 *
 * Observed on the live dashboard 2026-09-04: twenty concurrent "visitors", every
 * one reporting Mac Chrome, Mac Safari or Windows Chrome — no bot marker
 * anywhere — walking `/system/...` and `/crosswalks/...` node URLs. One had
 * accumulated 291 pageviews across 19 hours; another 243 across 15. They were
 * also every one of them scored "100 Very High" intent, so the crawl was
 * feeding the lead-scoring model as well as the visitor count.
 *
 * No string comparison can separate those from a person. The BEHAVIOUR can, and
 * it is not a close call, which is why the thresholds below are set where a
 * human being simply does not go rather than where the crawlers happen to sit.
 *
 * DELIBERATELY CONSERVATIVE. A filter that hides a real prospect is far worse
 * than one that lets a crawler through: the crawler is visible and annoying,
 * whereas the hidden human is invisible and silently costs a sale. So these
 * catch the extreme end and knowingly miss the rest — a session of 12 pages over
 * two hours is left alone even though it is probably automated too.
 */
export const AUTOMATED_MIN_PAGEVIEWS = 40;
export const AUTOMATED_MIN_DURATION_SECONDS = 2 * 60 * 60; // 2 hours
export const AUTOMATED_MAX_PAGES_PER_MINUTE = 5;
/** Below this, a high rate is just a fast first few clicks, not a crawl. */
export const AUTOMATED_RATE_MIN_PAGEVIEWS = 10;

export interface SessionShape {
  pageview_count?: number | null;
  duration_seconds?: number | null;
}

/**
 * Two independent rules, either sufficient:
 *
 *  1. Volume AND endurance — 40+ pages sustained over 2+ hours. Catches the slow,
 *     patient crawler (291 pages / 19 hours reads as only 0.25 pages per minute,
 *     so a rate test alone would miss it entirely).
 *  2. Rate — more than 5 pages a minute once at least 10 pages deep. Catches the
 *     fast scraper that a duration test would miss.
 *
 * Neither triggers on ordinary reading: 40 pages in one sitting is already
 * unusual, and pairing it with two continuous hours puts it out of human reach.
 */
export function isLikelyAutomatedSession(session: SessionShape): boolean {
  const pages = Number(session?.pageview_count ?? 0);
  const seconds = Number(session?.duration_seconds ?? 0);
  if (!Number.isFinite(pages) || !Number.isFinite(seconds)) return false;

  if (pages >= AUTOMATED_MIN_PAGEVIEWS && seconds >= AUTOMATED_MIN_DURATION_SECONDS) return true;

  if (pages >= AUTOMATED_RATE_MIN_PAGEVIEWS && seconds >= 60) {
    const perMinute = pages / (seconds / 60);
    if (perMinute > AUTOMATED_MAX_PAGES_PER_MINUTE) return true;
  }

  return false;
}

/**
 * The same two rules as SQL, negated — "this session is NOT automated".
 *
 * Expressed here rather than by filtering rows in JS for the same reason the
 * user-agent rule is: the live list is LIMITed, so dropping rows after the query
 * returns fewer than asked for while more real people wait further down.
 *
 * Column names are supplied by the caller and every call site passes a literal.
 */
export function notAutomatedSessionSql(pageviewCol: string, durationCol: string): string {
  const volume = `(COALESCE(${pageviewCol},0) >= ${AUTOMATED_MIN_PAGEVIEWS} AND COALESCE(${durationCol},0) >= ${AUTOMATED_MIN_DURATION_SECONDS})`;
  const rate =
    `(COALESCE(${pageviewCol},0) >= ${AUTOMATED_RATE_MIN_PAGEVIEWS} AND COALESCE(${durationCol},0) >= 60 ` +
    `AND (COALESCE(${pageviewCol},0)::numeric / (COALESCE(${durationCol},1)::numeric / 60)) > ${AUTOMATED_MAX_PAGES_PER_MINUTE})`;
  return `NOT (${volume} OR ${rate})`;
}

// ---------------------------------------------------------------------------
// Engagement depth — separating a hit from a read
// ---------------------------------------------------------------------------

/**
 * A visit so shallow it carries no information about a person.
 *
 * WHY THIS IS NOT A THIRD BOT RULE. The evidence strongly suggests automation:
 * `ai-flotation` served 454 sessions of which 448 (98.7%) lasted ten seconds or
 * less, across 431 fingerprints that never returned, concentrated into five days
 * and rotating over 110 IPs with almost no user-agent variety. That is a
 * fingerprint farm, not an audience.
 *
 * But the rule was tested against the only ground truth available — visitors who
 * became leads — and it caught ONE of them. A visitor who converted is
 * definitionally a person. One false positive against 24 known-real visitors is
 * enough to say the signal does not support the word "bot", and asserting it
 * anyway would be the same over-claim this dashboard has been full of.
 *
 * So this measures ENGAGEMENT DEPTH instead, which is a claim the data does
 * support: a single pageview under ten seconds, never returned to, is a hit
 * rather than a read. Both numbers are reported. Nothing is hidden, and the
 * reader is told which is which.
 *
 * ANYONE WHO CONVERTED IS ALWAYS ENGAGED, regardless of the timings — the carve
 * out that makes the measure safe.
 */
export const SHALLOW_MAX_SECONDS = 10;
export const SHALLOW_MAX_PAGEVIEWS = 1;

/**
 * SQL for "this visitor actually looked at something".
 *
 * Engaged when ANY session went beyond the shallow threshold, or when the
 * visitor is linked to a lead. Expressed over the visitor rather than the
 * session because the question is about the person: one real read among five
 * bounces still makes them someone who read.
 */
export function engagedVisitorSql(visitorIdColumn: string, leadIdColumn?: string): string {
  const converted = leadIdColumn ? `${leadIdColumn} IS NOT NULL OR ` : '';
  return (
    `(${converted}EXISTS (SELECT 1 FROM "visitor_sessions" evs ` +
    `WHERE evs."visitor_id" = ${visitorIdColumn} ` +
    `AND (COALESCE(evs."duration_seconds",0) > ${SHALLOW_MAX_SECONDS} ` +
    `OR COALESCE(evs."pageview_count",0) > ${SHALLOW_MAX_PAGEVIEWS})))`
  );
}
