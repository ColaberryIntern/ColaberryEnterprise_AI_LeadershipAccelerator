/**
 * Where a part-watched video starts, and where it deliberately does not.
 *
 * Reported by the QA tester 2026-11-24: a video reopened from the middle always
 * started over, although the server had the playhead stored the whole time.
 */
import { resumeTargetS, withStartAt, MIN_RESUME_S, END_TAIL_S } from '../watchResume';

describe('resumeTargetS', () => {
  it('resumes the middle of a class, to the whole second', () => {
    expect(resumeTargetS(1080, 1200)).toBe(1080);     // 18 min into 20
    expect(resumeTargetS(412.87, 1200)).toBe(412);    // floored, never ahead of where they got
  });

  it('starts from the top when barely anything was watched', () => {
    expect(resumeTargetS(0, 1200)).toBeNull();
    expect(resumeTargetS(MIN_RESUME_S - 1, 1200)).toBeNull();
    expect(resumeTargetS(MIN_RESUME_S, 1200)).toBe(MIN_RESUME_S);
  });

  it('starts from the top when they already reached the end', () => {
    // A finished card must be rewatchable. Dropping someone on the closing
    // seconds of a video they completed reads as broken.
    expect(resumeTargetS(1200, 1200)).toBeNull();
    expect(resumeTargetS(1200 - END_TAIL_S, 1200)).toBeNull();
    expect(resumeTargetS(1200 - END_TAIL_S - 1, 1200)).toBe(1200 - END_TAIL_S - 1);
  });

  it('still resumes when the duration is unknown, which is when scrubbing back hurts most', () => {
    // Loom and Wistia report no duration. The tail rule simply does not apply.
    expect(resumeTargetS(600, null)).toBe(600);
    expect(resumeTargetS(600, 0)).toBe(600);
    expect(resumeTargetS(600, undefined)).toBe(600);
  });

  it('treats junk as no position rather than seeking somewhere absurd', () => {
    expect(resumeTargetS(null, 1200)).toBeNull();
    expect(resumeTargetS(undefined, 1200)).toBeNull();
    expect(resumeTargetS(NaN, 1200)).toBeNull();
    expect(resumeTargetS(Infinity, 1200)).toBeNull();
    expect(resumeTargetS(-30, 1200)).toBeNull();
  });
});

describe('withStartAt', () => {
  it('asks YouTube and Vimeo to start at the second, each in its own dialect', () => {
    expect(withStartAt('https://www.youtube.com/embed/abc?rel=0', 'youtube', 1080))
      .toBe('https://www.youtube.com/embed/abc?rel=0&start=1080');
    expect(withStartAt('https://www.youtube.com/embed/abc', 'youtube', 1080))
      .toBe('https://www.youtube.com/embed/abc?start=1080');
    expect(withStartAt('https://player.vimeo.com/video/123?h=x', 'vimeo', 95))
      .toBe('https://player.vimeo.com/video/123?h=x#t=95s');
  });

  it('leaves providers with no documented start point untouched, rather than guessing', () => {
    const loom = 'https://www.loom.com/embed/abc';
    expect(withStartAt(loom, 'loom', 600)).toBe(loom);
    const wistia = 'https://fast.wistia.net/embed/iframe/abc';
    expect(withStartAt(wistia, 'wistia', 600)).toBe(wistia);
  });

  it('never overrides a start point the author already put in the link', () => {
    const authored = 'https://www.youtube.com/embed/abc?start=30';
    expect(withStartAt(authored, 'youtube', 900)).toBe(authored);
    const vimeoAuthored = 'https://player.vimeo.com/video/123#t=30s';
    expect(withStartAt(vimeoAuthored, 'vimeo', 900)).toBe(vimeoAuthored);
  });

  it('is a no-op when there is nothing to resume to', () => {
    const url = 'https://www.youtube.com/embed/abc';
    expect(withStartAt(url, 'youtube', null)).toBe(url);
    expect(withStartAt(url, 'youtube', 0)).toBe(url);
    expect(withStartAt('', 'youtube', 900)).toBe('');
  });
});
