import { projectWalkthroughVideo } from '../caseStudyPublicSections';

/**
 * Which video reaches the hero, and what travels with it.
 *
 * The subtle failure here is not "the wrong video plays". It is the generated walkthrough's
 * METADATA surviving onto someone else's video: our WebVTT captioning their footage with our
 * narration script, or the "narrated by a synthetic voice" note printed under a video a human
 * recorded. Both would be a false statement on a public record, and both would look fine.
 */

const generated = {
  url: 'https://enterprise.colaberry.ai/media/walkthrough.mp4',
  title: 'Walkthrough',
  captionsUrl: 'https://enterprise.colaberry.ai/media/walkthrough.vtt',
  posterUrl: 'https://enterprise.colaberry.ai/media/poster.jpg',
  durationSeconds: 96,
  narrationSource: 'synthetic' as const,
};

const project = (v: unknown) => projectWalkthroughVideo({ walkthroughVideo: v } as never);

describe('the generated walkthrough', () => {
  it('projects the file, its captions and its narration source', () => {
    expect(project(generated)).toMatchObject({
      url: generated.url,
      captionsUrl: generated.captionsUrl,
      durationSeconds: 96,
      narrationSource: 'synthetic',
      embedUrl: null,
      provider: null,
    });
  });

  it('is null when the record carries no video at all', () => {
    expect(project(undefined)).toBeNull();
    expect(project({ title: 'Walkthrough' })).toBeNull();
  });
});

describe("an operator's own video", () => {
  const custom = { ...generated, embedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };

  it('wins the hero and is normalised to an embed URL', () => {
    expect(project(custom)).toMatchObject({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      watchUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });

  it('drops the generated FILE so no renderer can show both', () => {
    expect(project(custom)!.url).toBeNull();
  });

  it('does not carry our captions onto their video', () => {
    // THE LOAD-BEARING ASSERTION. The VTT is the narration script for OUR footage.
    expect(project(custom)!.captionsUrl).toBeNull();
  });

  it('does not claim a synthetic voice narrates a video we did not make', () => {
    expect(project(custom)!.narrationSource).toBeNull();
  });

  it('drops our poster and our duration too', () => {
    expect(project(custom)!.posterUrl).toBeNull();
    expect(project(custom)!.durationSeconds).toBeNull();
  });

  it('works on a record that never had a generated video', () => {
    // The whole point of writing the section rather than a nested key: a record with no
    // walkthrough must still be able to get one.
    const only = { title: 'Demo', embedUrl: 'https://vimeo.com/123456789' };
    expect(project(only)).toMatchObject({ provider: 'vimeo', url: null, title: 'Demo' });
  });
});

describe('an embed that no longer passes the allowlist', () => {
  it('falls back to the generated file rather than framing it', () => {
    // Snapshots are JSON. A bad import or a hand-edited override could put anything here,
    // so the parse is re-run at projection time and a refusal degrades rather than ships.
    const tampered = { ...generated, embedUrl: 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ' };
    const out = project(tampered)!;
    expect(out.embedUrl).toBeNull();
    expect(out.url).toBe(generated.url);
  });

  it('returns null when the bad embed was the ONLY video', () => {
    expect(project({ title: 'Demo', embedUrl: 'javascript:alert(1)' })).toBeNull();
  });
});
