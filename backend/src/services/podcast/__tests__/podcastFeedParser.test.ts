import {
  parseTrainingIndex,
  parseBuzzsproutFeed,
  enrichEntries,
  normalizeTitle,
  parseDurationToSeconds,
  secondsToLabel,
  PODCAST_SOURCE,
} from '../podcastFeedParser';

// Mirrors the real training-site markup: one featured <a.pod-feat> + two <a.pod-card>,
// plus a decoy nav anchor that must be ignored.
const INDEX_HTML = `
<html><body>
  <a href="/podcasts">All podcasts</a>
  <a class="pod-feat aw-grain" href="https://www.colaberry.ai/resources/podcasts/fable-5-and-the-crisis-of-hidden-ai-safety-throttling-12th-june-2026" target="_blank">
    <div class="pod-feat__body">
      <span class="pod-feat__tag">Featured episode</span>
      <h2>Fable 5 and the Crisis of Hidden AI Safety Throttling</h2>
      <p class="pod-feat__sub">How transparency, trust, and model governance became the new AI battleground.</p>
      <div class="pod-feat__meta">
        <span><span class="cb-i"><i class="ri-calendar-line"></i></span>Jun 12, 2026</span>
        <span><span class="cb-i"><i class="ri-time-line"></i></span>24:42</span>
        <span><span class="cb-i"><i class="ri-headphone-line"></i></span>Listen</span>
      </div>
    </div>
  </a>
  <a class="pod-card" href="https://www.colaberry.ai/resources/podcasts/the-2028-warning-the-rise-of-recursive-ai-self-improvement-29th-june-2026" target="_blank" style="--_c:var(--red-500)">
    <div class="pod-card__top">
      <span class="pod-play"><span class="cb-i"><i class="ri-play-fill"></i></span></span>
      <span class="pod-dur"><span class="cb-i"><i class="ri-time-line"></i></span>21:04</span>
    </div>
    <h3>The 2028 Warning: The Rise of Recursive AI Self-Improvement</h3>
    <p>How self-evolving AI could redefine intelligence, productivity, and the future of innovation.</p>
    <div class="pod-card__foot"><span class="pod-card__date">Jun 29, 2026</span><span class="pod-card__listen">Listen</span></div>
  </a>
  <a class="pod-card" href="https://www.colaberry.ai/resources/podcasts/an-episode-not-in-the-feed" target="_blank">
    <div class="pod-card__top"><span class="pod-dur">10:00</span></div>
    <h3>An Episode Not In The Feed</h3>
    <p>Curated but the feed lagged.</p>
    <div class="pod-card__foot"><span class="pod-card__date">Jun 30, 2026</span></div>
  </a>
</body></html>`;

// Mirrors the Buzzsprout RSS shape, including namespaced itunes:* tags and CDATA.
const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Colaberry AI Podcast</title>
    <item>
      <itunes:title>Fable 5 and the Crisis of Hidden AI Safety Throttling | 12th June 2026</itunes:title>
      <title>Fable 5 and the Crisis of Hidden AI Safety Throttling | 12th June 2026</title>
      <itunes:summary><![CDATA[<p>How transparency and trust became the AI battleground.</p>]]></itunes:summary>
      <description><![CDATA[<p>Full show notes here.</p>]]></description>
      <enclosure url="https://www.buzzsprout.com/2456315/episodes/19336943-fable-5.mp3" length="16624792" type="audio/mpeg" />
      <itunes:image href="https://storage.buzzsprout.com/fable5image?.jpg" />
      <guid isPermaLink="false">Buzzsprout-19336943</guid>
      <pubDate>Fri, 12 Jun 2026 12:00:00 -0500</pubDate>
      <itunes:duration>1482</itunes:duration>
    </item>
    <item>
      <title>The 2028 Warning: The Rise of Recursive AI Self-Improvement | 29th June 2026</title>
      <enclosure url="https://www.buzzsprout.com/2456315/episodes/19400000-2028-warning.mp3" length="1" type="audio/mpeg" />
      <itunes:image href="https://storage.buzzsprout.com/warning2028image?.jpg" />
      <guid isPermaLink="false">Buzzsprout-19400000</guid>
      <pubDate>Mon, 29 Jun 2026 12:00:00 -0500</pubDate>
      <itunes:duration>1264</itunes:duration>
    </item>
  </channel>
</rss>`;

describe('podcastFeedParser — training index', () => {
  const entries = parseTrainingIndex(INDEX_HTML);

  it('extracts every podcast card and ignores non-podcast anchors', () => {
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.slug)).toEqual([
      'fable-5-and-the-crisis-of-hidden-ai-safety-throttling-12th-june-2026',
      'the-2028-warning-the-rise-of-recursive-ai-self-improvement-29th-june-2026',
      'an-episode-not-in-the-feed',
    ]);
  });

  it('parses the featured card (h2 + pod-feat__meta)', () => {
    const feat = entries[0];
    expect(feat.featured).toBe(true);
    expect(feat.title).toBe('Fable 5 and the Crisis of Hidden AI Safety Throttling');
    expect(feat.displayDate).toBe('Jun 12, 2026');
    expect(feat.durationLabel).toBe('24:42');
    expect(feat.description).toMatch(/battleground/);
    expect(feat.websiteUrl).toMatch(/^https:\/\/www\.colaberry\.ai\/resources\/podcasts\//);
  });

  it('parses a regular card (h3 + pod-dur + pod-card__date)', () => {
    const card = entries[1];
    expect(card.featured).toBe(false);
    expect(card.title).toBe('The 2028 Warning: The Rise of Recursive AI Self-Improvement');
    expect(card.displayDate).toBe('Jun 29, 2026');
    expect(card.durationLabel).toBe('21:04');
  });
});

describe('podcastFeedParser — Buzzsprout feed', () => {
  const episodes = parseBuzzsproutFeed(FEED_XML);

  it('extracts per-episode fields incl. namespaced itunes:image/duration', () => {
    expect(episodes).toHaveLength(2);
    const ep = episodes[0];
    expect(ep.guid).toBe('Buzzsprout-19336943');
    expect(ep.audioUrl).toBe('https://www.buzzsprout.com/2456315/episodes/19336943-fable-5.mp3');
    expect(ep.thumbnailUrl).toBe('https://storage.buzzsprout.com/fable5image?.jpg');
    expect(ep.durationSeconds).toBe(1482);
    expect(ep.publishedAt).toBeInstanceOf(Date);
    expect(ep.description).toBe('How transparency and trust became the AI battleground.');
  });
});

describe('normalizeTitle', () => {
  it('drops the "| date" suffix and punctuation so both sources match', () => {
    expect(normalizeTitle('The 2028 Warning: The Rise of Recursive AI Self-Improvement | 29th June 2026')).toBe(
      normalizeTitle('The 2028 Warning: The Rise of Recursive AI Self-Improvement')
    );
    expect(normalizeTitle("Anthropic's Evolution")).toBe('anthropics evolution');
    expect(normalizeTitle('Anthropics Evolution')).toBe('anthropics evolution'); // apostrophe-insensitive
    expect(normalizeTitle('Claude 4.8: Performance Gains')).toBe('claude 4 8 performance gains');
  });
});

describe('duration helpers', () => {
  it('parses seconds and mm:ss and hh:mm:ss', () => {
    expect(parseDurationToSeconds('1382')).toBe(1382);
    expect(parseDurationToSeconds('21:04')).toBe(1264);
    expect(parseDurationToSeconds('1:02:03')).toBe(3723);
    expect(parseDurationToSeconds(null)).toBeNull();
  });
  it('formats seconds to a label', () => {
    expect(secondsToLabel(1382)).toBe('23:02');
    expect(secondsToLabel(3723)).toBe('1:02:03');
    expect(secondsToLabel(null)).toBeNull();
  });
});

describe('enrichEntries — join + graceful degradation', () => {
  const records = enrichEntries(parseTrainingIndex(INDEX_HTML), parseBuzzsproutFeed(FEED_XML));

  it('produces one record per curated entry', () => {
    expect(records).toHaveLength(3);
    expect(records.every((r) => r.source === PODCAST_SOURCE)).toBe(true);
  });

  it('attaches thumbnail/audio/guid to matched episodes', () => {
    const feat = records[0];
    expect(feat.matched).toBe(true);
    expect(feat.thumbnailUrl).toBe('https://storage.buzzsprout.com/fable5image?.jpg');
    expect(feat.audioUrl).toContain('19336943');
    expect(feat.buzzsproutGuid).toBe('Buzzsprout-19336943');
    expect(feat.durationSeconds).toBe(1482); // feed value wins over the card label
    expect(feat.featured).toBe(true);
  });

  it('keeps a curated entry with no feed match (null thumbnail, matched=false)', () => {
    const orphan = records.find((r) => r.slug === 'an-episode-not-in-the-feed');
    expect(orphan).toBeDefined();
    expect(orphan!.matched).toBe(false);
    expect(orphan!.thumbnailUrl).toBeNull();
    expect(orphan!.audioUrl).toBeNull();
    expect(orphan!.durationSeconds).toBe(600); // falls back to the card's "10:00" label
  });

  it('is deterministic — enriching the same inputs twice is identical (idempotent logic)', () => {
    const again = enrichEntries(parseTrainingIndex(INDEX_HTML), parseBuzzsproutFeed(FEED_XML));
    expect(JSON.stringify(again)).toEqual(JSON.stringify(records));
  });
});
