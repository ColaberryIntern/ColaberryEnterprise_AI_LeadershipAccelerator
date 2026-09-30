import {
  LIVE_SURFACE_KEY, SURFACE_LENS_TABS, bandSummary, canonicalFacts, draftState,
  lensComposition, publicationState,
} from '../caseStudySurfaceLabModel';
import {
  REQUIRED_SECTIONS, SURFACE_ORDERS, detailFixture, previewFixture, projectionFixture,
  surfaceViewFixture,
} from '../__fixtures__/caseStudyAdminFixtures';
import { visibleSections } from '../../publicV2/storyDetailV2Model';
import type { CaseStudySurfaceKey } from '../../../services/caseStudyAdminTypes';
import type { CaseStudySectionKey } from '../../../services/caseStudyPublicTypes';

/**
 * The four-lens surface lab, as rules rather than as rendering.
 *
 * THE CLAIM UNDER TEST is not "there is a tab strip". It is:
 *
 *   1. four lenses produce genuinely different section composition;
 *   2. the canonical facts do NOT move when the lens does;
 *   3. a lens cannot hide a band on the attribution floor;
 *   4. nothing here reports a draft change count, because no such number
 *      honestly exists.
 *
 * (2) is the exit criterion for this whole checkpoint, and it is an assertion
 * rather than a screenshot on purpose: four pages can look different and still
 * be telling four different stories about the same record, which is the failure
 * this system exists to prevent.
 */

const KEYS: readonly CaseStudySurfaceKey[] = ['enterprise', 'training', 'ai-flotation', 'refactored'];

describe('the four lenses produce genuinely different composition', () => {
  it('gives no two lenses the same band order for the same record', () => {
    const projection = projectionFixture();
    const orders = KEYS.map(
      (key) => lensComposition(projection, surfaceViewFixture(key))
        .bands.map((b) => b.key).join('>'),
    );
    for (let i = 0; i < orders.length; i += 1) {
      for (let j = i + 1; j < orders.length; j += 1) {
        expect(orders[i]).not.toBe(orders[j]);
      }
    }
  });

  it('renders the SAME SET of bands on all four — a lens reorders, it does not drop', () => {
    const projection = projectionFixture();
    const sets = KEYS.map(
      (key) => [...lensComposition(projection, surfaceViewFixture(key)).bands.map((b) => b.key)]
        .sort().join(','),
    );
    expect(new Set(sets).size).toBe(1);
  });

  it('leads each lens with the band its reader arrived for', () => {
    const projection = projectionFixture();
    const secondBand = (key: CaseStudySurfaceKey): CaseStudySectionKey =>
      lensComposition(projection, surfaceViewFixture(key)).bands[1].key;
    expect(secondBand('ai-flotation')).toBe('architecture');
    expect(secondBand('refactored')).toBe('build');

    const training = lensComposition(projection, surfaceViewFixture('training'))
      .bands.map((b) => b.key);
    expect(training.indexOf('contributors')).toBeLessThan(training.indexOf('build'));
  });

  it('pairs every tab with the reader question that justifies its order', () => {
    expect(SURFACE_LENS_TABS.map((t) => t.key)).toEqual(KEYS);
    SURFACE_LENS_TABS.forEach((tab) => {
      expect(tab.readerQuestion.length).toBeGreaterThan(20);
      expect(tab.readerQuestion.endsWith('?')).toBe(true);
    });
    expect(LIVE_SURFACE_KEY).toBe('enterprise');
  });
});

describe('the canonical facts do not move when the lens does', () => {
  it('reports byte-identical canonical facts on all four lenses', () => {
    // THE EXIT CRITERION. These five come from the snapshot, which does not know
    // which surface it is being read for. If a lens ever changes one of them, it
    // has reached past framing and into fact, and the lens model is void.
    const rendered = KEYS.map((key) => JSON.stringify(canonicalFacts(projectionFixture({ surfaceKey: key }))));
    expect(new Set(rendered).size).toBe(1);
  });

  it('names who built it, and does so from the record rather than the surface', () => {
    const facts = canonicalFacts(projectionFixture({ surfaceKey: 'ai-flotation' }));
    const builtBy = facts.find((f) => f.term === 'Built by');
    // Previewed under the AI Flotation lens, the record still says Colaberry.
    expect(builtBy?.value).toBe('Colaberry team');
  });

  it('omits an absent fact rather than printing a placeholder for it', () => {
    const facts = canonicalFacts(projectionFixture({ organizationLabel: null }));
    expect(facts.some((f) => f.term === 'Organization')).toBe(false);
    expect(JSON.stringify(facts)).not.toContain('Undisclosed');
  });

  it('reports nothing at all when there is no projection', () => {
    expect(canonicalFacts(null)).toEqual([]);
  });
});

describe('the attribution floor cannot be hidden by a lens', () => {
  const HOSTILE = surfaceViewFixture('ai-flotation', {
    // A profile that tries to do exactly the thing SURFACE_LENS_MODEL §3.3 names
    // as the failure: an architecture-led page under a delivery masthead with
    // "who built it" and "where the source is" suppressed.
    hiddenSections: ['contributors', 'repositories', 'cta', 'measurement'],
  });

  it('renders the floor bands anyway', () => {
    const shown = visibleSections(projectionFixture(), HOSTILE);
    REQUIRED_SECTIONS.forEach((key) => expect(shown).toContain(key));
  });

  it('still honours a hidden band that is NOT on the floor', () => {
    // Non-vacuity: if the floor logic simply ignored `hiddenSections` entirely,
    // every assertion above would pass and the field would be dead.
    const shown = visibleSections(projectionFixture(), HOSTILE);
    expect(shown).not.toContain('measurement');
  });

  it('reports the override to the operator rather than silently absorbing it', () => {
    const composition = lensComposition(projectionFixture(), HOSTILE);
    expect([...composition.floorOverrides].sort()).toEqual(['contributors', 'cta', 'repositories']);
  });

  it('marks the floor bands as required in the rendered composition', () => {
    const composition = lensComposition(projectionFixture(), surfaceViewFixture('training'));
    const required = composition.bands.filter((b) => b.required).map((b) => b.key).sort();
    expect(required).toEqual(['contributors', 'cta', 'repositories']);
  });

  it('does NOT force a floor band onto a record that has nothing to say', () => {
    // The floor constrains the LENS, never the DATA. A record with no
    // contributors and no repositories stays quiet, and a lab that manufactured
    // an empty "Who built it" heading would be inventing a band.
    const silent = projectionFixture({
      contributors: [], anonymousContributorCount: 0,
      repositories: [], privateRepositoryCount: 0,
    });
    const shown = visibleSections(silent, surfaceViewFixture('training'));
    expect(shown).not.toContain('contributors');
    expect(shown).not.toContain('repositories');
    // ...and the lab says WHY it is absent, so "the lens hid it" and "the record
    // is silent" are not the same sentence on screen.
    const composition = lensComposition(silent, surfaceViewFixture('training'));
    expect(composition.unsupported).toContain('contributors');
    expect(composition.unsupported).toContain('repositories');
  });

  it('treats a surface with no requiredSections at all as an empty floor', () => {
    // A response from a server that predates the field must not crash the page.
    const legacy = surfaceViewFixture('training', { hiddenSections: ['contributors'] });
    const stripped = { ...legacy } as Record<string, unknown>;
    delete stripped.requiredSections;
    const shown = visibleSections(
      projectionFixture(), stripped as unknown as typeof legacy,
    );
    expect(shown).not.toContain('contributors');
  });
});

describe('draft state is a state, never a count', () => {
  it('says the draft is ahead without claiming how far', () => {
    const detail = detailFixture();
    const state = draftState(detail, 'enterprise');
    expect(state.kind).toBe('draft-ahead');
    // No digit may appear except a version number, and no word may imply a
    // field-level diff. Snapshots are content-hashed wholes; nothing in this
    // system can count changed fields, so nothing here may print a count.
    expect(state.label).not.toMatch(/\d+\s+(change|changes|field|fields|edit|edits|diff)/i);
    expect(state.label).toContain('draft is ahead');
  });

  it('says live matches draft when the published snapshot IS the latest', () => {
    const detail = detailFixture();
    const pinned = detailFixture({
      publications: [{
        ...detail.publications[0],
        publishedSnapshotId: detail.latestSnapshot!.id,
      }],
    });
    expect(draftState(pinned, 'enterprise').kind).toBe('live-matches-draft');
  });

  it('says not published for a surface with no publication row', () => {
    expect(draftState(detailFixture(), 'training').kind).toBe('not-published');
  });

  it('says there is nothing to publish when no snapshot exists', () => {
    expect(draftState(detailFixture({ latestSnapshot: null }), 'enterprise').kind)
      .toBe('no-snapshot');
    expect(draftState(null, 'enterprise').kind).toBe('no-snapshot');
  });
});

describe('publication state reports the real gate, unsoftened', () => {
  it('separates "not published" from "the gate would refuse"', () => {
    // A surface can be either without being the other, and collapsing them is
    // how an operator concludes a refusal is just a missing click.
    const state = publicationState(detailFixture(), previewFixture(), 'training');
    expect(state.live).toBe(false);
    expect(state.gateAllows).toBe(false);
    expect(state.gateLabel).toBe('gate: would refuse');
    expect(state.blockerCodes).toContain('metric_pending');
  });

  it('reports the live surface as live', () => {
    const state = publicationState(detailFixture(), previewFixture(), 'enterprise');
    expect(state.live).toBe(true);
  });

  it('does not pretend a gate verdict exists before a preview has run', () => {
    const state = publicationState(detailFixture(), null, 'enterprise');
    expect(state.gateLabel).toBe('gate: not evaluated yet');
    expect(state.gateAllows).toBe(false);
  });
});

describe('band summaries state facts and characterise nothing', () => {
  it('reports counts read straight off the projection', () => {
    const projection = projectionFixture();
    expect(bandSummary(projection, 'build')).toContain('1');
    expect(bandSummary(projection, 'contributors')).toContain('1 named');
    expect(bandSummary(projection, 'repositories')).toContain('1 withheld');
  });

  it('says nothing at all when there is no projection', () => {
    expect(bandSummary(null, 'build')).toBe('');
  });
});

describe('the fixture orders are not accidentally identical', () => {
  it('keeps the four mirrored orders distinct', () => {
    // Guard on the fixture itself. Every assertion in this file about lenses
    // differing would pass vacuously if this table collapsed to one order.
    const joined = Object.values(SURFACE_ORDERS).map((o) => o.join('>'));
    expect(new Set(joined).size).toBe(4);
  });
});
