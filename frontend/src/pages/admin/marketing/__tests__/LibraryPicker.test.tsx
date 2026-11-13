import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import LibraryPicker from '../composer/LibraryPicker';
import type { SetupValues } from '../composer/ComposerSetup';
import type { LibraryAsset } from '../../../../services/libraryApi';

/**
 * The landing-page collision, and the reachability of the picker itself.
 *
 * WHY THIS FILE EXISTS. The collision is the one thing in this build Ali decided by hand -
 * 2026-11-13, warn and confirm rather than replace silently - and a silent regression in it loses
 * a post's destination with no trace. `applyDestination` with a url sets `landing_page_id: null`,
 * so the ONLY thing standing between a draft and a dropped landing page is this component asking
 * first. That deserves a test more than anything else here.
 *
 * It also pins reachability. Review found the picker mounted inside the composer's `mediaSlot`,
 * which is null when setupShape(content_type).mediaRole is 'none' - text and poll - so "Choose
 * from library" did not exist on a NEW post, whose content_type is 'text'. Nothing typed could
 * catch that: the gate was in the host component, not in this one. So the first test here renders
 * with content_type 'text' and requires the button to be present.
 */

jest.mock('../../../../services/libraryApi', () => {
  const actual = jest.requireActual('../../../../services/libraryApi');
  return {
    ...actual,
    listLibrary: jest.fn(),
    attachExistingAsset: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const libraryApi = require('../../../../services/libraryApi');

// NOTE: a YouTube id is ELEVEN characters. 'abc123' does not match parseVideoUrl at all, so a
// fixture using it is an UNKNOWN link wearing a YouTube URL - which is exactly how the first
// version of this test managed to assert the wrong thing.
const LINK_ASSET: LibraryAsset = {
  id: 'asset-link-1',
  kind: 'link',
  sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
  storageKey: null,
  mimeType: 'text/uri-list',
  originalFilename: null,
  altText: 'The November open house clip',
  tags: [],
  byteSize: null,
  width: null,
  height: null,
  durationMs: null,
  rightsHolder: null,
  rightsExpiresAt: null,
  rightsStatus: 'unknown',
  archivedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  // A link is never signed: its playable address is sourceUrl.
  url: null,
};

const PLAIN_LINK: LibraryAsset = { ...LINK_ASSET, id: 'asset-link-2', sourceUrl: 'https://example.com/a-page' };

const SETUP: SetupValues = {
  brand_id: 'b-1',
  campaign_id: '',
  title: 'A draft',
  landing_page_id: null,
  destination_url: '',
  canonical_body: 'Body',
  content_type: 'text',
  is_paid: false,
  has_offer: false,
  poll: null,
};

let container: HTMLDivElement;
let root: Root;

async function render(values: SetupValues, onChange: jest.Mock, assets: LibraryAsset[] = [LINK_ASSET]) {
  (libraryApi.listLibrary as jest.Mock).mockResolvedValue({ assets, total: assets.length, limit: 100, offset: 0 });
  await act(async () => {
    root.render(
      <LibraryPicker
        contentItemId="item-1"
        brandId="b-1"
        values={values}
        onChange={onChange}
        landingPages={[{ id: 'page-1', name: 'November Open House' }]}
        onAttached={() => undefined}
        busy={false}
      />,
    );
    await new Promise((r) => setTimeout(r, 0));
  });
}

const click = async (el: Element | null) => {
  if (!el) throw new Error('nothing to click');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
};

const openPicker = async () => click(container.querySelector('[data-testid="open-library-picker"]'));
const text = () => container.textContent ?? '';

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the picker is reachable at all', () => {
  it('renders for a draft whose content_type is text, the DEFAULT for a new post', async () => {
    // The regression this pins: mounted inside mediaSlot, the button did not exist here.
    await render(SETUP, jest.fn());
    expect(container.querySelector('[data-testid="open-library-picker"]')).toBeTruthy();
  });

  it('renders for a poll too, the other type with no media role', async () => {
    await render({ ...SETUP, content_type: 'poll' }, jest.fn());
    expect(container.querySelector('[data-testid="open-library-picker"]')).toBeTruthy();
  });
});

describe('choosing a link when the draft has NO landing page', () => {
  it('applies immediately, with no confirm', async () => {
    const onChange = jest.fn();
    await render(SETUP, onChange);
    await openPicker();
    await click(container.querySelector('[data-testid="pick-asset-link-1"]'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      content_type: 'link',
      destination_url: 'https://youtu.be/dQw4w9WgXcQ',
      landing_page_id: null,
    });
  });
});

describe('choosing a link when the draft DOES point at a landing page', () => {
  const withPage: SetupValues = { ...SETUP, landing_page_id: 'page-1' };

  it('changes NOTHING until the question is answered, and names the page', async () => {
    const onChange = jest.fn();
    await render(withPage, onChange);
    await openPicker();
    await click(container.querySelector('[data-testid="pick-asset-link-1"]'));

    // The assertion that matters: not applied yet.
    expect(onChange).not.toHaveBeenCalled();
    expect(text()).toContain('November Open House');
    expect(text()).toContain('Keep the page');
  });

  it('declining leaves the draft exactly as it was', async () => {
    const onChange = jest.fn();
    await render(withPage, onChange);
    await openPicker();
    await click(container.querySelector('[data-testid="pick-asset-link-1"]'));
    const keep = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Keep the page');
    await click(keep ?? null);

    expect(onChange).not.toHaveBeenCalled();
    expect(text()).not.toContain('Keep the page');
  });

  it('accepting clears the landing page and sets the destination, once', async () => {
    const onChange = jest.fn();
    await render(withPage, onChange);
    await openPicker();
    await click(container.querySelector('[data-testid="pick-asset-link-1"]'));
    const use = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Use the link instead');
    await click(use ?? null);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      content_type: 'link',
      landing_page_id: null,
      destination_url: 'https://youtu.be/dQw4w9WgXcQ',
    });
  });

  it('the warning is ANNOUNCED, not merely drawn', async () => {
    // role="alert" rather than alertdialog: the first version was silent for a screen reader,
    // which is the "never dead-ends" clause failing for the people it matters most for.
    const onChange = jest.fn();
    await render(withPage, onChange);
    await openPicker();
    await click(container.querySelector('[data-testid="pick-asset-link-1"]'));
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });
});

describe('the link badge', () => {
  it('names a recognised provider and says nothing extra for a plain URL', async () => {
    // parseVideoUrl never returns null for a non-empty URL, and providerLabel maps both 'unknown'
    // and 'file' to the word "source" - so an unconditional suffix read "Link post · source" on
    // every plain link anyone saved.
    await render(SETUP, jest.fn(), [LINK_ASSET, PLAIN_LINK]);
    await openPicker();
    expect(text()).toContain('Link post · YouTube');
    expect(text()).not.toContain('Link post · source');
  });
});

describe('a file never becomes a destination, and a link never becomes an attachment', () => {
  it('picking a link does not call the attach endpoint', async () => {
    const onChange = jest.fn();
    await render(SETUP, onChange);
    await openPicker();
    await click(container.querySelector('[data-testid="pick-asset-link-1"]'));
    expect(libraryApi.attachExistingAsset).not.toHaveBeenCalled();
  });

  it('picking a file does not touch the post destination', async () => {
    const fileAsset: LibraryAsset = {
      ...LINK_ASSET, id: 'asset-file-1', kind: 'file', sourceUrl: null,
      storageKey: 'media/b/abc.png', mimeType: 'image/png', altText: 'A picture',
    };
    const onChange = jest.fn();
    await render(SETUP, onChange, [fileAsset]);
    await openPicker();
    await click(container.querySelector('[data-testid="pick-asset-file-1"]'));
    // Selecting is local; nothing about the post changes until Attach is pressed, and even then
    // only the join table is written.
    expect(onChange).not.toHaveBeenCalled();
  });
});
