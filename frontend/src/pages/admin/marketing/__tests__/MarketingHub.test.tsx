import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import MarketingHub, { MARKETING_DESTINATIONS } from '../MarketingHub';
import { postPermalink } from '../composer/postPermalink';

/**
 * Collapsing the rail to one button only works if the Overview carries the doors.
 *
 * Ali, 2026-10-08: "minimize the navigation on the left side down to preferably one button so
 * that means every page should have some type of connection on the dashboard". The second half
 * is the risk: remove seven sidebar rows without replacing them and seven pages become reachable
 * only by typing a URL. Nothing else in the suite would notice.
 *
 * So the test that matters is the coverage one - every route the rail used to offer still has a
 * door here.
 */

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(<MemoryRouter><MarketingHub /></MemoryRouter>);
  });
}

function hrefs() {
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

/** Every marketing page the left rail used to link to, before it collapsed to one button. */
const PAGES_THE_RAIL_USED_TO_OFFER = [
  '/admin/marketing/composer',
  '/admin/marketing/content',
  '/admin/marketing/calendar',
  '/admin/marketing/landing-pages',
  '/admin/marketing/publishing',
  '/admin/marketing/performance',
  '/admin/marketing/brands',
];

describe('no page is stranded by the smaller rail', () => {
  it('offers a door to every page the rail used to', async () => {
    await mount();
    const links = hrefs();
    PAGES_THE_RAIL_USED_TO_OFFER.forEach((path) => expect(links).toContain(path));
  });

  it('renders one door per destination, with nothing duplicated', async () => {
    await mount();
    expect(hrefs()).toHaveLength(MARKETING_DESTINATIONS.length);
    expect(new Set(MARKETING_DESTINATIONS.map((d) => d.to)).size).toBe(MARKETING_DESTINATIONS.length);
  });

  it('says what each page is for, so the hub is not seven bare words', async () => {
    await mount();
    MARKETING_DESTINATIONS.forEach((d) => {
      expect(container.textContent).toContain(d.label);
      expect(container.textContent).toContain(d.blurb);
    });
  });

  it('opens the composer, which is the one page that cannot be reached any other way', async () => {
    // Deleting the routes was explicitly refused: "Don't delete the page." This is why.
    await mount();
    expect(hrefs()).toContain('/admin/marketing/composer');
  });
});

/**
 * The receipt link.
 *
 * Ali: "the Receipt gives an error. We need a way to get a link to the actual post." His reel
 * published fine; what we stored was `/reel/2167527427309056/`, and as a bare href that resolved
 * against the admin's own hostname.
 */
describe('a receipt links to the post, not to this admin', () => {
  it('absolutises the relative path Meta returns for a reel', () => {
    // The exact value from the row Ali was looking at.
    expect(postPermalink('/reel/2167527427309056/', 'meta_facebook_page'))
      .toBe('https://www.facebook.com/reel/2167527427309056/');
  });

  it('leaves an already-absolute permalink alone', () => {
    const url = 'https://www.facebook.com/123/posts/456';
    expect(postPermalink(url, 'meta_facebook_page')).toBe(url);
  });

  it('knows where a relative LinkedIn path belongs', () => {
    expect(postPermalink('/feed/update/urn:li:share:7/', 'linkedin'))
      .toBe('https://www.linkedin.com/feed/update/urn:li:share:7/');
  });

  it('returns null rather than guessing a host for an unknown provider', () => {
    // A link that might go somewhere else is worse than no link: this one is clicked to confirm
    // that something real was published.
    expect(postPermalink('/reel/1/', 'some_new_network')).toBeNull();
  });

  it('refuses a bare id, which is not an address', () => {
    expect(postPermalink('2167527427309056', 'meta_facebook_page')).toBeNull();
  });

  it('never turns a stored javascript: or data: value into an href', () => {
    // This value round-trips through a database before becoming an anchor.
    expect(postPermalink('javascript:alert(1)', 'meta_facebook_page')).toBeNull();
    expect(postPermalink('data:text/html,<script>', 'meta_facebook_page')).toBeNull();
  });

  it('treats empty, whitespace and null as no link', () => {
    expect(postPermalink(null, 'meta_facebook_page')).toBeNull();
    expect(postPermalink(undefined, 'meta_facebook_page')).toBeNull();
    expect(postPermalink('   ', 'meta_facebook_page')).toBeNull();
  });
});
