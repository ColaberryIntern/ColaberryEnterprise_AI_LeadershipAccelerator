import { isEmbeddableVideoUrl, parseVideoEmbed } from '../videoEmbed';

/**
 * The output of this parser becomes an `<iframe src>` on three public brands.
 *
 * So the tests that matter most are the REFUSALS. A parser that accepts a link and rewrites
 * it into an embed is one loose host check away from letting a case-study record frame any
 * origin on enterprise.colaberry.ai, training.colaberry.com and AI Flotation — and it would
 * look completely normal in the admin UI while doing it.
 */

describe('accepts the forms a human actually pastes', () => {
  it('takes a watch URL from the address bar', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({
      provider: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('takes a youtu.be share link', () => {
    expect(parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ')?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('takes embed, shorts and live forms', () => {
    for (const p of ['embed', 'shorts', 'live', 'v']) {
      expect(parseVideoEmbed(`https://www.youtube.com/${p}/dQw4w9WgXcQ`)?.videoId).toBe('dQw4w9WgXcQ');
    }
  });

  it('keeps the id when extra query params ride along', () => {
    // Share links carry ?t=, ?si=, ?list= — dropping the id over them would reject most
    // real pastes.
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&si=abc')?.videoId)
      .toBe('dQw4w9WgXcQ');
  });

  it('takes a bare host with no scheme', () => {
    expect(parseVideoEmbed('youtube.com/watch?v=dQw4w9WgXcQ')?.provider).toBe('youtube');
  });

  it('takes Vimeo, including the channel and player forms', () => {
    expect(parseVideoEmbed('https://vimeo.com/123456789')).toMatchObject({
      provider: 'vimeo',
      videoId: '123456789',
      embedUrl: 'https://player.vimeo.com/video/123456789',
    });
    expect(parseVideoEmbed('https://vimeo.com/channels/staffpicks/123456789')?.videoId).toBe('123456789');
    expect(parseVideoEmbed('https://player.vimeo.com/video/123456789')?.videoId).toBe('123456789');
  });

  it('embeds YouTube through the no-cookie host', () => {
    // Same player, same CSP allowlist entry, no advertising cookie before playback — and
    // these pages carry no consent banner.
    expect(parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ')?.embedUrl)
      .toContain('youtube-nocookie.com');
  });

  it('always offers a watch URL on the provider\'s own site', () => {
    expect(parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ')?.watchUrl)
      .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('refuses everything else', () => {
  it('refuses a host that merely CONTAINS an allowed one', () => {
    // THE LOAD-BEARING CASE. `youtube.com.evil.test` ends in evil.test; a substring check
    // would have embedded it.
    expect(parseVideoEmbed('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoEmbed('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoEmbed('https://vimeo.com.attacker.test/123456789')).toBeNull();
  });

  it('refuses an arbitrary subdomain of an allowed host', () => {
    // Only `www.` is cosmetic. Anything else is a different origin.
    expect(parseVideoEmbed('https://evil.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('refuses non-http schemes rather than prefixing them into https', () => {
    expect(parseVideoEmbed('javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoEmbed('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(parseVideoEmbed('file:///etc/passwd')).toBeNull();
  });

  it('refuses an id of the wrong shape', () => {
    // 11 unreserved characters for YouTube; digits for Vimeo. A path segment is not an id
    // just because it sits where one would.
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=../../etc/passwd')).toBeNull();
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseVideoEmbed('https://vimeo.com/notanumber')).toBeNull();
  });

  it('refuses another video host, however reputable', () => {
    // Loom and Wistia are in the enterprise frame-src but NOT the training site's, so
    // accepting them here would render on one brand and be blocked on another.
    expect(parseVideoEmbed('https://www.loom.com/share/abcdef')).toBeNull();
    expect(parseVideoEmbed('https://fast.wistia.net/embed/iframe/abc123')).toBeNull();
  });

  it('refuses empty and malformed input without throwing', () => {
    for (const bad of ['', '   ', null, undefined, 'not a url', 'https://']) {
      expect(parseVideoEmbed(bad as string)).toBeNull();
    }
  });
});

describe('isEmbeddableVideoUrl', () => {
  it('agrees with the parser', () => {
    expect(isEmbeddableVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(isEmbeddableVideoUrl('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ')).toBe(false);
  });
});
