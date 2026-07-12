import { youtubeId } from '../../services/timeline/videoDraftService';
import { buildContentMeta, buildCourseMeta } from '../../services/timeline/timelineAdminService';

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

// buildCourseMeta stores the Skills Course class name + link; empty → null so a
// blank box never writes a course onto a non-Skills card.
describe('buildCourseMeta', () => {
  it('returns null when neither field is usable', () => {
    expect(buildCourseMeta(null)).toBeNull();
    expect(buildCourseMeta({})).toBeNull();
    expect(buildCourseMeta({ name: '   ', url: '' })).toBeNull();
  });
  it('trims and fills the missing field with null', () => {
    expect(buildCourseMeta({ name: ' Intro to MCP ', url: ' https://x.skilljar.com/c ' })).toEqual({ name: 'Intro to MCP', url: 'https://x.skilljar.com/c' });
    expect(buildCourseMeta({ name: 'Only name' })).toEqual({ name: 'Only name', url: null });
  });
});
