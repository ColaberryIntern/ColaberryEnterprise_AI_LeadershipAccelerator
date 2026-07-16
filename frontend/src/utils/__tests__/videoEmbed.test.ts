import { parseVideoUrl, withAutoplay, providerLabel } from '../videoEmbed';

describe('parseVideoUrl', () => {
  it('parses every YouTube URL shape to a nocookie embed with the 11-char id', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=30',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?list=RD&v=dQw4w9WgXcQ',
    ]) {
      const s = parseVideoUrl(u)!;
      expect(s.provider).toBe('youtube');
      expect(s.id).toBe('dQw4w9WgXcQ');
      expect(s.kind).toBe('iframe');
      expect(s.embedUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
      // enablejsapi opens YouTube's postMessage channel so watch progress is measurable.
      expect(s.embedUrl).toContain('enablejsapi=1');
    }
    expect(parseVideoUrl('https://www.youtube.com/shorts/abcdefghijk')!.id).toBe('abcdefghijk');
  });

  it('parses Vimeo (both public + player URLs)', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')!.embedUrl).toBe('https://player.vimeo.com/video/76979871');
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871')!.provider).toBe('vimeo');
  });

  it('parses Loom + Wistia share links', () => {
    expect(parseVideoUrl('https://www.loom.com/share/0abZ_cdef123')!.embedUrl).toBe('https://www.loom.com/embed/0abZ_cdef123');
    expect(parseVideoUrl('https://colaberry.wistia.com/medias/abc123')!.provider).toBe('wistia');
  });

  it('treats direct media files as a native <video> source', () => {
    const s = parseVideoUrl('https://cdn.example.com/lessons/mcp.mp4?sig=xyz')!;
    expect(s.kind).toBe('file');
    expect(s.provider).toBe('file');
    expect(s.embedUrl).toBe('https://cdn.example.com/lessons/mcp.mp4?sig=xyz');
  });

  it('falls back to an external link for unknown hosts', () => {
    const s = parseVideoUrl('https://example.com/some/page')!;
    expect(s.provider).toBe('unknown');
    expect(s.kind).toBe('link');
  });

  it('returns null for empty/blank input', () => {
    expect(parseVideoUrl('')).toBeNull();
    expect(parseVideoUrl('   ')).toBeNull();
    expect(parseVideoUrl(null)).toBeNull();
    expect(parseVideoUrl(undefined)).toBeNull();
  });
});

describe('withAutoplay', () => {
  it('adds autoplay=1 for iframe providers, using the right separator', () => {
    const yt = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')!;
    expect(withAutoplay(yt)).toContain('autoplay=1');
    expect(withAutoplay(yt)).toContain('&autoplay=1'); // embed already has ?rel=0
    const vim = parseVideoUrl('https://vimeo.com/76979871')!;
    expect(withAutoplay(vim)).toBe('https://player.vimeo.com/video/76979871?autoplay=1');
  });
  it('leaves file + link sources unchanged', () => {
    const f = parseVideoUrl('https://x.com/v.mp4')!;
    expect(withAutoplay(f)).toBe(f.embedUrl);
  });
});

describe('providerLabel', () => {
  it('gives a human label', () => {
    expect(providerLabel('youtube')).toBe('YouTube');
    expect(providerLabel('unknown')).toBe('source');
  });
});
