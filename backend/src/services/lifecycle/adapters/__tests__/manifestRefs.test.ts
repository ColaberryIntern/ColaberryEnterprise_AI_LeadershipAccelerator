/**
 * The ref vocabulary's two unasserted promises.
 *
 * `manifestRefs.ts` is consumed in production by `factoryAdapter`, `sbpAdapter`, `agentScoping`
 * and `blueprintGeneration`, and it carried two claims that nothing checked:
 *
 *   1. `emptyRefs`'s doc comment: "Every array present, so shape is stable." The point of that
 *      promise is that a reader can tell "no mappings" from "this origin has no concept of
 *      mappings" — so a missing or undefined collection is not a cosmetic defect, it is the
 *      distinction the shape exists to make.
 *   2. `checkRefIntegrity` walked a HAND-WRITTEN list of collections, held to `ManifestRefs` by
 *      nothing. Add a collection to the interface and the check silently skipped it, passing
 *      while its coverage shrank. That is the producer-with-no-consumer failure mode this repo
 *      names, one level down: not a function nobody calls, but a check that quietly stops
 *      covering what it claims to.
 *
 * The positive control here is PER LIST, not aggregate. An "integrity catches a malformed ref"
 * test that injects into one collection and passes would prove only that one collection is
 * walked, and the whole defect is that a collection can fall out of the walk unnoticed.
 */
import {
  emptyRefs,
  checkRefIntegrity,
  INTEGRITY_CHECKED_LISTS,
  type ManifestRefs,
  type RefOrigin,
} from '../manifestRefs';

const ORIGINS: RefOrigin[] = ['factory', 'sbp'];

/** The top-level keys of a fresh snapshot whose value is an array, derived at runtime. */
function arrayValuedKeys(refs: ManifestRefs): string[] {
  return Object.entries(refs)
    .filter(([, v]) => Array.isArray(v))
    .map(([k]) => k)
    .sort();
}

describe('emptyRefs keeps the promise its doc comment makes', () => {
  it.each(ORIGINS)('every declared collection is present and an array for origin %s', (origin) => {
    const refs = emptyRefs(origin, 'project-1');

    // Derived from the object under test, not a hand-listed set of names.
    for (const key of INTEGRITY_CHECKED_LISTS) {
      expect(refs[key]).toBeDefined();
      expect(Array.isArray(refs[key])).toBe(true);
    }
  });

  it.each(ORIGINS)('the NESTED arrays are present too, for origin %s', (origin) => {
    const refs = emptyRefs(origin, 'project-1');

    // `agents` and `trackMappings` are objects holding arrays. They are the reason the promise
    // is worded "every array present" rather than "every field is an array", and the reason
    // they are absent from INTEGRITY_CHECKED_LISTS — so their shape needs its own assertion.
    expect(Array.isArray(refs.agents.runtime)).toBe(true);
    expect(Array.isArray(refs.agents.builder)).toBe(true);
    expect(Array.isArray(refs.trackMappings.proposalSections)).toBe(true);
    expect(Array.isArray(refs.trackMappings.solutionStories)).toBe(true);
  });

  it('carries the origin and project it was asked for, not a default', () => {
    const refs = emptyRefs('factory', 'delivery-project-9');
    expect(refs.origin).toBe('factory');
    expect(refs.projectId).toBe('delivery-project-9');
  });
});

describe('checkRefIntegrity covers every collection the shape has', () => {
  it('its list is exactly the array-valued top-level keys, in BOTH directions', () => {
    const derived = arrayValuedKeys(emptyRefs('sbp', 'p'));
    const declared = [...INTEGRITY_CHECKED_LISTS].sort();

    // Both directions on purpose. A subset assertion would miss a collection added to the
    // interface and never added to the walk, which is the defect this exists for; a superset
    // assertion would miss a name in the walk that no longer exists.
    expect(declared).toEqual(derived);
  });

  it.each([...INTEGRITY_CHECKED_LISTS])(
    'PER-POSITION CONTROL: a malformed ref in %s is actually reported',
    (list) => {
      const refs = emptyRefs('sbp', 'p');
      // An empty id is the malformation `checkRefIntegrity` looks for.
      (refs[list] as Array<{ id: string; revision: number }>).push({ id: '  ', revision: 1 });

      const report = checkRefIntegrity(refs);

      expect(report.ok).toBe(false);
      // Named, so a failure says which collection stopped being walked.
      expect(report.malformed.join(',')).toContain(list);
    },
  );

  it('PASSING COUNTERPART: a fresh empty snapshot is clean for every origin', () => {
    // Without this, the per-position controls above would pass against a check that reports
    // everything as malformed.
    for (const origin of ORIGINS) {
      expect(checkRefIntegrity(emptyRefs(origin, 'p')).ok).toBe(true);
    }
  });

  it('reports the same id appearing in two different collections', () => {
    const refs = emptyRefs('sbp', 'p');
    refs.processes.push({ id: 'shared-id', revision: 1 });
    refs.businessTasks.push({ id: 'shared-id', revision: 1 });

    const report = checkRefIntegrity(refs);
    expect(report.collisions).toContain('shared-id');
  });

  it('does NOT report the same id twice within one collection', () => {
    // A list may legitimately pin the same id at two revisions; only cross-list reuse is the
    // defect, because that is what makes a ref ambiguous about what it points at.
    const refs = emptyRefs('sbp', 'p');
    refs.processes.push({ id: 'same', revision: 1 });
    refs.processes.push({ id: 'same', revision: 2 });

    expect(checkRefIntegrity(refs).collisions).toEqual([]);
  });
});
