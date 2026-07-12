import { youtubeId } from '../../services/timeline/videoDraftService';
import { buildContentMeta } from '../../services/timeline/timelineAdminService';

// youtubeId feeds the poster thumbnail + oEmbed validation. It must pull the id
// out of every common share shape and reject anything that isn't a YouTube video.
describe('youtubeId', () => {
  it('extracts the id from common URL shapes', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=aircAruvnKk')).toBe('aircAruvnKk');
    expect(youtubeId('https://youtu.be/aircAruvnKk')).toBe('aircAruvnKk');
    expect(youtubeId('https://www.youtube.com/embed/aircAruvnKk')).toBe('aircAruvnKk');
    expect(youtubeId('https://www.youtube.com/watch?list=PL1&v=aircAruvnKk')).toBe('aircAruvnKk');
    expect(youtubeId('https://www.youtube.com/shorts/aircAruvnKk')).toBe('aircAruvnKk');
  });
  it('returns null for non-YouTube or junk input', () => {
    expect(youtubeId('https://vimeo.com/1234567')).toBeNull();
    expect(youtubeId('https://example.com/watch?v=short')).toBeNull(); // id must be 11 chars
    expect(youtubeId('not a url')).toBeNull();
    expect(youtubeId('')).toBeNull();
    expect(youtubeId(null)).toBeNull();
    expect(youtubeId(undefined)).toBeNull();
  });
});

// buildContentMeta decides what AI/author content actually persists to the card.
// An empty/garbage blob must be null so Save never clobbers real notes with {}.
describe('buildContentMeta', () => {
  it('returns null when nothing usable is present', () => {
    expect(buildContentMeta(null)).toBeNull();
    expect(buildContentMeta({})).toBeNull();
    expect(buildContentMeta({ summary: '   ', body_html: '' })).toBeNull();
    expect(buildContentMeta({ questions: [] })).toBeNull();
  });
  it('keeps only the non-empty fields and coerces question entries', () => {
    expect(buildContentMeta({ summary: 'S', body_html: '  ', questions: [1, 2] as any, reflection: 'R' }))
      .toEqual({ summary: 'S', questions: ['1', '2'], reflection: 'R' });
  });
});
