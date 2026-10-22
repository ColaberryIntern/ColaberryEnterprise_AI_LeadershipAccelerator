/**
 * READINESS IS NEVER SUFFICIENT TO ADVANCE A STAGE.
 *
 * Session CC-20261021-h9v3. Written BEFORE the readiness feature it guards, which is the point.
 *
 * ## What this pins, and why it exists now
 *
 * `readiness-and-approval-separation.md` proposes computing, automatically and from build events,
 * whether each stage's prerequisites are satisfied. Its load-bearing safety property is that such
 * a computation must never be able to move a project on its own:
 *
 *   > A bug in readiness computation must be incapable of advancing a stage.
 *
 * That property is ALREADY TRUE in `evaluateTransition`, structurally rather than by assertion:
 * the permission check returns early, BEFORE prerequisites are consulted at all. So the strongest
 * possible readiness - every prerequisite satisfied, every field assessed - still cannot get past
 * an actor who holds no permission.
 *
 * Nothing in the repository said so. This suite says so, so that the readiness work cannot quietly
 * invert the order of those two checks later. It is a guard on a property, not a test of a feature,
 * and it needs no schema, no flag and no new code.
 *
 * ## The shape of the proof
 *
 * - `the strongest readiness is refused` runs EVERY legal forward hop with fully satisfied
 *   evidence and an actor holding nothing, and requires `forbidden` each time.
 * - `an unauthorized caller learns nothing` requires that the refusal stay `forbidden` when the
 *   prerequisites are ALSO unmet - so a refusal never leaks readiness to someone with no
 *   standing, and the ORDER of the two checks is pinned.
 * - `POSITIVE CONTROL` grants the one required permission and requires the refusal to stop being
 *   `forbidden`. Without it, the first test would pass just as well if everything were always
 *   refused, which is the failure mode this programme keeps finding.
 *
 * ## Which test catches what, measured rather than assumed
 *
 * Both mutations were run against this suite before it was committed:
 *
 * | Mutation to `evaluateTransition` | Caught by |
 * |---|---|
 * | permission check MOVED AFTER the prerequisite check | `an unauthorized caller learns nothing` ONLY |
 * | permission check DELETED | `the strongest readiness is refused` (the hop becomes allowed) AND the above |
 *
 * The first row is the one worth knowing: a reorder is INVISIBLE to the fully-satisfied case,
 * because the prerequisite check then falls through and the permission check still refuses. Only
 * the nothing-assessed case exposes it. An earlier draft of this comment claimed the first test
 * caught the reorder; running the mutation showed otherwise.
 */
import { completeEvidence } from './evidenceFixture';
import { ADVANCE, LIFECYCLE_STAGES, type LifecycleStage } from '../lifecycleStages';
import { evaluateTransition, STAGE_PERMISSION } from '../lifecycleTransition';
import { prerequisiteGaps, satisfied, type LifecycleEvidence } from '../lifecyclePrerequisites';

/** Every legal forward hop, derived from ADVANCE so a new stage joins this suite by existing. */
function forwardHops(): Array<{ from: LifecycleStage; to: LifecycleStage }> {
  const hops: Array<{ from: LifecycleStage; to: LifecycleStage }> = [];
  for (const from of LIFECYCLE_STAGES) {
    const to = ADVANCE[from];
    if (to) hops.push({ from, to });
  }
  return hops;
}

/** Evidence with nothing measured: the weakest possible readiness. */
function nothingAssessed(): LifecycleEvidence {
  return { ...completeEvidence(), assessedFields: new Set() };
}

describe('readiness is never sufficient to advance a stage', () => {
  it('surveys every forward hop, so a passing run is not an empty one', () => {
    const hops = forwardHops();
    // Twelve when written: discovery -> ... -> operating. A collapse means ADVANCE broke, not
    // that the chain got shorter.
    expect(hops.length).toBeGreaterThanOrEqual(12);
    expect(hops.map((h) => h.to)).toContain('blueprint_approved');
    expect(hops.map((h) => h.to)).toContain('operating');
  });

  it('THE STRONGEST READINESS IS REFUSED when the actor holds no permission', () => {
    const evidence = completeEvidence();

    for (const { from, to } of forwardHops()) {
      const decision = evaluateTransition({ from, to, actorPermissions: [], evidence });

      // `allowed` is the load-bearing assertion here: deleting the permission check makes this
      // hop ADVANCE on readiness alone, which is precisely the thing the design forbids. The
      // refusal reason is asserted too, but note it does NOT catch a reorder - see the table in
      // the docblock for which test does.
      expect(decision.allowed).toBe(false);
      expect(decision.refusal).toBe('forbidden');
      expect(decision.message).toContain(STAGE_PERMISSION[to]);
    }
  });

  it('AN UNAUTHORIZED CALLER LEARNS NOTHING about readiness', () => {
    const evidence = nothingAssessed();

    for (const { from, to } of forwardHops()) {
      const decision = evaluateTransition({ from, to, actorPermissions: [], evidence });

      // Prerequisites are unmet AND the actor is unauthorized. The refusal must be the
      // permission one, and it must carry no gaps - a caller with no standing should not be
      // handed a list of what the project is missing.
      expect(decision.refusal).toBe('forbidden');
      expect(decision.gaps).toEqual([]);
      expect(decision.blocking).toEqual([]);
    }
  });

  it('POSITIVE CONTROL: the one required permission is what moves the gate', () => {
    const evidence = completeEvidence();
    let everAllowed = 0;

    for (const { from, to } of forwardHops()) {
      const decision = evaluateTransition({
        from,
        to,
        actorPermissions: [STAGE_PERMISSION[to]],
        evidence,
      });

      // The permission gate is now past. Whether the hop is ALLOWED then depends on evidence,
      // which differs per stage - so the invariant asserted here is only that `forbidden` is
      // gone. That is precisely the thing the first test attributes to the missing permission.
      expect(decision.refusal).not.toBe('forbidden');
      if (decision.allowed) everAllowed += 1;
    }

    // And the happy path is genuinely reachable, so none of the above passes because every
    // transition is refused for some other reason.
    expect(everAllowed).toBeGreaterThan(0);
  });

  it('the fixture really is satisfying evidence, or none of the above means anything', () => {
    const evidence = completeEvidence();
    const satisfiedStages = LIFECYCLE_STAGES.filter((s) => satisfied(prerequisiteGaps(s, evidence)));

    // completeEvidence() does not have to satisfy every stage, but if it satisfied none, the
    // "strongest readiness" in the first test would be a fiction.
    expect(satisfiedStages.length).toBeGreaterThan(0);
  });

  it('pins the permission each hop requires, because the design rests on this table', () => {
    // A factual snapshot of STAGE_PERMISSION, not a judgement about it. The readiness design
    // classifies hops by what their permission MEANS - approve, review, or perform work - so a
    // change here changes which hops could ever be automatic. That belongs in a review, not in
    // a silent diff.
    const required = Object.fromEntries(
      forwardHops().map(({ to }) => [to, STAGE_PERMISSION[to]]),
    );

    expect(required).toEqual({
      requirements_ready: 'requirement.approve',
      process_ready: 'architecture.approve',
      allocation_ready: 'agent.approve',
      design_ready: 'design.approve',
      awaiting_blueprint_approval: 'project.write',
      blueprint_approved: 'contract.approve',
      planning: 'story.write',
      plan_ready: 'story.review',
      building: 'story.execute',
      release_review: 'story.review',
      launch_ready: 'release.approve',
      operating: 'release.deploy',
    });
  });
});
