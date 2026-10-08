import { previewFileName, OPEN_REVOKE_MS, DOWNLOAD_REVOKE_MS } from '../landingPagePreviewFile';

/**
 * What a downloaded page is called.
 *
 * Worth pinning because the inputs are the two fields most likely to be empty at the moment
 * someone presses Download: a page can be previewed before it has a slug, and the name can be
 * whitespace. Either producing a file called ".html" is the bug this guards.
 */

describe('previewFileName', () => {
  it('prefers the slug, which is how the page will be addressed', () => {
    expect(previewFileName('October $0 Class', 'october-class')).toBe('october-class.html');
  });

  it('falls back to a slugified name when there is no slug yet', () => {
    // A page can be previewed before it is published, and an unpublished page has no slug.
    expect(previewFileName('October $0 Class', null)).toBe('october-0-class.html');
  });

  it('treats a blank slug as no slug rather than as a stem', () => {
    expect(previewFileName('AI Learning Platform', '   ')).toBe('ai-learning-platform.html');
  });

  it('never produces a file with no stem', () => {
    // The actual failure mode: a browser saving a file called ".html".
    expect(previewFileName('', null)).toBe('landing-page.html');
    expect(previewFileName('   ', '')).toBe('landing-page.html');
    expect(previewFileName('!!!', null)).toBe('landing-page.html');
  });

  it('strips punctuation that has no business in a filename', () => {
    expect(previewFileName('Start Learning AI for $0 Today!', null)).toBe('start-learning-ai-for-0-today.html');
  });

  it('caps a very long name rather than writing a 300-character filename', () => {
    const stem = previewFileName('word '.repeat(60), null).replace('.html', '');
    expect(stem.length).toBeLessThanOrEqual(60);
  });

  it('leaves no leading or trailing dash on the stem', () => {
    expect(previewFileName('  --October--  ', null)).toBe('october.html');
  });
});

describe('blob URLs are released, but not before the browser has read them', () => {
  it('keeps an opened tab\'s URL alive long enough to load', () => {
    // Revoking immediately pulls the document out from under the new tab - the obvious bug here.
    expect(OPEN_REVOKE_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('releases both eventually, so a long session does not accumulate blobs', () => {
    expect(DOWNLOAD_REVOKE_MS).toBeGreaterThan(0);
    expect(OPEN_REVOKE_MS).toBeGreaterThan(0);
  });
});
