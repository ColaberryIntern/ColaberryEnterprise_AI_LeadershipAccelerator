/**
 * The automatic advancer refuses approvals BY CONSTRUCTION, not by a conditional.
 *
 * Session CC-20261021-h9v3. Design §3, with the DRI's Q1 answer: `operating` is automatic.
 *
 * The property under test is the one the whole separation rests on from the other side.
 * `readinessIsNeverSufficient.test.ts` proves readiness cannot get past `evaluateTransition`'s
 * permission check. This proves the pipeline's own command cannot be pointed at an approval or
 * a review at all - so there is no path, authorised or otherwise, by which a non-human advances
 * a stage a person owns.
 *
 * `WORK_HOPS` is derived from `STAGE_PERMISSION` at module load rather than hand-listed, so the
 * suite also pins that derivation: if someone changes a hop's permission to or from a work
 * permission, the exact-set test below is where it surfaces.
 *
 * ## Which test catches what, measured
 *
 * Mutation run before committing: add `contract.approve` to the work permissions, so the
 * automatic surface grows to include the blueprint approval. Three tests fail, and the diff
 * NAMES `blueprint_approved`.
 *
 * Note which test does NOT fail: `REFUSES every approval and review hop`. It iterates the hops
 * that are not in `WORK_HOPS`, so a hop leaking INTO the set simply stops being examined - its
 * coverage shrinks silently. That is exactly why the exact-set and the 4/8 count assertions
 * exist. The refusal test guards a logic inversion inside the existing set; the set assertions
 * guard the set itself growing. Neither is redundant.
 */
import { mayAutoAdvance, WORK_HOPS } from '../lifecycleAutoAdvance';
import { ADVANCE, LIFECYCLE_STAGES, type LifecycleStage } from '../lifecycleStages';
import { STAGE_PERMISSION } from '../lifecycleTransition';
import { readinessFor } from '../lifecycleReadiness';
import { completeEvidence } from './evidenceFixture';
import type { StageReadiness } from '../lifecycleReadiness';

/** Readiness for the hop out of `from`, forced to a known satisfied/unsatisfied state. */
function readinessOut(from: LifecycleStage, satisfied: boolean): StageReadiness {
  const to = ADVANCE[from] as LifecycleStage;
  const real = readinessFor(to, completeEvidence());
  return satisfied
    ? { ...real, satisfied: true, blocking: [] }
    : {
      ...real,
      satisfied: false,
      blocking: [{ rule: 'no_requirements', kind: 'unmet', message: 'forced for the test' }],
    };
}

describe('the four work hops, and nothing else', () => {
  it('is exactly the four hops whose permission describes performing work', () => {
    expect([...WORK_HOPS.entries()].sort()).toEqual([
      ['awaiting_blueprint_approval', 'project.write'],
      ['building', 'story.execute'],
      ['operating', 'release.deploy'],
      ['planning', 'story.write'],
    ]);
  });

  it('every OTHER forward hop is an approval or a review, and is absent', () => {
    const automatic: LifecycleStage[] = [];
    const human: LifecycleStage[] = [];
    for (const from of LIFECYCLE_STAGES) {
      const to = ADVANCE[from];
      if (!to) continue;
      (WORK_HOPS.has(to) ? automatic : human).push(to);
    }

    expect(automatic).toHaveLength(4);
    expect(human).toHaveLength(8);
    // Named, so a change to STAGE_PERMISSION shows up as a diff in a review rather than as a
    // silently larger automatic surface.
    for (const stage of human) {
      expect(STAGE_PERMISSION[stage]).toMatch(/\.(approve|review)$/);
    }
  });
});

describe('it cannot be pointed at a hop a person owns', () => {
  it('REFUSES every approval and review hop, even with satisfied readiness and a matching act', () => {
    for (const from of LIFECYCLE_STAGES) {
      const to = ADVANCE[from];
      if (!to || WORK_HOPS.has(to)) continue;

      const decision = mayAutoAdvance({
        from,
        // The strongest possible case for the caller: it claims the very permission the hop
        // requires, and the evidence is satisfied. It still must not advance.
        performedAct: STAGE_PERMISSION[to],
        readiness: readinessOut(from, true),
      });

      expect(decision.allowed).toBe(false);
      expect(decision.refusal).toBe('not_a_work_hop');
      expect(decision.message).toContain(STAGE_PERMISSION[to]);
    }
  });

  it('REFUSES a work hop when the act reported is not the work that hop is made of', () => {
    // Otherwise `building` could be advanced by reporting `project.write`.
    const decision = mayAutoAdvance({
      from: 'plan_ready',
      performedAct: 'project.write',
      readiness: readinessOut('plan_ready', true),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe('act_does_not_match');
  });

  it('REFUSES a work hop whose prerequisites are unmet', () => {
    const decision = mayAutoAdvance({
      from: 'plan_ready',
      performedAct: 'story.execute',
      readiness: readinessOut('plan_ready', false),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe('not_ready');
  });

  it('REFUSES readiness measured for a different hop', () => {
    const decision = mayAutoAdvance({
      from: 'plan_ready',
      performedAct: 'story.execute',
      readiness: readinessFor('operating', completeEvidence()),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe('illegal_edge');
  });

  it('REFUSES at the end of the chain', () => {
    const decision = mayAutoAdvance({
      from: 'operating',
      performedAct: 'release.deploy',
      readiness: readinessFor('operating', completeEvidence()),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.refusal).toBe('illegal_edge');
  });
});

describe('POSITIVE CONTROL: the four work hops do advance', () => {
  it('allows each one, with its matching act and satisfied readiness', () => {
    const allowed: LifecycleStage[] = [];

    for (const from of LIFECYCLE_STAGES) {
      const to = ADVANCE[from];
      if (!to) continue;
      const required = WORK_HOPS.get(to);
      if (!required) continue;

      const decision = mayAutoAdvance({
        from,
        performedAct: required,
        readiness: readinessOut(from, true),
      });

      expect(decision.refusal).toBeUndefined();
      expect(decision.allowed).toBe(true);
      expect(decision.to).toBe(to);
      allowed.push(to);
    }

    // Without this, every refusal above would pass just as well if the command refused
    // everything - the failure mode this programme keeps finding.
    expect(allowed.sort()).toEqual(
      ['awaiting_blueprint_approval', 'building', 'operating', 'planning'],
    );
  });
});
