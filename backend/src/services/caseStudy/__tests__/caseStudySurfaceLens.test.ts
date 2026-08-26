import {
  CASE_STUDY_SURFACE_PROFILES, getCaseStudySurfaceProfile,
} from '../caseStudySurfaceProfiles';
import { surfaceView } from '../caseStudySurfaceView';
import {
  UNRESTRICTED_PREVIEW_SURFACE, isRestrictedSurfacePreview, surfaceLabEnabledFor,
} from '../caseStudySurfaceLabAccess';
import { CASE_STUDY_SURFACE_KEYS } from '../../../types/caseStudy';
import type { CaseStudySectionKey, CaseStudySurfaceKey } from '../../../types/caseStudy';

/**
 * The four lenses, the attribution floor, and who may look at either.
 *
 * WHAT THIS SUITE IS FOR. Before 2026-08-26 `sectionOrder` and `hiddenSections`
 * were a mechanism that had never been given two different values: all four
 * profiles shared one constant, so a four-lens preview would have rendered four
 * identical pages and proved nothing at all. The assertions below are written so
 * that a regression to that state fails loudly rather than passing quietly —
 * "they differ" is asserted pairwise, not by counting.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT. Not the exact contents of any one order.
 * Pinning ten keys in sequence would turn every future editorial judgement into
 * a test edit, and the judgement is the product owner's, not this suite's. What
 * is pinned is the set of PROPERTIES that make an order safe: it is a
 * permutation of the same ten keys, it leads with `hero`, it closes with `cta`,
 * and it cannot suppress attribution.
 */

const ORDERS = CASE_STUDY_SURFACE_KEYS.map((key) => ({
  key, order: getCaseStudySurfaceProfile(key).sectionOrder,
}));

describe('the four lenses are genuinely different', () => {
  it('gives no two surfaces the same section order', () => {
    // Pairwise, not "the set of distinct orders has size 4" — a Set of joined
    // strings would also pass if three of them were identical and one differed,
    // depending on how the size were compared. This says the thing directly.
    for (let i = 0; i < ORDERS.length; i += 1) {
      for (let j = i + 1; j < ORDERS.length; j += 1) {
        expect(ORDERS[i].order.join('>')).not.toBe(ORDERS[j].order.join('>'));
      }
    }
  });

  it('leaves the Enterprise order exactly as it shipped', () => {
    // Enterprise is the only publishable surface, so its order is what the
    // public page renders TODAY. It is pinned here precisely because the other
    // three are not: this is the change that would be a production change.
    expect(getCaseStudySurfaceProfile('enterprise').sectionOrder).toEqual([
      'hero', 'situation', 'build', 'architecture', 'measurement',
      'roadmap', 'contributors', 'artifacts', 'repositories', 'cta',
    ]);
  });

  it('makes every order a permutation of the same ten bands — a lens reorders, it does not drop', () => {
    const canonical = [...getCaseStudySurfaceProfile('enterprise').sectionOrder].sort();
    ORDERS.forEach(({ key, order }) => {
      expect([...order].sort()).toEqual(canonical);
      expect(new Set(order).size).toBe(order.length); // no key twice
      expect(order[0]).toBe('hero');
      expect(order[order.length - 1]).toBe('cta');
      expect(key).toBeTruthy();
    });
  });

  it('leads each lens with the band its reader arrived for', () => {
    // The one substantive claim about content: the band immediately after the
    // hero is the answer to that audience's question. Everything downstream of
    // the lens model rests on this being deliberate rather than incidental.
    const second = (key: CaseStudySurfaceKey): CaseStudySectionKey =>
      getCaseStudySurfaceProfile(key).sectionOrder[1];
    expect(second('enterprise')).toBe('situation');
    expect(second('training')).toBe('situation');
    expect(second('ai-flotation')).toBe('architecture');
    expect(second('refactored')).toBe('build');
    // Training's distinguishing move is contributors ahead of the build, which
    // is what makes it a learner's page rather than a buyer's.
    const training = getCaseStudySurfaceProfile('training').sectionOrder;
    expect(training.indexOf('contributors')).toBeLessThan(training.indexOf('build'));
    // AI Flotation's is the source link near the top rather than at the bottom.
    const flotation = getCaseStudySurfaceProfile('ai-flotation').sectionOrder;
    expect(flotation.indexOf('repositories')).toBeLessThan(flotation.indexOf('situation'));
  });
});

describe('the attribution floor', () => {
  it('puts contributors, repositories and the CTA on every surface floor', () => {
    CASE_STUDY_SURFACE_KEYS.forEach((key) => {
      expect([...getCaseStudySurfaceProfile(key).requiredSections].sort())
        .toEqual(['contributors', 'cta', 'repositories']);
    });
  });

  it('is identical on all four surfaces — a floor a surface sets for itself is not a floor', () => {
    const floors = CASE_STUDY_SURFACE_KEYS.map(
      (key) => [...getCaseStudySurfaceProfile(key).requiredSections].sort().join(','),
    );
    expect(new Set(floors).size).toBe(1);
  });

  it('is never contradicted by a profile hiding one of its own required bands', () => {
    // Today every profile hides nothing, so this is a guard against a future
    // edit rather than a description of now. `visibleSections` on the client
    // enforces the floor even if this ever goes red — belt and braces, because
    // the two live in different codebases.
    CASE_STUDY_SURFACE_KEYS.forEach((key) => {
      const profile = getCaseStudySurfaceProfile(key);
      const floor = new Set<CaseStudySectionKey>(profile.requiredSections);
      expect(profile.hiddenSections.filter((k) => floor.has(k))).toEqual([]);
    });
  });
});

describe('surfaceView — what reaches the client', () => {
  it('carries the order and the floor, so a client can compose a lens', () => {
    const view = surfaceView(CASE_STUDY_SURFACE_PROFILES.training);
    expect(view.key).toBe('training');
    expect(view.sectionOrder).toEqual(CASE_STUDY_SURFACE_PROFILES.training.sectionOrder);
    expect(view.requiredSections).toEqual(CASE_STUDY_SURFACE_PROFILES.training.requiredSections);
  });

  it('still withholds publishable and defaultFilters', () => {
    // `publishable` is a WRITE-side flag. On a read response a client would be
    // tempted to treat it as a read gate, which it is not — the read gate is
    // publication status. Keeping it off the wire keeps that confusion
    // unavailable.
    const view = surfaceView(CASE_STUDY_SURFACE_PROFILES.enterprise) as Record<string, unknown>;
    expect(view.publishable).toBeUndefined();
    expect(view.defaultFilters).toBeUndefined();
  });
});

describe('surface lab authorization — the predicate, not the plumbing', () => {
  it('restricts every surface except enterprise, and lets an absent key through', () => {
    expect(UNRESTRICTED_PREVIEW_SURFACE).toBe('enterprise');
    expect(isRestrictedSurfacePreview(undefined)).toBe(false);
    expect(isRestrictedSurfacePreview(null)).toBe(false);
    expect(isRestrictedSurfacePreview('')).toBe(false);
    expect(isRestrictedSurfacePreview('enterprise')).toBe(false);
    expect(isRestrictedSurfacePreview('training')).toBe(true);
    expect(isRestrictedSurfacePreview('ai-flotation')).toBe(true);
    expect(isRestrictedSurfacePreview('refactored')).toBe(true);
  });

  it('treats a non-string surfaceKey as restricted — a repeated query param fails CLOSED', () => {
    // `?surfaceKey=training&surfaceKey=enterprise` arrives as an array. Reading
    // the wrong element of it is how a gate gets walked past, so anything that
    // is not a plain string is refused and left to the route's Zod parse to
    // reject with a 400.
    expect(isRestrictedSurfacePreview(['training', 'enterprise'])).toBe(true);
    expect(isRestrictedSurfacePreview({ toString: () => 'enterprise' })).toBe(true);
  });

  it('defaults CLOSED on every unset, blank or unrecognised setting', () => {
    ['off', '', '   ', undefined, null].forEach((setting) => {
      expect(surfaceLabEnabledFor('admin-1', setting)).toBe(false);
    });
  });

  it('opens for "all", and for an id that is on the list', () => {
    expect(surfaceLabEnabledFor('admin-1', 'all')).toBe(true);
    expect(surfaceLabEnabledFor('admin-1', 'admin-1')).toBe(true);
    expect(surfaceLabEnabledFor('admin-2', ' admin-1 , admin-2 ')).toBe(true);
    expect(surfaceLabEnabledFor('admin-9', 'admin-1,admin-2')).toBe(false);
  });

  it('refuses a caller with no id even when a list is configured', () => {
    // A list names accounts. "No account" is not on any list, and treating an
    // absent id as a wildcard is the shape of an authorization bypass.
    expect(surfaceLabEnabledFor(undefined, 'admin-1')).toBe(false);
    expect(surfaceLabEnabledFor(null, 'admin-1')).toBe(false);
    expect(surfaceLabEnabledFor('', 'admin-1')).toBe(false);
  });

  it('does not treat an empty list entry as a match for an empty id', () => {
    expect(surfaceLabEnabledFor('', 'admin-1,,admin-2')).toBe(false);
  });
});
