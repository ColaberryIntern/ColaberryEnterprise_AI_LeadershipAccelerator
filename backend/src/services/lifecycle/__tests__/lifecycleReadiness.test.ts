/**
 * The readiness computation, and the fingerprint's controls IN BOTH DIRECTIONS.
 *
 * Session CC-20261021-h9v3. Design §4 / §9 step 1.
 *
 * The fingerprint is the part worth testing hardest. It exists so an approval granted on one
 * measurement can be compared against a later one, which means two failures matter equally:
 *
 *   - it must NOT change when nothing meaningful changed — otherwise every approval reads as
 *     stale and `needs_reapproval` fires constantly until someone disables the check;
 *   - it MUST change when any field changed — otherwise a stale approval reads as current,
 *     which is the direction that lets unauthorised work proceed.
 *
 * A test for only the first is the dangerous half, so `the fingerprint moves when ANY field
 * moves` perturbs every field in turn and is derived from the object's own keys rather than a
 * hand-written list.
 */
import { completeEvidence } from './evidenceFixture';
import {
  readinessFor,
  readinessAcross,
  nextHopReadiness,
  evidenceFingerprint,
  canonicalEvidence,
} from '../lifecycleReadiness';
import {
  prerequisiteGaps,
  satisfied,
  type LifecycleEvidence,
  type EvidenceField,
} from '../lifecyclePrerequisites';
import { ADVANCE, LIFECYCLE_STAGES, type LifecycleStage } from '../lifecycleStages';
import { STAGE_PERMISSION } from '../lifecycleTransition';

function nothingAssessed(): LifecycleEvidence {
  return { ...completeEvidence(), assessedFields: new Set() };
}

describe('the readiness computation delegates and never re-derives', () => {
  it('matches prerequisiteGaps for every stage, on satisfied evidence AND on nothing', () => {
    for (const evidence of [completeEvidence(), nothingAssessed()]) {
      for (const stage of LIFECYCLE_STAGES) {
        const r = readinessFor(stage, evidence);
        // The one authority on satisfaction is prerequisiteGaps. If this module ever grows its
        // own opinion, this fails.
        expect(r.satisfied).toBe(satisfied(prerequisiteGaps(stage, evidence)));
      }
    }
  });

  it('NOT ASSESSED BLOCKS: unmeasured evidence is never ready', () => {
    const evidence = nothingAssessed();
    const ready = LIFECYCLE_STAGES.filter((s) => readinessFor(s, evidence).satisfied);

    // `discovery` has no prerequisites to miss, so it is allowed to be trivially satisfied.
    expect(ready.filter((s) => s !== 'discovery')).toEqual([]);

    // And the reason is recorded as not-assessed rather than as a measured failure, because a
    // reviewer takes a different action in each case.
    const r = readinessFor('requirements_ready', evidence);
    expect(r.notAssessed.length).toBeGreaterThan(0);
    expect(r.satisfied).toBe(false);
  });

  it('reports the permission each stage requires, as a fact rather than a judgement', () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(readinessFor(stage, completeEvidence()).requiredPermission)
        .toBe(STAGE_PERMISSION[stage]);
    }
  });

  it('carries nothing that could be mistaken for an approval', () => {
    const r = readinessFor('blueprint_approved', completeEvidence()) as unknown as Record<string, unknown>;
    // An approval record has an actor and a role. A readiness record must have neither, or the
    // separation the design rests on is cosmetic.
    for (const forbidden of ['actor', 'approvedBy', 'approved_by', 'approvedByRole', 'role', 'measuredBy']) {
      expect(r[forbidden]).toBeUndefined();
    }
  });
});

describe('readinessAcross and nextHopReadiness cover the chain', () => {
  it('covers every stage that is the target of a forward hop, and not discovery', () => {
    const across = readinessAcross(completeEvidence());
    const targets = across.map((r) => r.targetStage);

    expect(targets).not.toContain('discovery');
    expect(targets).toContain('operating');
    // Twelve forward hops when written.
    expect(targets.length).toBeGreaterThanOrEqual(12);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('nextHopReadiness follows ADVANCE, and operating is the end of the chain', () => {
    const evidence = completeEvidence();
    for (const from of LIFECYCLE_STAGES) {
      const next = nextHopReadiness(from, evidence);
      if (ADVANCE[from] === null) {
        expect(next).toBeNull();
      } else {
        expect(next?.targetStage).toBe(ADVANCE[from]);
      }
    }
    expect(nextHopReadiness('operating', evidence)).toBeNull();
  });
});

describe('the evidence fingerprint', () => {
  it('is stable when only key order differs', () => {
    const a = completeEvidence();
    // Rebuild with the keys in reverse order; same values, different insertion order.
    const reversed = Object.fromEntries(
      Object.entries(a).reverse(),
    ) as unknown as LifecycleEvidence;

    expect(evidenceFingerprint(reversed)).toBe(evidenceFingerprint(a));
  });

  it('is stable when a Set iterates differently', () => {
    const a = completeEvidence();
    const b: LifecycleEvidence = {
      ...a,
      assessedFields: new Set([...a.assessedFields].reverse() as EvidenceField[]),
    };

    expect(evidenceFingerprint(b)).toBe(evidenceFingerprint(a));
  });

  it('is stable when an id list is in a different order, because membership is the meaning', () => {
    const base: LifecycleEvidence = {
      ...completeEvidence(),
      requirementsWithoutProvenance: ['r-1', 'r-2', 'r-3'],
    };
    const shuffled: LifecycleEvidence = {
      ...base,
      requirementsWithoutProvenance: ['r-3', 'r-1', 'r-2'],
    };

    expect(evidenceFingerprint(shuffled)).toBe(evidenceFingerprint(base));
  });

  it('THE FINGERPRINT MOVES WHEN ANY FIELD MOVES — the other half of the control', () => {
    const base = completeEvidence();
    const baseHash = evidenceFingerprint(base);
    const unchanged: string[] = [];

    for (const key of Object.keys(base) as Array<keyof LifecycleEvidence>) {
      const current = base[key];
      let perturbed: unknown;

      if (current instanceof Set) perturbed = new Set([...current, '__probe__']);
      else if (Array.isArray(current)) perturbed = [...current, '__probe__'];
      else if (typeof current === 'number') perturbed = current + 1;
      else if (typeof current === 'boolean') perturbed = !current;
      else if (typeof current === 'string') perturbed = `${current}__probe__`;
      else perturbed = '__probe__'; // null fields

      const next = { ...base, [key]: perturbed } as unknown as LifecycleEvidence;
      if (evidenceFingerprint(next) === baseHash) unchanged.push(String(key));
    }

    // Named, not counted: a count says something is invisible to the hash and not which field.
    expect(unchanged).toEqual([]);
  });

  it('is a sha256 hex digest, and the canonical form is deterministic', () => {
    const e = completeEvidence();
    expect(evidenceFingerprint(e)).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalEvidence(e)).toBe(canonicalEvidence(completeEvidence()));
  });
});
