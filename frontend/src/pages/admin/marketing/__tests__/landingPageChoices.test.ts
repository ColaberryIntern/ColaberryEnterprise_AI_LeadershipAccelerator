import {
  applyDestination,
  canGenerateLinks,
  destinationMode,
  externalUrlNote,
  pickerNote,
  pruneDestination,
  selectablePages,
  unselectablePages,
  type LandingPageOption,
} from '../composer/landingPageChoices';

/**
 * The landing-page picker's rules.
 *
 * The failure these exist to prevent: a picker that offers a page the server will refuse. The
 * server validates the same three things (same brand, hosted, published), so every option here
 * that it would reject is a dead end the operator reaches instead of a choice.
 */

const BRAND = 'b-train';
const OTHER = 'b-ent';

function page(over: Partial<LandingPageOption> = {}): LandingPageOption {
  return {
    id: 'lp-1', name: 'Six-week build', slug: 'six-week-build', kind: 'hosted',
    status: 'published', brand_id: BRAND, path: '/lp/colaberry-training/six-week-build', ...over,
  };
}

describe('what may be picked', () => {
  it('offers a published hosted page on this brand', () => {
    expect(selectablePages([page()], BRAND).map((p) => p.id)).toEqual(['lp-1']);
  });

  it('never offers another brand\'s page', () => {
    expect(selectablePages([page({ brand_id: OTHER })], BRAND)).toEqual([]);
  });

  it('never offers a draft - the post would go out pointing at a 404', () => {
    expect(selectablePages([page({ status: 'draft' })], BRAND)).toEqual([]);
  });

  it('never offers an archived page', () => {
    expect(selectablePages([page({ status: 'archived' })], BRAND)).toEqual([]);
  });

  it('never offers a legacy external_path row - the tracking would stop at the click', () => {
    expect(selectablePages([page({ kind: 'external_path' })], BRAND)).toEqual([]);
  });

  it('never offers a page with no slug, which has no URL', () => {
    expect(selectablePages([page({ slug: null })], BRAND)).toEqual([]);
  });

  it('offers nothing at all before a brand is chosen', () => {
    expect(selectablePages([page()], '')).toEqual([]);
  });

  it('sorts by name, so the list does not reshuffle between loads', () => {
    const pages = [page({ id: 'c', name: 'Zebra' }), page({ id: 'a', name: 'Apple' }), page({ id: 'b', name: 'Mango' })];
    expect(selectablePages(pages, BRAND).map((p) => p.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });
});

describe('pages that exist but are not ready', () => {
  it('names a draft as a draft', () => {
    expect(unselectablePages([page({ status: 'draft' })], BRAND)).toEqual([
      { page: page({ status: 'draft' }), reason: 'still a draft' },
    ]);
  });

  it('names a missing URL rather than calling it a draft', () => {
    expect(unselectablePages([page({ slug: null })], BRAND)[0].reason).toBe('has no URL yet');
  });

  it('states any other status plainly', () => {
    expect(unselectablePages([page({ status: 'archived' })], BRAND)[0].reason).toBe('is archived');
  });

  it('does not list another brand\'s unready pages', () => {
    expect(unselectablePages([page({ brand_id: OTHER, status: 'draft' })], BRAND)).toEqual([]);
  });
});

describe('the note above the picker', () => {
  it('asks for a brand first, because pages belong to one', () => {
    expect(pickerNote([], '')).toMatch(/Choose a brand first/);
  });

  it('says there are none yet, and what to do instead', () => {
    expect(pickerNote([], BRAND)).toMatch(/no landing pages yet. Build one, or give this post a plain URL/);
  });

  it('when none are ready, NAMES them and why - not a count', () => {
    // "1 page is not ready" sends the operator hunting for which one.
    const note = pickerNote([page({ status: 'draft', name: 'November cohort' })], BRAND)!;
    expect(note).toContain('November cohort (still a draft)');
  });

  it('when some are ready, still names the ones that are not', () => {
    const note = pickerNote([page(), page({ id: 'lp-2', name: 'Spring', status: 'draft' })], BRAND)!;
    expect(note).toContain('Spring (still a draft)');
  });

  it('says nothing when everything is ready - a note that always appears is never read', () => {
    expect(pickerNote([page()], BRAND)).toBeNull();
  });
});

describe('the honest warning on a typed URL', () => {
  it('appears only when a URL is actually in use', () => {
    expect(externalUrlNote('url')).toMatch(/tracked as far as the click and no further/);
    expect(externalUrlNote('page')).toBeNull();
    expect(externalUrlNote('none')).toBeNull();
  });

  it('warns rather than forbids - a partner page is not ours to build', () => {
    expect(externalUrlNote('url')).toMatch(/Prefer a landing page built here when there is one/);
  });
});

describe('the two fields stay mutually exclusive', () => {
  const values = { landing_page_id: null as string | null, destination_url: '', brand_id: BRAND };

  it('picking a page clears a typed URL', () => {
    const typed = { ...values, destination_url: 'https://partner.example/signup' };
    expect(applyDestination(typed, { kind: 'page', id: 'lp-1' }))
      .toEqual({ landing_page_id: 'lp-1', destination_url: '', brand_id: BRAND });
  });

  it('typing a URL clears a picked page', () => {
    const picked = { ...values, landing_page_id: 'lp-1' };
    expect(applyDestination(picked, { kind: 'url', url: 'https://partner.example' }))
      .toEqual({ landing_page_id: null, destination_url: 'https://partner.example', brand_id: BRAND });
  });

  it('clearing removes both', () => {
    expect(applyDestination({ ...values, landing_page_id: 'lp-1' }, { kind: 'none' }))
      .toEqual({ landing_page_id: null, destination_url: '', brand_id: BRAND });
  });

  it('why it matters: both set would publish the page while the operator reads the URL', () => {
    // The server prefers the page. So the UI must never leave both populated.
    const both = applyDestination({ ...values, destination_url: 'https://x' }, { kind: 'page', id: 'lp-1' });
    expect(destinationMode(both)).toBe('page');
    expect(both.destination_url).toBe('');
  });
});

describe('the mode, and whether links can be generated', () => {
  it.each([
    [{ landing_page_id: 'lp-1', destination_url: '' }, 'page'],
    [{ landing_page_id: null, destination_url: 'https://x' }, 'url'],
    [{ landing_page_id: null, destination_url: '' }, 'none'],
    [{ landing_page_id: null, destination_url: '   ' }, 'none'],
  ])('%p is %s', (values, expected) => {
    expect(destinationMode(values as never)).toBe(expected);
  });

  it('links need a destination of either kind', () => {
    expect(canGenerateLinks({ landing_page_id: 'lp-1', destination_url: '' })).toBe(true);
    expect(canGenerateLinks({ landing_page_id: null, destination_url: 'https://x' })).toBe(true);
    expect(canGenerateLinks({ landing_page_id: null, destination_url: '' })).toBe(false);
  });
});

describe('a selection must not survive a brand change', () => {
  it('drops a page that belongs to the brand no longer selected', () => {
    // Otherwise the server refuses the save with a message about a different brand, which reads
    // as a bug rather than as the consequence of switching brand.
    const values = { landing_page_id: 'lp-1', destination_url: '', brand_id: OTHER };
    expect(pruneDestination(values, [page()]).landing_page_id).toBeNull();
  });

  it('keeps a selection that is still valid', () => {
    const values = { landing_page_id: 'lp-1', destination_url: '', brand_id: BRAND };
    expect(pruneDestination(values, [page()]).landing_page_id).toBe('lp-1');
  });

  it('drops a selection whose page became a draft again', () => {
    const values = { landing_page_id: 'lp-1', destination_url: '', brand_id: BRAND };
    expect(pruneDestination(values, [page({ status: 'draft' })]).landing_page_id).toBeNull();
  });

  it('returns the SAME object when nothing changes, so a React effect cannot loop', () => {
    const values = { landing_page_id: 'lp-1', destination_url: '', brand_id: BRAND };
    expect(pruneDestination(values, [page()])).toBe(values);
    const empty = { landing_page_id: null, destination_url: '', brand_id: BRAND };
    expect(pruneDestination(empty, [])).toBe(empty);
  });
});
