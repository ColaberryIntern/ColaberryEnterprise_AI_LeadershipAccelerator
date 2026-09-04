/**
 * The type→objective mapping, and the restraint it is built on.
 *
 * A wrong mapping does not fail loudly — it reads as progress, and every
 * student who completed that card type gets credited with evidence they did
 * not produce. So the tests here are as much about what the map REFUSES to
 * claim as about what it claims.
 */
import {
  TYPE_CERTIFICATION_MAP,
  UNMAPPABLE_AT_TYPE_LEVEL,
  PORTFOLIO_ELIGIBLE_ADDITIONS,
  mappedObjectiveIds,
} from '../typeCertificationMap';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../ccarFoundations';
import { CCAR_F_MATCH_RULES } from '../../../services/certPrep/certEvidenceService';

const objectivesInBlueprint = new Set(
  CCAR_FOUNDATIONS_BLUEPRINT.domains.flatMap((d) => d.objectives.map((o) => o.objective_id)),
);

describe('the mapping is valid against the published blueprint', () => {
  it('names only objectives that exist', () => {
    const unknown = mappedObjectiveIds().filter((o) => !objectivesInBlueprint.has(o));
    expect(unknown).toEqual([]);
  });

  it('gives every mapping a rationale a reviewer can disagree with', () => {
    const thin = TYPE_CERTIFICATION_MAP
      .filter((m) => (m.rationale ?? '').trim().length < 40)
      .map((m) => m.type_slug);
    expect(thin).toEqual([]);
  });

  it('maps no type twice', () => {
    const slugs = TYPE_CERTIFICATION_MAP.map((m) => m.type_slug);
    expect(slugs.length).toBe(new Set(slugs).size);
  });

  it('claims at least one objective per mapped type', () => {
    const empty = TYPE_CERTIFICATION_MAP.filter((m) => m.objective_ids.length === 0).map((m) => m.type_slug);
    expect(empty).toEqual([]);
  });
});

describe('the restraint', () => {
  it('a type is never both mapped and declared unmappable', () => {
    const mapped = new Set(TYPE_CERTIFICATION_MAP.map((m) => m.type_slug));
    const both = UNMAPPABLE_AT_TYPE_LEVEL.filter((u) => mapped.has(u.type_slug)).map((u) => u.type_slug);
    expect(both).toEqual([]);
  });

  it('every unmappable type says WHY, so the gap is a decision rather than an omission', () => {
    const silent = UNMAPPABLE_AT_TYPE_LEVEL
      .filter((u) => (u.reason ?? '').trim().length < 30)
      .map((u) => u.type_slug);
    expect(silent).toEqual([]);
  });

  it('does NOT map the generic build types — their objective belongs to the week, not the kind', () => {
    // implementation_task and project_task are real evidence producers, and
    // what they evidence is whatever that week asked for. Mapping them at type
    // level would credit every student identically whatever they built.
    const mapped = new Set(TYPE_CERTIFICATION_MAP.map((m) => m.type_slug));
    expect(mapped.has('implementation_task')).toBe(false);
    expect(mapped.has('project_task')).toBe(false);
    expect(mapped.has('artifact_submission')).toBe(false);
  });

  it('maps only types that are active in production', () => {
    // github_sync was mapped in the first draft and does not exist in prod --
    // the type was removed when syncing became a background process. The seeder
    // validates this too and refuses the whole run; this catches it earlier.
    const mapped = new Set(TYPE_CERTIFICATION_MAP.map((m) => m.type_slug));
    expect(mapped.has('github_sync')).toBe(false);
    expect(PORTFOLIO_ELIGIBLE_ADDITIONS.some((p) => p.type_slug === 'github_sync')).toBe(false);
  });

  it('does NOT map the sitting type — a sitting measures knowledge, it is not build evidence', () => {
    // Readiness already counts sittings on the knowledge side. Mapping them
    // here would count the same work twice, on both halves of the blend.
    const mapped = new Set(TYPE_CERTIFICATION_MAP.map((m) => m.type_slug));
    expect(mapped.has('certification_exercise')).toBe(false);
  });

  it('stays small — a map that claims most types has stopped discriminating', () => {
    expect(TYPE_CERTIFICATION_MAP.length).toBeLessThanOrEqual(10);
  });
});

describe('the two grains overlap, and that is safe — but only deliberately', () => {
  /**
   * Overlap between the type grain and the evidence-signal grain cannot inflate
   * readiness: `computeReadiness` counts DISTINCT objectives (verifiedObjectives
   * is a Set keyed `domain:objective`), so two sources evidencing one objective
   * count once. Checked in certReadinessService before this list was written —
   * the first version of this test asserted the overlap was exactly ['D3.6'],
   * guessed rather than derived, and failed on the real answer. D3.6 then left
   * the list for a different reason: github_sync is not an active type in
   * production, so the mapping that claimed it was removed.
   *
   * What the list guards is that every overlap is one somebody chose. A NEW
   * overlap fails this test and has to be acknowledged here, which is the point.
   */
  const ACKNOWLEDGED_OVERLAP = ['D4.1', 'D4.2', 'D4.3'];

  it('overlaps only where both grains describe the same competence', () => {
    const signalObjectives = new Set(CCAR_F_MATCH_RULES.flatMap((r) => r.objective_ids));
    const overlap = mappedObjectiveIds().filter((o) => signalObjectives.has(o));
    expect(overlap).toEqual(ACKNOWLEDGED_OVERLAP);
  });

  it('every acknowledged overlap is an objective both grains actually claim', () => {
    const signalObjectives = new Set(CCAR_F_MATCH_RULES.flatMap((r) => r.objective_ids));
    const typeObjectives = new Set(mappedObjectiveIds());
    for (const o of ACKNOWLEDGED_OVERLAP) {
      expect(signalObjectives.has(o)).toBe(true);
      expect(typeObjectives.has(o)).toBe(true);
    }
  });
});

describe('portfolio eligibility additions', () => {
  it('every addition explains what artifact it leaves behind', () => {
    const thin = PORTFOLIO_ELIGIBLE_ADDITIONS
      .filter((p) => (p.rationale ?? '').trim().length < 30)
      .map((p) => p.type_slug);
    expect(thin).toEqual([]);
  });

  it('stays a widening rather than a sweep', () => {
    // A portfolio assembled from everything is not a portfolio.
    expect(PORTFOLIO_ELIGIBLE_ADDITIONS.length).toBeLessThanOrEqual(5);
  });
});
