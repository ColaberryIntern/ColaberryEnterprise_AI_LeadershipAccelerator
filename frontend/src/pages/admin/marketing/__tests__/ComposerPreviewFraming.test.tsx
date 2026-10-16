import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ComposerPreview from '../composer/ComposerPreview';
import type { ContentVariant, ItemMedia, ProviderKey, ProviderSummary } from '../../../../services/contentComposerApi';

/**
 * The frame has to reach the DOM, not just the helper.
 *
 * `previewFraming.test.ts` proves the arithmetic. That is not the same claim: a correct helper
 * whose result never reaches a style attribute looks exactly like a working feature from the
 * unit tests, and exactly like the old 360px box on screen. This file asserts the rendered
 * element - its measured size and the sentence under it - so breaking the wiring fails a test.
 */

let container: HTMLDivElement;
let root: Root;

const provider = (over: Partial<ProviderSummary>): ProviderSummary => ({
  provider: 'tiktok' as ProviderKey, displayName: 'TikTok', mode: 'direct', maxChars: 2200,
  ...over,
} as ProviderSummary);

const VARIANTS: ContentVariant[] = [
  { provider: 'tiktok' as ProviderKey, body: 'Build day', is_manually_edited: false } as ContentVariant,
];

function media(over: Partial<ItemMedia> = {}): ItemMedia {
  return {
    mediaAssetId: 'm-1', mimeType: 'video/mp4', byteSize: 77_100_000, width: 1080, height: 1920,
    altText: 'Build day', position: 0, originalFilename: 'reel.mp4', durationMs: 55_000,
    pages: null, url: 'https://www.refactored.ai/m/b/reel.mp4?e=1&s=x', ...over,
  };
}

function render(providers: ProviderSummary[], m: ItemMedia) {
  act(() => {
    root.render(
      <ComposerPreview
        variants={VARIANTS} providers={providers} links={[]} mediaCount={1}
        media={[m]} brandName="Colaberry Training"
      />,
    );
  });
}

const video = () => container.querySelector('[data-testid="preview-video-m-1"]') as HTMLVideoElement;
const note = () => container.querySelector('[data-testid="preview-crop-note"]');
const toggle = () => container.querySelector('[data-testid="preview-frame-toggle"]') as HTMLButtonElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('the shape the network will actually use', () => {
  it('draws a vertical video in a 9:16 box, and says nothing because nothing is cut', () => {
    render([provider({ videoRatios: ['9:16'] })], media({ width: 1080, height: 1920 }));

    // 420 tall is the cap; 9:16 of that is 236 wide. The old box was full width by 360.
    expect(video().style.height).toBe('420px');
    expect(video().style.width).toBe('236px');
    expect(video().style.objectFit).toBe('cover');
    expect(note()).toBeNull();
  });

  it('draws a landscape video in that same 9:16 box and states what the crop costs', () => {
    render([provider({ videoRatios: ['9:16'] })], media({ width: 1920, height: 1080 }));

    expect(video().style.width).toBe('236px');
    expect(note()?.textContent).toContain('TikTok crops this to 9:16');
    expect(note()?.textContent).toContain('68% of the width');
  });

  it('uses the nearest shape the network takes, not the first one it lists', () => {
    render(
      [provider({ displayName: 'Facebook Page', videoRatios: ['16:9', '1:1', '4:5', '9:16'] })],
      media({ width: 1920, height: 1080 }),
    );
    // 16:9 at 520 wide is 293 tall, inside the 420 cap - so the full card width is used.
    expect(video().style.width).toBe('520px');
    expect(video().style.height).toBe('293px');
    expect(note()).toBeNull();
  });
});

describe('what it refuses to claim', () => {
  it('falls back to the plain box when the file has no recorded dimensions', () => {
    render([provider({ videoRatios: ['9:16'] })], media({ width: null, height: null }));

    expect(video().style.maxHeight).toBe('360px');
    expect(video().style.objectFit).toBe('contain');
    expect(note()).toBeNull();
    // No frame means no crop to show, so the toggle would do nothing and is not offered.
    expect(toggle()).toBeNull();
  });

  it('falls back when the server has sent no ratios for this provider', () => {
    // A frontend deployed ahead of the backend that added them. Guessing a frame here would
    // show a crop the network may never apply.
    render([provider({})], media());
    expect(video().style.objectFit).toBe('contain');
    expect(note()).toBeNull();
  });
});

describe('seeing the parts being cut', () => {
  it('restores the whole file, and puts the crop back', () => {
    render([provider({ videoRatios: ['9:16'] })], media({ width: 1920, height: 1080 }));
    expect(note()).not.toBeNull();

    act(() => { toggle().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(video().style.objectFit).toBe('contain');
    expect(note()).toBeNull();
    expect(toggle().textContent).toContain('as TikTok will crop it');

    act(() => { toggle().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(video().style.width).toBe('236px');
    expect(note()).not.toBeNull();
  });
});
