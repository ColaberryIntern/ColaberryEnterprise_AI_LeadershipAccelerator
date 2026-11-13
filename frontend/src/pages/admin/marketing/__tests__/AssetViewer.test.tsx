import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { AssetViewer } from '../library/AdminMediaLibraryPage';
import { parseVideoUrl } from '../../../../utils/videoEmbed';
import type { LibraryAsset } from '../../../../services/libraryApi';

/**
 * What each kind of asset actually renders.
 *
 * Ali, 2026-11-13: "I should be able to click on it and play the video directly in the app" and
 * "also viewers for mp4 also". Four cases that are genuinely different, and the failure mode for
 * each is silent - a dead frame, or a control that does nothing, both look like a working UI
 * until someone clicks. So each case is pinned by what it renders rather than by eye.
 */

const BASE: LibraryAsset = {
  id: 'a-1', kind: 'link', sourceUrl: null, storageKey: null, mimeType: 'text/uri-list',
  originalFilename: null, altText: 'A description', tags: [], byteSize: null, width: null,
  height: null, durationMs: null, rightsHolder: null, rightsExpiresAt: null,
  rightsStatus: 'unknown', archivedAt: null, createdAt: null, url: null,
};

const asset = (over: Partial<LibraryAsset>): LibraryAsset => ({ ...BASE, ...over });

let container: HTMLDivElement;
let root: Root;

function render(a: LibraryAsset) {
  const video = a.kind === 'link' ? parseVideoUrl(a.sourceUrl) : null;
  const poster = null;
  act(() => { root.render(<AssetViewer asset={a} video={video} poster={poster} />); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('a link that is a real video', () => {
  // An eleven-character id: parseVideoUrl requires exactly that, and a shorter one falls through
  // to an "unknown link", which is how an earlier test managed to assert the wrong thing.
  const short = asset({ id: 'v-1', kind: 'link', sourceUrl: 'https://youtube.com/shorts/Pa5J5T6MZok?si=abc' });

  it('renders the app player rather than a dead thumbnail', () => {
    render(short);
    expect(container.querySelector('[data-testid="viewer-link-v-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="viewer-none-v-1"]')).toBeFalsy();
  });

  it('offers something to press, so it can actually be played', () => {
    render(short);
    // VideoEmbed draws a poster button that swaps in the provider iframe. Without a control
    // there is nothing to click and the feature does not exist.
    const pressable = container.querySelector('button, iframe');
    expect(pressable).toBeTruthy();
  });
});

describe('a link that is not a video', () => {
  it('falls back to the icon tile rather than a player that cannot play', () => {
    render(asset({ id: 'p-1', kind: 'link', sourceUrl: 'https://example.com/a-page' }));
    expect(container.querySelector('[data-testid="viewer-none-p-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="viewer-link-p-1"]')).toBeFalsy();
  });
});

describe('an mp4 file', () => {
  const mp4 = asset({
    id: 'f-1', kind: 'file', mimeType: 'video/mp4',
    storageKey: 'media/b/abc.mp4', url: 'https://example.test/signed/abc.mp4',
  });

  it('renders a native player pointed at the signed url', () => {
    render(mp4);
    const el = container.querySelector('[data-testid="viewer-video-f-1"]') as HTMLVideoElement | null;
    expect(el).toBeTruthy();
    expect(el!.tagName.toLowerCase()).toBe('video');
    expect(el!.getAttribute('src')).toBe('https://example.test/signed/abc.mp4');
    expect(el!.hasAttribute('controls')).toBe(true);
  });

  it('does not preload the whole file, because a grid would pull all of them', () => {
    render(mp4);
    const el = container.querySelector('[data-testid="viewer-video-f-1"]');
    expect(el!.getAttribute('preload')).toBe('metadata');
  });

  it('shows the fallback when signing failed, instead of a player that cannot load', () => {
    render(asset({ id: 'f-2', kind: 'file', mimeType: 'video/mp4', storageKey: 'media/b/x.mp4', url: null }));
    expect(container.querySelector('[data-testid="viewer-video-f-2"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="viewer-none-f-2"]')).toBeTruthy();
    expect(container.textContent).toContain('Preview unavailable');
  });
});

describe('an image file', () => {
  it('shows the image, with the description as its alt text', () => {
    render(asset({
      id: 'i-1', kind: 'file', mimeType: 'image/png', altText: 'Students at a whiteboard',
      storageKey: 'media/b/a.png', url: 'https://example.test/signed/a.png',
    }));
    const wrap = container.querySelector('[data-testid="viewer-image-i-1"]');
    expect(wrap).toBeTruthy();
    const img = wrap!.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://example.test/signed/a.png');
    // Not decorative here: the description IS the alt text, which is why the field is required.
    expect(img.getAttribute('alt')).toBe('Students at a whiteboard');
  });
});

describe('a PDF', () => {
  it('says what it is rather than pretending to play it', () => {
    render(asset({
      id: 'd-1', kind: 'file', mimeType: 'application/pdf',
      storageKey: 'media/b/a.pdf', url: 'https://example.test/signed/a.pdf',
    }));
    expect(container.querySelector('[data-testid="viewer-none-d-1"]')).toBeTruthy();
    expect(container.textContent?.toLowerCase()).toContain('pdf');
  });
});

describe('CONTROL: the four cases really are distinguished', () => {
  it('each kind renders its OWN viewer and not another', () => {
    // If every branch produced the same element, every assertion above would pass vacuously.
    const seen = new Set<string>();
    for (const a of [
      asset({ id: 'c-1', kind: 'link', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      asset({ id: 'c-2', kind: 'file', mimeType: 'video/mp4', url: 'https://example.test/s.mp4' }),
      asset({ id: 'c-3', kind: 'file', mimeType: 'image/png', url: 'https://example.test/s.png' }),
      asset({ id: 'c-4', kind: 'file', mimeType: 'application/pdf', url: 'https://example.test/s.pdf' }),
    ]) {
      render(a);
      const el = container.querySelector('[data-testid^="viewer-"]');
      expect(el).toBeTruthy();
      seen.add(el!.getAttribute('data-testid')!.replace(/-c-\d$/, ''));
    }
    expect([...seen].sort()).toEqual(['viewer-image', 'viewer-link', 'viewer-none', 'viewer-video']);
  });
});
