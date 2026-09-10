import {
  classifyUserAgent,
  extractClickIds,
  extractAttributionFromUrl,
  hashIp,
  clientIpFrom,
  NORMALIZED_CLICK_ID_KEYS,
} from '../clickClassification';

describe('classifyUserAgent — social preview fetchers', () => {
  /**
   * The case that actually matters. These fetch a link the MOMENT it is posted, in order to
   * render the preview card — so on a marketing platform they arrive on exactly the links we
   * care about, at exactly the moment we start caring. Counting them means every post begins
   * with phantom clicks and every cost-per-click is computed against an inflated denominator:
   * a number that looks plausible and is wrong.
   */
  it.each([
    ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'social_preview_facebook'],
    ['LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)', 'social_preview_linkedin'],
    ['Twitterbot/1.0', 'social_preview_twitter'],
    ['Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 'social_preview_slack'],
    ['WhatsApp/2.19.81 A', 'social_preview_whatsapp'],
    ['TelegramBot (like TwitterBot)', 'social_preview_telegram'],
    ['Mozilla/5.0 (compatible; Discordbot/2.0)', 'social_preview_discord'],
  ])('flags %s', (ua, reason) => {
    const v = classifyUserAgent(ua);
    expect(v.isBot).toBe(true);
    expect(v.reason).toBe(reason);
  });

  it('reports the SPECIFIC reason, not the generic catch-all', () => {
    // Ordering matters: `LinkedInBot` contains "bot", so a generic-first list would record
    // `generic_bot` and lose which platform it was. The reason is stored and queried later,
    // so a useless one is nearly as bad as none.
    expect(classifyUserAgent('LinkedInBot/1.0').reason).toBe('social_preview_linkedin');
    expect(classifyUserAgent('TelegramBot (like TwitterBot)').reason).toBe('social_preview_telegram');
  });
});

describe('classifyUserAgent — crawlers, automation and scripts', () => {
  it.each([
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'crawler_google'],
    ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'crawler_seo'],
    ['curl/8.4.0', 'automation_script'],
    ['Wget/1.21.3', 'automation_script'],
    ['python-requests/2.31.0', 'automation_script'],
    ['Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0', 'automation_headless'],
    ['Go-http-client/2.0', 'automation_script'],
  ])('flags %s', (ua, reason) => {
    expect(classifyUserAgent(ua)).toEqual({ isBot: true, reason });
  });
});

describe('classifyUserAgent — real browsers are not flagged', () => {
  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ])('does not flag %s', (ua) => {
    // A false positive here is worse than a false negative: it silently deletes real
    // attribution, and the campaign simply looks like it underperformed.
    expect(classifyUserAgent(ua).isBot).toBe(false);
  });

  /**
   * The generic `bot` catch-all DOES over-match, and this pins it rather than pretending
   * otherwise.
   *
   * An earlier version of this test claimed to guard against exactly this - its comment said
   * "Ubot or Robot inside a product token would be a false positive" - while asserting on a
   * plain Chrome string containing neither, which is a near-duplicate of the it.each above. So
   * it passed for a reason unrelated to the property it advertised: the guard did not exist,
   * and the test could not have detected its absence. Caught in review, not by the suite.
   *
   * The behaviour is kept. Substring `bot` matching is what catches the long tail of
   * self-identifying crawlers that no signature list enumerates, and discovery measured 74% of
   * sessions as crawlers - the tail is most of the traffic. The cost is a real visitor whose
   * user-agent happens to contain those four letters being flagged.
   *
   * That cost is bounded by design: classification NEVER blocks the redirect (the visitor
   * reaches the destination either way), it only sets `is_bot` on the recorded click. And the
   * registry already declares `marketing.bot_click_share` as `partial` with the reason
   * "a user-agent heuristic, so a good estimate and not a fact". This test is what makes that
   * statement checkable instead of a disclaimer.
   */
  it.each([
    ['Mozilla/5.0 Robot Browser 1.0', true],
    ['Mozilla/5.0 (Windows) Ubot/1.0', true],
  ])('flags %s as a bot - the generic catch-all is intentionally broad', (ua, expected) => {
    expect(classifyUserAgent(ua as string).isBot).toBe(expected);
    expect(classifyUserAgent(ua as string).reason).toBe('generic_bot');
  });

  it('still does not flag mainstream browsers containing no bot signature', () => {
    // The genuine near-miss risk: in-app browsers, which carry unusual product tokens and are
    // real people. These are the ones a broad rule could plausibly catch.
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Snapchat/12.0',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 EdgA/120',
    ]) {
      expect(classifyUserAgent(ua).isBot).toBe(false);
    }
  });
});

describe('classifyUserAgent — missing user agent', () => {
  it.each([null, undefined, '', '   '])('treats %p as a bot', (ua) => {
    // Effectively every real browser sends one. Its absence means a scripted client or
    // something hiding, and for a click counter the safe default is to exclude rather than
    // inflate.
    const v = classifyUserAgent(ua as any);
    expect(v.isBot).toBe(true);
    expect(v.reason).toBe('missing_user_agent');
  });

  it('does not throw on a non-string user agent', () => {
    expect(() => classifyUserAgent(42 as any)).not.toThrow();
    expect(classifyUserAgent(42 as any).isBot).toBe(true);
  });
});

describe('extractClickIds', () => {
  it('promotes the four adopted platforms to their own fields', () => {
    const ids = extractClickIds({
      fbclid: 'FB123', gclid: 'GC456', msclkid: 'MS789', ttclid: 'TT012',
    });
    expect(ids.fbclid).toBe('FB123');
    expect(ids.gclid).toBe('GC456');
    expect(ids.msclkid).toBe('MS789');
    expect(ids.ttclid).toBe('TT012');
    expect(ids.click_ids).toEqual({});
  });

  it('puts unadopted platforms in the overflow rather than dropping them', () => {
    const ids = extractClickIds({ wbraid: 'WB1', li_fat_id: 'LI2', igshid: 'IG3' });
    expect(ids.click_ids).toEqual({ wbraid: 'WB1', li_fat_id: 'LI2', igshid: 'IG3' });
    for (const key of NORMALIZED_CLICK_ID_KEYS) expect(ids[key]).toBeNull();
  });

  it('ignores unrelated query parameters entirely', () => {
    const ids = extractClickIds({ utm_source: 'linkedin', ref: 'x', q: 'search' });
    expect(ids.click_ids).toEqual({});
    expect(ids.fbclid).toBeNull();
  });

  it('takes the first value when a parameter repeats', () => {
    // Express yields an array for `?fbclid=a&fbclid=b`. Concatenating would store a value no
    // platform ever issued.
    expect(extractClickIds({ fbclid: ['A', 'B'] }).fbclid).toBe('A');
  });

  it('skips empty and whitespace-only values', () => {
    const ids = extractClickIds({ fbclid: '', gclid: '   ', msclkid: ['', 'REAL'] });
    expect(ids.fbclid).toBeNull();
    expect(ids.gclid).toBeNull();
    expect(ids.msclkid).toBe('REAL');
  });

  it('truncates rather than rejecting an over-long value', () => {
    // The column is VARCHAR(255). Rejecting would lose a real click to punish a long string;
    // letting it through would fail the insert and lose the whole row.
    const long = 'x'.repeat(500);
    expect(extractClickIds({ fbclid: long }).fbclid).toHaveLength(255);
  });

  it('does not throw on hostile query shapes', () => {
    for (const q of [{ fbclid: {} }, { fbclid: null }, { fbclid: 42 }, { fbclid: [] }]) {
      expect(() => extractClickIds(q as any)).not.toThrow();
      expect(extractClickIds(q as any).fbclid).toBeNull();
    }
  });
});

describe('hashIp', () => {
  it('returns a stable SHA-256 hex digest', () => {
    const a = hashIp('203.0.113.7');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp('203.0.113.7')).toBe(a);
  });

  it('never returns the address itself', () => {
    expect(hashIp('203.0.113.7')).not.toContain('203.0.113.7');
  });

  it('distinguishes different addresses', () => {
    expect(hashIp('203.0.113.7')).not.toBe(hashIp('203.0.113.8'));
  });

  it.each([null, undefined, '', '   '])('returns null for %p', (ip) => {
    expect(hashIp(ip as any)).toBeNull();
  });
});

describe('clientIpFrom', () => {
  it('takes the first entry of x-forwarded-for', () => {
    expect(clientIpFrom({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' }))
      .toBe('203.0.113.7');
  });

  it('falls back when the header is absent', () => {
    expect(clientIpFrom({}, '198.51.100.4')).toBe('198.51.100.4');
  });

  it('returns null when there is nothing at all', () => {
    expect(clientIpFrom({})).toBeNull();
    expect(clientIpFrom({}, '')).toBeNull();
  });

  it('does not throw on a hostile header shape', () => {
    for (const h of [{ 'x-forwarded-for': {} }, { 'x-forwarded-for': 42 }, { 'x-forwarded-for': [] }]) {
      expect(() => clientIpFrom(h as any, '1.2.3.4')).not.toThrow();
    }
  });

  it('handles an array header by taking the first usable entry', () => {
    expect(clientIpFrom({ 'x-forwarded-for': ['203.0.113.9', '10.0.0.1'] })).toBe('203.0.113.9');
  });
});

describe('extractAttributionFromUrl', () => {
  /**
   * Reads attribution from the LANDING PAGE URL rather than from request-body fields.
   *
   * The decisive reason is operational: adopting a new click ID becomes a backend change
   * alone. The alternative needs a frontend release AND every cached copy of the tracker to
   * refresh before one click of a new platform can be attributed.
   *
   * Not hypothetical here - the tracker has always sent utm_source/campaign/medium as body
   * fields and never utm_term/utm_content, so those two were unavailable server-side for as
   * long as the tracker has existed, despite sitting in the URL of every click that had them.
   */
  it('reads all five UTMs and all four adopted click IDs', () => {
    const a = extractAttributionFromUrl(
      'https://learn.colaberry.com/open-house'
      + '?utm_source=facebook&utm_medium=paid_social&utm_campaign=cb-oh-2026q3'
      + '&utm_content=hero-a&utm_term=data-analyst'
      + '&fbclid=FB1&gclid=GC1&msclkid=MS1&ttclid=TT1',
    );
    expect(a.utm_source).toBe('facebook');
    expect(a.utm_medium).toBe('paid_social');
    expect(a.utm_campaign).toBe('cb-oh-2026q3');
    expect(a.utm_content).toBe('hero-a');
    expect(a.utm_term).toBe('data-analyst');
    expect(a.fbclid).toBe('FB1');
    expect(a.gclid).toBe('GC1');
    expect(a.msclkid).toBe('MS1');
    expect(a.ttclid).toBe('TT1');
  });

  it('puts unadopted platforms in the overflow', () => {
    const a = extractAttributionFromUrl('https://x.test/p?wbraid=WB1&igshid=IG1');
    expect(a.click_ids).toEqual({ wbraid: 'WB1', igshid: 'IG1' });
  });

  it('returns all-null for a URL with no attribution', () => {
    const a = extractAttributionFromUrl('https://learn.colaberry.com/open-house');
    expect(a.utm_source).toBeNull();
    expect(a.fbclid).toBeNull();
    expect(a.click_ids).toEqual({});
  });

  it.each([
    ['/open-house?utm_source=x', 'a relative path'],
    ['not a url at all', 'junk'],
    ['', 'empty'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('returns empty attribution for %p (%s) without throwing', (url) => {
    // A page view is worth more than its provenance. Returning empty loses one row's
    // attribution; throwing would lose the page view itself.
    expect(() => extractAttributionFromUrl(url as any)).not.toThrow();
    expect(extractAttributionFromUrl(url as any).utm_source).toBeNull();
  });

  it('truncates an over-long UTM rather than failing the insert', () => {
    // The columns are VARCHAR(200). Letting a long value through would fail the INSERT and
    // take the whole session row with it.
    const a = extractAttributionFromUrl(`https://x.test/p?utm_campaign=${'z'.repeat(400)}`);
    expect(a.utm_campaign).toHaveLength(200);
  });

  it('takes the first value when a parameter repeats', () => {
    expect(extractAttributionFromUrl('https://x.test/p?utm_source=a&utm_source=b').utm_source).toBe('a');
  });

  it('ignores empty parameter values rather than storing blanks', () => {
    // `utm_term=` would otherwise become its own row in reporting - a real dimension with a
    // blank value.
    const a = extractAttributionFromUrl('https://x.test/p?utm_term=&utm_content=%20');
    expect(a.utm_term).toBeNull();
    expect(a.utm_content).toBeNull();
  });

  it('survives a URL with a fragment and preserves query parsing', () => {
    const a = extractAttributionFromUrl('https://x.test/p?utm_source=linkedin#section-2');
    expect(a.utm_source).toBe('linkedin');
  });
});
