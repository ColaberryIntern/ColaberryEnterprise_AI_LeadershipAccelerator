import {
  canView, filterViewable, isLive, approvalState, canPublish,
  SHOWCASE_SURFACES, type ShowcaseRow, type ShowcaseSurface,
} from '../showcaseAccess';

/**
 * Private must stay private on EVERY surface, not just the one somebody remembered.
 *
 * The failure this is shaped against is not a missing check on the gallery. It is the
 * gallery being locked and the THUMBNAIL still being served — or the transcript, or
 * the search index, or the download. A student picks "private", and finds their
 * rehearsal in a search result because one endpoint resolved a row by id and returned
 * it.
 *
 * So every test below runs across `SHOWCASE_SURFACES`. A surface added to the product
 * without being added to that list is the gap these tests exist to make visible.
 */

const OWNER = 'owner-1';
const COHORT = 'cohort-a';

const row = (over: Partial<ShowcaseRow> = {}): ShowcaseRow => ({
  id: 's1',
  ownerEnrollmentId: OWNER,
  cohortId: COHORT,
  audience: 'private',
  contentHash: 'hash-1',
  currentContentHash: 'hash-1',
  authorApprovedAt: new Date(),
  staffApprovedAt: new Date(),
  publishedAt: new Date(),
  withdrawnAt: null,
  ...over,
});

const owner = { enrollmentId: OWNER, cohortId: COHORT };
const classmate = { enrollmentId: 'peer-1', cohortId: COHORT };
const stranger = { enrollmentId: 'other-1', cohortId: 'cohort-b' };
const anonymous = { enrollmentId: null };
const staff = { enrollmentId: 'staff-1', isStaff: true };

/** Every surface, so a rule can never hold on one and leak on another. */
const onEverySurface = (fn: (s: ShowcaseSurface) => void) => SHOWCASE_SURFACES.forEach(fn);

describe('the surface list is real', () => {
  // POSITIVE CONTROL: without this, every `onEverySurface` below could iterate an
  // empty list and pass having checked nothing.
  it('names the ways a showcase can be read', () => {
    expect(SHOWCASE_SURFACES.length).toBeGreaterThanOrEqual(6);
    for (const s of ['media', 'thumbnail', 'transcript', 'search', 'download']) {
      expect(SHOWCASE_SURFACES).toContain(s);
    }
  });
});

describe('private means the owner and staff, on every surface', () => {
  const priv = row({ audience: 'private' });

  it('the owner sees it everywhere', () => {
    onEverySurface((s) => expect({ s, ok: canView(priv, owner, s) }).toEqual({ s, ok: true }));
  });

  it('staff see it everywhere', () => {
    onEverySurface((s) => expect({ s, ok: canView(priv, staff, s) }).toEqual({ s, ok: true }));
  });

  it('a CLASSMATE sees it on no surface at all', () => {
    onEverySurface((s) => expect({ s, ok: canView(priv, classmate, s) }).toEqual({ s, ok: false }));
  });

  it('a stranger sees it on no surface at all', () => {
    onEverySurface((s) => expect({ s, ok: canView(priv, stranger, s) }).toEqual({ s, ok: false }));
  });

  it('an anonymous visitor sees it on no surface at all', () => {
    onEverySurface((s) => expect({ s, ok: canView(priv, anonymous, s) }).toEqual({ s, ok: false }));
  });

  it('is absent from a search result built with the shared filter', () => {
    expect(filterViewable([priv], classmate, 'search')).toEqual([]);
    expect(filterViewable([priv], owner, 'search')).toHaveLength(1);
  });
});

describe('the wider audiences, also on every surface', () => {
  it('cohort reaches the cohort and nobody else', () => {
    const r = row({ audience: 'cohort' });
    onEverySurface((s) => {
      expect({ s, mate: canView(r, classmate, s), out: canView(r, stranger, s) })
        .toEqual({ s, mate: true, out: false });
    });
  });

  it('community reaches any signed-in learner but not an anonymous visitor', () => {
    const r = row({ audience: 'community' });
    onEverySurface((s) => {
      expect({ s, inLearner: canView(r, stranger, s), anon: canView(r, anonymous, s) })
        .toEqual({ s, inLearner: true, anon: false });
    });
  });

  it('public reaches everyone', () => {
    const r = row({ audience: 'public' });
    onEverySurface((s) => expect({ s, ok: canView(r, anonymous, s) }).toEqual({ s, ok: true }));
  });

  // An audience value nobody has thought about must fail closed.
  it('an unrecognised audience is visible to nobody but owner and staff', () => {
    const r = row({ audience: 'everyone_forever' as any });
    onEverySurface((s) => expect({ s, ok: canView(r, classmate, s) }).toEqual({ s, ok: false }));
    expect(canView(r, owner, 'media')).toBe(true);
  });
});

/**
 * THE MOST DANGEROUS THING A PUBLICATION FLOW CAN GET WRONG: a student swaps in a
 * different recording behind an approval somebody gave to something they never watched.
 */
describe('an approval belongs to the content it approved', () => {
  it('is approved while the content is the content that was approved', () => {
    expect(approvalState(row())).toBe('approved');
    expect(isLive(row())).toBe(true);
  });

  it('goes STALE the moment the recording is replaced', () => {
    const swapped = row({ contentHash: 'hash-1', currentContentHash: 'hash-2' });
    expect(approvalState(swapped)).toBe('stale');
    expect(isLive(swapped)).toBe(false);
  });

  it('a stale approval hides it from everyone but owner and staff, on every surface', () => {
    const swapped = row({ audience: 'public', contentHash: 'hash-1', currentContentHash: 'hash-2' });
    onEverySurface((s) => {
      expect({ s, stranger: canView(swapped, stranger, s), owner: canView(swapped, owner, s) })
        .toEqual({ s, stranger: false, owner: true });
    });
  });

  it('refuses to publish on a stale approval, and says why', () => {
    const r = canPublish(row({ contentHash: 'a', currentContentHash: 'b' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/changed after it was approved/i);
  });

  // "You never had approval" and "your approval lapsed" are different facts and the
  // student needs the second one, which tells them what to do.
  it('distinguishes never-approved from lapsed', () => {
    expect(approvalState(row({ authorApprovedAt: null }))).toBe('not_approved');
    expect(approvalState(row({ staffApprovedAt: null }))).toBe('author_only');
  });

  // An unknown hash is not evidence of a swap; refusing on it would block honest work.
  it('does not call it stale when a hash is simply unknown', () => {
    expect(approvalState(row({ currentContentHash: null }))).toBe('approved');
    expect(approvalState(row({ contentHash: null, currentContentHash: 'x' }))).toBe('approved');
  });

  it('will not publish without a hash to tie the approval to', () => {
    const r = canPublish(row({ contentHash: null, currentContentHash: null }));
    expect(r.ok).toBe(false);
  });
});

describe('withdrawal is immediate, on every surface', () => {
  const pulled = row({ audience: 'public', withdrawnAt: new Date() });

  it('disappears for everyone but owner and staff the moment it is withdrawn', () => {
    onEverySurface((s) => {
      expect({ s, out: canView(pulled, stranger, s), owner: canView(pulled, owner, s), staff: canView(pulled, staff, s) })
        .toEqual({ s, out: false, owner: true, staff: true });
    });
  });

  it('a withdrawn showcase cannot be published again without a fresh approval', () => {
    expect(canPublish(pulled).ok).toBe(false);
  });
});

describe('unpublished work is not visible just because it is approved', () => {
  it('an approved but unpublished showcase is still owner-and-staff only', () => {
    const draft = row({ audience: 'public', publishedAt: null });
    expect(isLive(draft)).toBe(false);
    onEverySurface((s) => expect({ s, ok: canView(draft, stranger, s) }).toEqual({ s, ok: false }));
  });

  it('publishing without staff approval is refused', () => {
    expect(canPublish(row({ staffApprovedAt: null })).ok).toBe(false);
  });

  it('publishing without the author\'s own approval is refused', () => {
    expect(canPublish(row({ authorApprovedAt: null })).ok).toBe(false);
  });
});
