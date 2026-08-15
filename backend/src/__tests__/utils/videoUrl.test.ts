/**
 * videoUrl — unit tests for the backend playable-video detector that decides
 * whether an intel item's link gets mirrored into `metadata.video` (and so
 * becomes playable in the timeline player).
 *
 * The failure this guards against is asymmetric, so both directions are tested:
 * a FALSE NEGATIVE reproduces the 2026-08-15 audit bug (a real YouTube video
 * that never reaches the player, rendering a play button that leads nowhere),
 * while a FALSE POSITIVE would be worse at scale — every article-linked intel
 * card (ai_news_flash, ai_research_digest, ...) would start rendering a dead
 * player box in place of its content.
 */
import { isPlayableVideoUrl, videoMetadataForUrl } from '../../utils/videoUrl';

describe('isPlayableVideoUrl', () => {
  describe('playable providers', () => {
    // The exact shapes the ai_video_stream source emits plus the other providers
    // frontend parseVideoUrl can embed.
    it.each([
      ['youtube watch', 'https://www.youtube.com/watch?v=6ipM3b0V3Ss'],
      ['youtube watch with extra params', 'https://www.youtube.com/watch?list=PL123&v=6ipM3b0V3Ss'],
      ['youtube short link', 'https://youtu.be/6ipM3b0V3Ss'],
      ['youtube embed', 'https://www.youtube.com/embed/6ipM3b0V3Ss'],
      ['youtube shorts', 'https://www.youtube.com/shorts/6ipM3b0V3Ss'],
      ['vimeo', 'https://vimeo.com/123456789'],
      ['vimeo video path', 'https://vimeo.com/video/123456789'],
      ['loom share', 'https://www.loom.com/share/abc123def456'],
      ['wistia medias', 'https://colaberry.wistia.com/medias/abc123'],
      ['direct mp4', 'https://cdn.example.com/lesson.mp4'],
      ['direct mp4 with query', 'https://cdn.example.com/lesson.mp4?sig=xyz'],
    ])('accepts %s', (_label, url) => {
      expect(isPlayableVideoUrl(url)).toBe(true);
    });
  });

  describe('not playable', () => {
    it.each([
      ['a plain article', 'https://www.anthropic.com/news/some-post'],
      ['an arxiv paper', 'https://arxiv.org/abs/2401.12345'],
      ['a youtube channel, not a video', 'https://www.youtube.com/@somechannel'],
      ['a youtube search page', 'https://www.youtube.com/results?search_query=ai'],
      ['a bare pdf', 'https://example.com/whitepaper.pdf'],
      ['an mp3 (audio, not the video player)', 'https://www.buzzsprout.com/ep/1.mp3'],
      ['empty string', ''],
      ['whitespace only', '   '],
    ])('rejects %s', (_label, url) => {
      expect(isPlayableVideoUrl(url)).toBe(false);
    });

    it('rejects null and undefined without throwing', () => {
      expect(isPlayableVideoUrl(null)).toBe(false);
      expect(isPlayableVideoUrl(undefined)).toBe(false);
    });

    it('rejects a youtube id of the wrong length', () => {
      // Provider ids are exactly 11 chars; a looser pattern would match junk.
      expect(isPlayableVideoUrl('https://www.youtube.com/watch?v=tooshort')).toBe(false);
    });
  });
});

describe('videoMetadataForUrl', () => {
  it('builds the block videoFromMetadata reads, carrying the title', () => {
    expect(videoMetadataForUrl('https://www.youtube.com/watch?v=6ipM3b0V3Ss', 'What Is a Transformer?')).toEqual({
      url: 'https://www.youtube.com/watch?v=6ipM3b0V3Ss',
      title: 'What Is a Transformer?',
    });
  });

  it('returns null for a non-playable link so the card stays a content card', () => {
    expect(videoMetadataForUrl('https://arxiv.org/abs/2401.12345', 'A paper')).toBeNull();
  });

  it('nulls a blank title rather than storing empty string', () => {
    expect(videoMetadataForUrl('https://vimeo.com/123456789', '   ')).toEqual({
      url: 'https://vimeo.com/123456789',
      title: null,
    });
  });

  it('trims surrounding whitespace on the url', () => {
    expect(videoMetadataForUrl('  https://vimeo.com/123456789  ', null)).toEqual({
      url: 'https://vimeo.com/123456789',
      title: null,
    });
  });
});
