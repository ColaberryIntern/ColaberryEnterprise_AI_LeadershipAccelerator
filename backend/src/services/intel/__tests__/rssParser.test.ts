/**
 * rssParser unit tests — the pure ingestion parse for the AI News Flash pipeline.
 * Covers happy path (RSS + Atom), boundary/failure (empty, malformed, missing
 * fields), dedup, guid stability, and the deterministic importance ranking.
 */
import { parseRssFeed, rankImportance } from '../rssParser';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Lab Blog</title>
  <item>
    <title>Claude Opus 4.8 Launches With 1M Context</title>
    <link>https://example.com/opus-48</link>
    <guid>post-100</guid>
    <description>&lt;p&gt;A new flagship model with a bigger context window.&lt;/p&gt;</description>
    <pubDate>Sat, 18 Jul 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Quarterly community roundup</title>
    <link>https://example.com/roundup</link>
    <guid>post-101</guid>
    <description>Small community note.</description>
    <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Research Feed</title>
  <entry>
    <title>Reflection Improves Agent Reliability</title>
    <link rel="self" href="https://example.com/self"/>
    <link rel="alternate" href="https://example.com/reflection-paper"/>
    <id>tag:example.com,2026:1</id>
    <summary>A study on self-critique in agents.</summary>
    <published>2026-07-15T10:00:00Z</published>
  </entry>
</feed>`;

describe('parseRssFeed', () => {
  it('parses RSS 2.0 items with stripped excerpts, dates, and namespaced guids', () => {
    const items = parseRssFeed(RSS, 'OpenAI');
    expect(items).toHaveLength(2);
    const first = items[0];
    expect(first.title).toBe('Claude Opus 4.8 Launches With 1M Context');
    expect(first.url).toBe('https://example.com/opus-48');
    expect(first.excerpt).toBe('A new flagship model with a bigger context window.'); // HTML stripped
    expect(first.publishedAt).toBeInstanceOf(Date);
    expect(first.guid.startsWith('OpenAI:')).toBe(true);
  });

  it('parses Atom entries and prefers the rel="alternate" link', () => {
    const items = parseRssFeed(ATOM, 'Anthropic');
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://example.com/reflection-paper'); // alternate, not self
    expect(items[0].excerpt).toBe('A study on self-critique in agents.');
    expect(items[0].guid.startsWith('Anthropic:')).toBe(true);
  });

  it('produces a STABLE guid for the same item (idempotency foundation)', () => {
    const a = parseRssFeed(RSS, 'OpenAI');
    const b = parseRssFeed(RSS, 'OpenAI');
    expect(a[0].guid).toBe(b[0].guid);
    expect(a[1].guid).not.toBe(a[0].guid);
  });

  it('dedupes items that resolve to the same guid within one feed', () => {
    const dup = `<rss version="2.0"><channel>
      <item><title>Same</title><guid>g-1</guid><link>https://x/1</link></item>
      <item><title>Same</title><guid>g-1</guid><link>https://x/1</link></item>
    </channel></rss>`;
    expect(parseRssFeed(dup, 'NVIDIA')).toHaveLength(1);
  });

  it('skips entries with no title and survives missing optional fields', () => {
    const partial = `<rss version="2.0"><channel>
      <item><link>https://x/notitle</link></item>
      <item><title>Only a title</title></item>
    </channel></rss>`;
    const items = parseRssFeed(partial, 'GitHub');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Only a title');
    expect(items[0].url).toBeNull();
    expect(items[0].excerpt).toBeNull();
    expect(items[0].publishedAt).toBeNull();
  });

  it('returns [] for empty or malformed input (never throws)', () => {
    expect(parseRssFeed('', 'OpenAI')).toEqual([]);
    expect(parseRssFeed('<not-a-feed>', 'OpenAI')).toEqual([]);
    expect(parseRssFeed('<<broken', 'OpenAI')).toEqual([]);
  });
});

describe('rankImportance', () => {
  const now = new Date('2026-07-19T00:00:00Z');

  it('rewards authoritative sources, signal words, and recency', () => {
    const hot = rankImportance(
      { source: 'Anthropic', title: 'Anthropic launches a new Claude model', publishedAt: new Date('2026-07-18T00:00:00Z') },
      now,
    );
    const cold = rankImportance(
      { source: 'GitHub', title: 'Weekly community roundup', publishedAt: new Date('2026-01-01T00:00:00Z') },
      now,
    );
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeGreaterThanOrEqual(80);
  });

  it('clamps to 0..100 and handles a null date', () => {
    const score = rankImportance({ source: 'Unknown Source', title: 'nothing notable', publishedAt: null }, now);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
