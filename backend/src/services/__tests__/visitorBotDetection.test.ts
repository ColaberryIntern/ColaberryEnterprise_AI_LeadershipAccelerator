/**
 * Bot classification for the live visitor list.
 *
 * The load-bearing cases here are the NEGATIVE ones. A filter that hides real
 * people is worse than no filter at all: an over-eager pattern would quietly
 * shrink the "who is on the site" number and there is nothing on the screen to
 * reveal it. So the real-browser strings below — including the exact ones
 * production is serving right now — are the regression this file exists to hold.
 */

import {
  isBotUserAgent,
  botExclusionSql,
  BOT_UA_PATTERNS,
  isLikelyAutomatedSession,
  notAutomatedSessionSql,
} from '../visitorBotDetection';

/** Verbatim from production, 3-day sample, 2026-09-04. */
const GOOGLEBOT =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.173 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BAIDU = 'Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)';
const REAL_CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const REAL_SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const REAL_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const REAL_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';

describe('isBotUserAgent — catches self-identifying crawlers', () => {
  it.each([
    ['Googlebot (the 412-session one)', GOOGLEBOT],
    ['Baiduspider', BAIDU],
    ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.0; +https://openai.com/gptbot)'],
    ['ClaudeBot', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['AhrefsBot', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'],
    ['facebookexternalhit', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
    ['curl', 'curl/8.4.0'],
    ['python-requests', 'python-requests/2.31.0'],
    ['headless Chrome', 'Mozilla/5.0 HeadlessChrome/120.0.0.0 Safari/537.36'],
  ])('flags %s', (_label, ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isBotUserAgent('GOOGLEBOT/2.1')).toBe(true);
  });
});

describe('isBotUserAgent — must never hide a real person', () => {
  it.each([
    ['Chrome on Windows (the rotating-version farm looks exactly like this)', REAL_CHROME_WIN],
    ['Safari on macOS', REAL_SAFARI_MAC],
    ['Safari on iPhone', REAL_IPHONE],
    ['Firefox on Windows', REAL_FIREFOX],
  ])('does not flag %s', (_label, ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });

  /**
   * ~487 sessions in the sample carry a null agent, across ai-flotation and cpn —
   * properties with real visitors. Treating absence as evidence would delete them
   * from the count.
   */
  it.each([[undefined], [null], ['']])('treats a missing user agent (%p) as human, not bot', (ua) => {
    expect(isBotUserAgent(ua as string | null | undefined)).toBe(false);
  });

  it('does not flag a non-string', () => {
    expect(isBotUserAgent(42 as unknown as string)).toBe(false);
  });

  /**
   * The honest limit, asserted so nobody later reads the filter as complete.
   * This scraper rotates Chrome versions behind a clean desktop string; roughly
   * 400 sessions of it. Nothing in the user agent gives it away, and this test
   * records that as intended behaviour rather than an oversight.
   */
  it('does NOT catch a crawler that presents a clean browser string', () => {
    const disguised = REAL_CHROME_WIN.replace('142.0.0.0', '146.0.0.0');
    expect(isBotUserAgent(disguised)).toBe(false);
  });
});

describe('botExclusionSql', () => {
  it('keeps null user agents (they are people until shown otherwise)', () => {
    expect(botExclusionSql('v."user_agent"')).toContain('v."user_agent" IS NULL OR NOT');
  });

  it('covers every declared pattern, so SQL and JS cannot disagree', () => {
    const sql = botExclusionSql('ua');
    for (const pattern of BOT_UA_PATTERNS) {
      expect(sql).toContain(`ILIKE '%${pattern}%'`);
    }
  });

  /**
   * The patterns are interpolated, not parameterised, so a quote in one would be
   * an injection. The module asserts this at import; this proves the assertion is
   * actually true of the shipped list rather than merely present.
   */
  it('contains no quote or escape character that could break out of the literal', () => {
    const sql = botExclusionSql('ua');
    expect(sql).not.toMatch(/''/);
    for (const pattern of BOT_UA_PATTERNS) {
      expect(pattern).toMatch(/^[a-z0-9 ._/+;)-]+$/);
    }
  });
});

/**
 * Behavioural detection, for crawlers that present a clean browser string.
 *
 * The positive cases are taken verbatim from the live dashboard on 2026-09-04 —
 * twenty concurrent "visitors" reporting Mac Chrome / Mac Safari / Windows
 * Chrome while walking taxonomy node URLs. The negative cases are ordinary
 * human sessions, and they matter more: this rule can hide a real prospect, and
 * an invisible lost prospect is a worse failure than a visible crawler.
 */
describe('isLikelyAutomatedSession — catches the disguised crawl', () => {
  it.each([
    ['291 pages over 19 hours', { pageview_count: 291, duration_seconds: 1141 * 60 }],
    ['243 pages over 15 hours', { pageview_count: 243, duration_seconds: 904 * 60 }],
    ['137 pages over 7 hours', { pageview_count: 137, duration_seconds: 426 * 60 }],
    ['a fast scraper: 60 pages in 5 minutes', { pageview_count: 60, duration_seconds: 300 }],
  ])('flags %s', (_label, session) => {
    expect(isLikelyAutomatedSession(session)).toBe(true);
  });

  /**
   * 291 pages across 19 hours is only 0.25 pages per minute. A rate test alone
   * would clear it, which is why the volume+endurance rule exists at all.
   */
  it('catches the slow patient crawler a rate test would miss', () => {
    const slow = { pageview_count: 291, duration_seconds: 1141 * 60 };
    const perMinute = slow.pageview_count / (slow.duration_seconds / 60);
    expect(perMinute).toBeLessThan(1);
    expect(isLikelyAutomatedSession(slow)).toBe(true);
  });
});

describe('isLikelyAutomatedSession — must not hide a person', () => {
  it.each([
    ['a quick look: 2 pages, 16 minutes', { pageview_count: 2, duration_seconds: 16 * 60 }],
    ['an engaged read: 12 pages, 35 minutes', { pageview_count: 12, duration_seconds: 35 * 60 }],
    ['a long researcher: 25 pages, 3 hours', { pageview_count: 25, duration_seconds: 3 * 3600 }],
    ['a tab left open: 3 pages, 9 hours', { pageview_count: 3, duration_seconds: 9 * 3600 }],
    ['a burst of clicks: 6 pages in 30 seconds', { pageview_count: 6, duration_seconds: 30 }],
    ['an empty session', { pageview_count: 0, duration_seconds: 0 }],
  ])('does not flag %s', (_label, session) => {
    expect(isLikelyAutomatedSession(session)).toBe(false);
  });

  it('survives null and missing fields rather than guessing', () => {
    expect(isLikelyAutomatedSession({})).toBe(false);
    expect(isLikelyAutomatedSession({ pageview_count: null, duration_seconds: null })).toBe(false);
  });

  /**
   * The conservative choice, asserted so it is a decision on record rather than
   * an accident: a 12-page, 2-hour session on a crawled property is probably
   * automated too, and is deliberately left alone.
   */
  it('knowingly lets the ambiguous middle through', () => {
    expect(isLikelyAutomatedSession({ pageview_count: 12, duration_seconds: 2 * 3600 })).toBe(false);
  });
});

describe('notAutomatedSessionSql', () => {
  it('negates both rules so SQL and JS agree', () => {
    const sql = notAutomatedSessionSql('vs."pageview_count"', 'vs."duration_seconds"');
    expect(sql.startsWith('NOT (')).toBe(true);
    expect(sql).toContain('>= 40');
    expect(sql).toContain('>= 7200');
    expect(sql).toContain('> 5');
  });

  it('guards the rate division against a zero duration', () => {
    // COALESCE(...,1) on the divisor: a session with duration 0 must not divide
    // by zero and take the whole live query down.
    expect(notAutomatedSessionSql('p', 'd')).toContain('COALESCE(d,1)');
  });
});
