/**
 * Gate 11 — Builder / Intern Workspace + Experience Ledger.
 *
 * Two properties carry this gate: **no credit solely for attendance**, and **mode is a
 * support level, not a permission tier**. Both are easy to claim in a comment and easy to
 * break silently, so both are asserted here against the actual tables.
 */

import {
  CLAIM_RUBRICS,
  EXPERIENCE_CLAIM_TYPES,
  evaluateClaim,
  isExperienceClaimType,
  summarizeLedger,
  type ClaimCandidate,
} from '../../../modules/delivery/experienceLedger';
import {
  BUILDER_NAV_PURPOSE,
  BUILDER_NAV_SECTIONS,
  MODE_SUPPORT,
  WORKSPACE_MODES,
  assertModeIsSupportOnly,
  isWorkspaceMode,
  projectTruthForMode,
} from '../../../modules/delivery/builderWorkspace';
import {
  DEFAULT_THRESHOLDS,
  EXCEPTION_NATURE,
  MENTOR_EXCEPTION_KINDS,
  mentorExceptionsFor,
  prioritizeExceptions,
  type BuilderState,
} from '../mentorExceptions';
import { DELIVERY_EVIDENCE_TYPES } from '../../../modules/delivery/deliveryEvidence';

// ---------------------------------------------------------------------------
// Experience Ledger
// ---------------------------------------------------------------------------

describe('experience ledger vocabulary', () => {
  it('declares the master plan’s eleven claim types', () => {
    expect(EXPERIENCE_CLAIM_TYPES).toHaveLength(11);
  });

  it('every claim has a rubric a mentor could check by hand', () => {
    for (const claim of EXPERIENCE_CLAIM_TYPES) {
      expect(CLAIM_RUBRICS[claim].standard.length).toBeGreaterThan(20);
    }
  });

  it('every claim is substantiable by at least one real evidence type', () => {
    // A claim with no substantiating evidence would be unearnable — strict to the point of
    // being broken, which is a different failure from being strict.
    for (const claim of EXPERIENCE_CLAIM_TYPES) {
      const types = CLAIM_RUBRICS[claim].substantiatedBy;
      expect(types.length).toBeGreaterThan(0);
      for (const t of types) {
        expect(DELIVERY_EVIDENCE_TYPES).toContain(t);
      }
    }
  });

  it('every judgment-band claim requires a human to have stood behind it', () => {
    // "A machine recorded it" and "a person stood behind it" are different strengths of
    // proof, and judgment must not be reachable on the first alone.
    for (const claim of EXPERIENCE_CLAIM_TYPES) {
      const rubric = CLAIM_RUBRICS[claim];
      if (rubric.band === 'judgment') {
        expect({ claim, requires: rubric.requiresHumanConfirmation }).toEqual({
          claim,
          requires: true,
        });
      }
    }
  });

  it('rejects an unknown claim type', () => {
    expect(isExperienceClaimType('showed_up')).toBe(false);
  });
});

describe('evaluateClaim', () => {
  const earned: ClaimCandidate = {
    claimType: 'stories_directed',
    evidenceType: 'pull_request',
    evidenceOutcome: 'pass',
    builderDidTheWork: true,
  };

  it('earns a claim backed by passing evidence for work the builder did', () => {
    const verdict = evaluateClaim(earned);
    expect(verdict.earned).toBe(true);
    if (verdict.earned) expect(verdict.band).toBe('application');
  });

  it('NO CREDIT SOLELY FOR ATTENDANCE', () => {
    // The rule the whole gate turns on.
    const verdict = evaluateClaim({ ...earned, builderDidTheWork: false });
    expect(verdict.earned).toBe(false);
    if (!verdict.earned) {
      expect(verdict.rejections.map((r) => r.rule)).toContain('attendance_only');
    }
  });

  it('refuses evidence that cannot substantiate the claim', () => {
    const verdict = evaluateClaim({ ...earned, evidenceType: 'screenshot' });
    expect(verdict.earned).toBe(false);
    if (!verdict.earned) {
      expect(verdict.rejections.map((r) => r.rule)).toContain('evidence_cannot_substantiate');
    }
  });

  it('refuses a claim whose backing evidence did not pass', () => {
    for (const outcome of ['fail', 'partial', 'not_run']) {
      const verdict = evaluateClaim({ ...earned, evidenceOutcome: outcome });
      expect(verdict.earned).toBe(false);
    }
  });

  it('refuses a judgment claim with no human confirmation', () => {
    const verdict = evaluateClaim({
      claimType: 'architecture_decisions',
      evidenceType: 'architecture_review',
      evidenceOutcome: 'pass',
      builderDidTheWork: true,
      humanConfirmed: false,
    });
    expect(verdict.earned).toBe(false);
    if (!verdict.earned) {
      expect(verdict.rejections.map((r) => r.rule)).toContain('human_confirmation_missing');
    }
  });

  it('earns a judgment claim when a human did confirm it', () => {
    // Negative control for the test above: without it, a rule that rejected every judgment
    // claim would still pass.
    const verdict = evaluateClaim({
      claimType: 'architecture_decisions',
      evidenceType: 'architecture_review',
      evidenceOutcome: 'pass',
      builderDidTheWork: true,
      humanConfirmed: true,
    });
    expect(verdict.earned).toBe(true);
  });

  it('explains every refusal', () => {
    const verdict = evaluateClaim({ ...earned, evidenceType: 'screenshot', evidenceOutcome: 'fail' });
    if (!verdict.earned) {
      expect(verdict.rejections.length).toBeGreaterThanOrEqual(2);
      for (const r of verdict.rejections) expect(r.detail.length).toBeGreaterThan(10);
    } else {
      throw new Error('expected a refusal');
    }
  });

  it('counts a production incident as real experience', () => {
    // A ledger that only counted successes would teach people to avoid the work where
    // things go wrong.
    const verdict = evaluateClaim({
      claimType: 'production_incidents',
      evidenceType: 'operational_metric',
      evidenceOutcome: 'pass',
      builderDidTheWork: true,
      humanConfirmed: true,
    });
    expect(verdict.earned).toBe(true);
  });
});

describe('summarizeLedger', () => {
  it('reports rejected alongside earned', () => {
    // Showing only what was earned would make a ledger with many refusals look identical
    // to a clean one, and that difference is what a mentor needs.
    const summary = summarizeLedger([
      { claimType: 'stories_directed', evidenceType: 'pull_request', evidenceOutcome: 'pass', builderDidTheWork: true },
      { claimType: 'stories_directed', evidenceType: 'pull_request', evidenceOutcome: 'fail', builderDidTheWork: true },
      { claimType: 'stories_directed', evidenceType: 'pull_request', evidenceOutcome: 'pass', builderDidTheWork: false },
    ]);
    expect(summary.totalEarned).toBe(1);
    expect(summary.totalRejected).toBe(2);
    expect(summary.earnedByType.stories_directed).toBe(1);
  });

  it('an empty ledger is empty, not undefined', () => {
    const summary = summarizeLedger([]);
    expect(summary).toEqual({
      earnedByType: {},
      bandsEvidenced: [],
      totalEarned: 0,
      totalRejected: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Workspace modes
// ---------------------------------------------------------------------------

describe('builder workspace', () => {
  it('declares the master plan’s eight nav sections', () => {
    expect(BUILDER_NAV_SECTIONS).toEqual([
      'command',
      'plan',
      'design',
      'build',
      'agents',
      'proof',
      'release',
      'operate',
    ]);
  });

  it('explains every section', () => {
    for (const section of BUILDER_NAV_SECTIONS) {
      expect(BUILDER_NAV_PURPOSE[section]?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('MODE IS A SUPPORT LEVEL, NOT A PERMISSION TIER', () => {
    // The invariant, asserted against the actual table rather than trusted from a comment.
    expect(assertModeIsSupportOnly()).toEqual([]);
  });

  it('both modes execute approved work', () => {
    // Withholding execution in learn mode would make it a permission downgrade, and would
    // teach that learning is what you do instead of shipping.
    for (const mode of WORKSPACE_MODES) {
      expect(MODE_SUPPORT[mode].executesApprovedWork).toBe(true);
    }
  });

  it('both modes escalate consequential ambiguity', () => {
    for (const mode of WORKSPACE_MODES) {
      expect(MODE_SUPPORT[mode].escalatesConsequentialAmbiguity).toBe(true);
    }
  });

  it('the modes actually differ in support', () => {
    // Negative control: if the two profiles were identical, every assertion above would
    // still pass and the feature would be meaningless.
    expect(MODE_SUPPORT.learn).not.toEqual(MODE_SUPPORT.delivery);
    expect(MODE_SUPPORT.learn.asksBuilderToReason).toBe(true);
    expect(MODE_SUPPORT.delivery.recommends).toBe(true);
  });

  it('serves the SAME project truth to both modes', () => {
    const truth = { requirements: 12, stories: 40, secretsRedacted: false };
    expect(projectTruthForMode(truth, 'learn')).toEqual(projectTruthForMode(truth, 'delivery'));
  });

  it('rejects an unknown mode', () => {
    expect(isWorkspaceMode('supervised')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mentor exceptions
// ---------------------------------------------------------------------------

describe('mentor exceptions', () => {
  const calm: BuilderState = {
    builderIdentityId: 'builder-1',
    concurrentStories: 2,
    completedStories: 20,
    reworkedStories: 1,
    hasClientReviewExperience: true,
    clientReviewPending: false,
    trustOrSecurityGateFailing: false,
    architectureConcernRaised: false,
    releaseAwaitingApproval: false,
  };

  it('declares the master plan’s six exception kinds', () => {
    expect(MENTOR_EXCEPTION_KINDS).toHaveLength(6);
  });

  it('says nothing when nothing needs a mentor', () => {
    // A mentor shown everything sees nothing. This is the control that keeps the list an
    // exception list rather than a dashboard.
    expect(mentorExceptionsFor(calm)).toEqual([]);
  });

  it('fires on a failing trust or security gate, urgently', () => {
    const out = mentorExceptionsFor({ ...calm, trustOrSecurityGateFailing: true });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('failed_trust_or_security_gate');
    expect(out[0].urgent).toBe(true);
  });

  it('fires BEFORE a builder’s first client review, not after', () => {
    const out = mentorExceptionsFor({
      ...calm,
      clientReviewPending: true,
      hasClientReviewExperience: false,
    });
    expect(out.map((e) => e.kind)).toContain('first_client_review');
    expect(out[0].nature).toBe('opportunity');
  });

  it('does not fire for an experienced builder’s client review', () => {
    const out = mentorExceptionsFor({ ...calm, clientReviewPending: true });
    expect(out).toEqual([]);
  });

  it('fires on overload above the threshold', () => {
    const at = mentorExceptionsFor({ ...calm, concurrentStories: DEFAULT_THRESHOLDS.maxConcurrentStories });
    const over = mentorExceptionsFor({
      ...calm,
      concurrentStories: DEFAULT_THRESHOLDS.maxConcurrentStories + 1,
    });
    expect(at).toEqual([]);
    expect(over.map((e) => e.kind)).toContain('builder_overloaded');
  });

  it('ignores a rework rate computed from too few stories', () => {
    // 100% rework on one story is noise, and it would land on the person least able to
    // absorb it.
    const out = mentorExceptionsFor({ ...calm, completedStories: 1, reworkedStories: 1 });
    expect(out.map((e) => e.kind)).not.toContain('high_rework');
  });

  it('fires on a high rework rate once there is enough signal', () => {
    const out = mentorExceptionsFor({ ...calm, completedStories: 10, reworkedStories: 5 });
    expect(out.map((e) => e.kind)).toContain('high_rework');
    expect(out.find((e) => e.kind === 'high_rework')?.detail).toMatch(/50%/);
  });

  it('fires on release ready as an opportunity, urgently', () => {
    const out = mentorExceptionsFor({ ...calm, releaseAwaitingApproval: true });
    expect(out[0].kind).toBe('release_ready');
    expect(EXCEPTION_NATURE.release_ready).toBe('opportunity');
    expect(out[0].urgent).toBe(true);
  });

  it('reports every applicable exception rather than only the worst', () => {
    const out = mentorExceptionsFor({
      ...calm,
      trustOrSecurityGateFailing: true,
      architectureConcernRaised: true,
      concurrentStories: 9,
      releaseAwaitingApproval: true,
    });
    expect(out.length).toBe(4);
  });

  it('accepts overridden thresholds', () => {
    const out = mentorExceptionsFor(
      { ...calm, concurrentStories: 3 },
      { ...DEFAULT_THRESHOLDS, maxConcurrentStories: 2 },
    );
    expect(out.map((e) => e.kind)).toContain('builder_overloaded');
  });
});

describe('prioritizeExceptions', () => {
  it('puts urgent first, then problems before opportunities', () => {
    const out = prioritizeExceptions(
      mentorExceptionsFor({
        builderIdentityId: 'b',
        concurrentStories: 9,
        completedStories: 20,
        reworkedStories: 0,
        hasClientReviewExperience: true,
        clientReviewPending: false,
        trustOrSecurityGateFailing: true,
        architectureConcernRaised: true,
        releaseAwaitingApproval: true,
      }),
    );
    expect(out[0].kind).toBe('failed_trust_or_security_gate');
    expect(out[1].kind).toBe('release_ready');
    expect(out.slice(2).every((e) => !e.urgent)).toBe(true);
  });

  it('is stable across repeated calls', () => {
    // A queue that reshuffles between refreshes is a queue people stop trusting.
    const state: BuilderState = {
      builderIdentityId: 'b',
      concurrentStories: 9,
      completedStories: 20,
      reworkedStories: 10,
      hasClientReviewExperience: true,
      clientReviewPending: false,
      trustOrSecurityGateFailing: false,
      architectureConcernRaised: true,
      releaseAwaitingApproval: false,
    };
    const a = prioritizeExceptions(mentorExceptionsFor(state)).map((e) => e.kind);
    const b = prioritizeExceptions(mentorExceptionsFor(state)).map((e) => e.kind);
    expect(a).toEqual(b);
  });

  it('does not mutate its input', () => {
    const input = mentorExceptionsFor({
      builderIdentityId: 'b',
      concurrentStories: 9,
      completedStories: 20,
      reworkedStories: 0,
      hasClientReviewExperience: true,
      clientReviewPending: false,
      trustOrSecurityGateFailing: true,
      architectureConcernRaised: false,
      releaseAwaitingApproval: false,
    });
    const before = input.map((e) => e.kind);
    prioritizeExceptions(input);
    expect(input.map((e) => e.kind)).toEqual(before);
  });
});
