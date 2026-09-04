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
 * So this is deliberately a LOW-FALSE-POSITIVE filter, not a complete one. It
 * removes the crawlers that announce themselves and says nothing about the rest.
 * Catching the liars needs behavioural signals — request rate, pageviews per
 * session, whether the client ever executes JS — which is a separate piece of
 * work with a different risk profile, because those heuristics CAN misclassify
 * a real, fast-reading person.
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
