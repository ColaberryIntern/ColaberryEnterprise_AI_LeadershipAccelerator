import {
  briefIsUsable,
  draftWarnings,
  pageActions,
  publicUrl,
  slugProblem,
  statusLabel,
  suggestSlug,
} from '../landingPageState';
import type { LandingPage } from '../../../../services/landingPageApi';

function page(over: Partial<LandingPage> = {}): LandingPage {
  return {
    id: 'lp-1', name: 'Six-week build', kind: 'hosted', status: 'draft',
    slug: 'six-week-build', path: '/lp/colaberry-training/six-week-build',
    brand_id: 'b-1', site_slug: 'training', published_at: null,
    repo_path: null, repo_commit: null, updated_at: '2026-10-02T12:00:00.000Z',
    ...over,
  };
}

describe('the slug, which ends up in a public URL', () => {
  it.each(['six-week-build', 'cohort11', 'a'])('accepts %s', (slug) => {
    expect(slugProblem(slug)).toBeNull();
  });

  it('refuses an empty slug and says why', () => {
    expect(slugProblem('   ')).toMatch(/cannot be built without one/);
  });

  it.each([
    ['Six Week Build', 'spaces'],
    ['Six-Week-Build', 'capitals'],
    ['-leading', 'a leading dash'],
    ['under_score', 'underscores'],
    ['slash/es', 'slashes'],
  ])('refuses %s (%s)', (slug) => {
    expect(slugProblem(slug)).toMatch(/Lower-case letters, numbers and dashes only/);
  });
});

describe('suggesting a slug from the name', () => {
  it('lower-cases and dashes the words', () => {
    expect(suggestSlug('Six Week AI Build')).toBe('six-week-ai-build');
  });

  it('drops punctuation rather than encoding it', () => {
    expect(suggestSlug('Cohort #11: Apply now!')).toBe('cohort-11-apply-now');
  });

  it('never produces a leading or trailing dash', () => {
    expect(suggestSlug('  --Hello--  ')).toBe('hello');
  });

  it('produces something the validator accepts, for any ordinary name', () => {
    // The suggestion must not hand the operator a slug the server will refuse.
    for (const name of ['November Cohort', 'AI & Data', 'Free class (Thursday)', '2026 Kickoff']) {
      expect(slugProblem(suggestSlug(name))).toBeNull();
    }
  });

  it('returns empty for a name with nothing usable, instead of a bare dash', () => {
    expect(suggestSlug('!!!')).toBe('');
  });
});

describe('what may be done to a page', () => {
  it('a draft with a valid slug can be published', () => {
    const a = pageActions(page(), '');
    expect(a.canPublish).toBe(true);
    expect(a.publishBlocker).toBeNull();
    expect(a.canUnpublish).toBe(false);
  });

  it('a draft with no slug anywhere cannot be published, and says why', () => {
    const a = pageActions(page({ slug: null }), '');
    expect(a.canPublish).toBe(false);
    expect(a.publishBlocker).toMatch(/cannot be built without one/);
  });

  it('a slug typed in the form is used over the stored one', () => {
    expect(pageActions(page({ slug: null }), 'november-cohort').canPublish).toBe(true);
    expect(pageActions(page(), 'Not A Slug').canPublish).toBe(false);
  });

  it('a published page offers unpublish, not publish', () => {
    const a = pageActions(page({ status: 'published' }), '');
    expect(a.canPublish).toBe(false);
    expect(a.canUnpublish).toBe(true);
    expect(a.canRevise).toBe(true);
  });

  it('a legacy external path offers nothing, and explains itself', () => {
    const a = pageActions(page({ kind: 'external_path' }), '');
    expect(a).toEqual({
      canPublish: false, canUnpublish: false, canRevise: false,
      publishBlocker: 'This is an external path, not a page built here. It cannot be edited or published.',
    });
  });

  it('nothing selected offers nothing, and does not invent a blocker', () => {
    expect(pageActions(null, '')).toEqual({
      canPublish: false, canUnpublish: false, canRevise: false, publishBlocker: null,
    });
  });
});

describe('the row badge', () => {
  it.each([
    [page({ status: 'published' }), 'Live'],
    [page({ status: 'draft' }), 'Draft'],
    [page({ status: 'archived' }), 'Archived'],
    [page({ kind: 'external_path' }), 'External path'],
  ])('reads %#: %s', (p, text) => {
    expect(statusLabel(p as LandingPage).text).toBe(text);
  });

  it('calls a published page Live, not Published - that is what it means to the reader', () => {
    expect(statusLabel(page({ status: 'published' })).tone).toBe('success');
  });
});

describe('the public URL', () => {
  it('is shown only for a page that is actually live', () => {
    expect(publicUrl(page({ status: 'published' }))).toBe('/lp/colaberry-training/six-week-build');
  });

  it('is withheld for a draft, which has no working URL', () => {
    expect(publicUrl(page({ status: 'draft' }))).toBeNull();
  });

  it('is withheld for an external path', () => {
    expect(publicUrl(page({ kind: 'external_path', status: 'published' }))).toBeNull();
  });

  it('is withheld when the row has no path at all', () => {
    expect(publicUrl(page({ status: 'published', path: null }))).toBeNull();
  });
});

describe('what to say about a generated draft', () => {
  it('says nothing when there is nothing to say', () => {
    expect(draftWarnings({ placeholders: [], unverifiedClaims: [] })).toEqual([]);
    expect(draftWarnings(null)).toEqual([]);
  });

  it('treats a hole and an unsupported claim as DIFFERENT problems', () => {
    // Collapsing them into one count would hide which kind you have, and they need different
    // actions: fill the hole, check or delete the claim.
    const w = draftWarnings({ placeholders: ['[price]'], unverifiedClaims: ['figure 92%'] });
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/Fill these in before publishing: \[price\]/);
    expect(w[1]).toMatch(/does not support these, so check or remove them: figure 92%/);
  });

  it('a dropped section is the LOUDEST problem, and comes first', () => {
    // A hole to fill and a claim to check are both about content that is there. A dropped section
    // means part of the brief is missing from the page entirely.
    const w = draftWarnings({
      placeholders: ['[price]'], unverifiedClaims: ['figure 92%'],
      droppedSections: ['stats (section 2): Required'],
    });
    expect(w).toHaveLength(3);
    expect(w[0]).toMatch(/could not be turned into a section and was left out: stats \(section 2\): Required/);
    expect(w[0]).toMatch(/Re-run with a clearer brief, or add those parts by hand/);
  });

  it('says nothing about dropped sections on the normal path', () => {
    expect(draftWarnings({ placeholders: [], unverifiedClaims: [], droppedSections: [] })).toEqual([]);
  });

  it('lists every placeholder rather than counting them', () => {
    const w = draftWarnings({ placeholders: ['[price]', '[start date]'], unverifiedClaims: [] });
    expect(w[0]).toContain('[price], [start date]');
  });
});

describe('the brief', () => {
  it('matches the server\'s own minimum, so the UI refuses before the request does', () => {
    expect(briefIsUsable('make me a page')).toBe(false);
    expect(briefIsUsable('x'.repeat(40))).toBe(true);
  });

  it('does not count surrounding whitespace as content', () => {
    expect(briefIsUsable(`   ${'x'.repeat(39)}   `)).toBe(false);
  });
});
