/**
 * The access rule for /u/:slug, tested on its own.
 *
 * `publicViewDecision` is pure, so it is tested without a database, a request, or a
 * clock. The exhaustive matrix below is the point: every combination of status and
 * visibility has a stated answer, so nobody has to reason about which combination is
 * "obviously" fine.
 */
import { publicViewDecision } from '../careerPortfolioPageService';

const STATUSES = ['draft', 'published'] as const;
const VISIBILITIES = ['private', 'unlisted', 'public'] as const;

describe('publicViewDecision', () => {
  it('is invisible when there is no page at all', () => {
    expect(publicViewDecision(null)).toEqual({ viewable: false, indexable: false });
  });

  it.each([
    // status,      visibility,  viewable, indexable
    ['draft', 'private', false, false],
    ['draft', 'unlisted', false, false],
    ['draft', 'public', false, false],
    ['published', 'private', false, false],
    ['published', 'unlisted', true, false],
    ['published', 'public', true, true],
  ])('%s + %s -> viewable=%s indexable=%s', (status, visibility, viewable, indexable) => {
    expect(publicViewDecision({ status, visibility } as any))
      .toEqual({ viewable, indexable });
  });

  it('covers the whole matrix, so a new combination cannot be added untested', () => {
    const combos = STATUSES.flatMap((s) => VISIBILITIES.map((v) => `${s}+${v}`));
    expect(combos).toHaveLength(6);
  });

  it('never lets an UNAPPROVED page be seen, whatever the learner sets', () => {
    // The learner controls visibility; they must not be able to self-publish with it.
    for (const visibility of VISIBILITIES) {
      expect(publicViewDecision({ status: 'draft', visibility } as any).viewable).toBe(false);
    }
  });

  it('only ever allows indexing on an explicit public opt-in', () => {
    const indexable = STATUSES.flatMap((status) =>
      VISIBILITIES.map((visibility) => ({
        status, visibility, ...publicViewDecision({ status, visibility } as any),
      })),
    ).filter((r) => r.indexable);
    expect(indexable).toEqual([
      { status: 'published', visibility: 'public', viewable: true, indexable: true },
    ]);
  });

  it('treats an unrecognised status or visibility as invisible, not as permission', () => {
    // A value added next year, a typo, or a hand-edited row must fail closed.
    const junk: any[] = [
      { status: 'published', visibility: 'PUBLIC' },   // wrong case
      { status: 'published', visibility: 'everyone' }, // invented
      { status: 'published', visibility: '' },
      { status: 'published', visibility: null },
      { status: 'live', visibility: 'public' },        // invented status
      { status: null, visibility: 'public' },
      { status: 'Published', visibility: 'public' },   // wrong case
    ];
    for (const page of junk) {
      expect(publicViewDecision(page)).toEqual({ viewable: false, indexable: false });
    }
  });

  it('revoking visibility takes a live page down immediately', () => {
    const live = { status: 'published', visibility: 'public' } as any;
    expect(publicViewDecision(live).viewable).toBe(true);
    expect(publicViewDecision({ ...live, visibility: 'private' }).viewable).toBe(false);
  });
});
