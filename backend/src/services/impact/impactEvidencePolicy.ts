/**
 * C8.12 - the rules a day-90 impact report must obey, as pure functions.
 *
 * The ticket names the failure mode it is most afraid of: "Declaring it done against a
 * schema that exists but holds no rows." Production is worse than that here. The schema
 * exists, it holds 5,390 rows, and the baseline columns inside it are filled with
 * zeros rather than left null. A report that subtracts a baseline from an exit score
 * would therefore produce arithmetic that works, reads as measurement, and is fiction.
 *
 * Every rule below is a production measurement taken on 2026-10-26, not a preference.
 * Each one is stated with the number that forced it so a later reader can re-measure
 * instead of trusting this comment.
 */

/** What a given evidence source can and cannot be used to claim. */
export interface EvidenceClass {
  readonly sourceType: string;
  /** What a row of this type actually proves. */
  readonly proves: string;
  /** Can an outside reader open it and check it themselves? */
  readonly independentlyOpenable: boolean;
  /** Why not, when it is not. */
  readonly openabilityNote: string;
}

/**
 * Measured on production 2026-10-26 across the 1,100 rows of `evidence_records`:
 *   github_commit 382 - source_ref is `STORY-NNN@<40-hex>`, no repository
 *   deliverable   309 - source_ref is a UUID into our own tables
 *   prompt_lab    149 - UUID
 *   implementation 135 - UUID
 *   instructor_review 125 - UUID, but behind it is a named human attestation
 * All 1,100 carry validated = true, so `validated` does not discriminate and must not be
 * presented as if it did.
 */
export const EVIDENCE_CLASSES: readonly EvidenceClass[] = [
  {
    sourceType: 'github_commit',
    proves: 'A specific commit was verified against the learner repository by the build pipeline',
    independentlyOpenable: true,
    openabilityNote:
      'Only once the repository is supplied. The stored ref is STORY-NNN@<sha> and carries no '
      + 'repository, so the SHA alone is not openable; resolveCommitEvidence() supplies the repo.',
  },
  {
    sourceType: 'instructor_review',
    proves: 'A named instructor reviewed the work and recorded a judgment',
    independentlyOpenable: false,
    openabilityNote: 'Internal record. The sponsor can be told it happened and by whom, not shown it.',
  },
  {
    sourceType: 'deliverable',
    proves: 'A deliverable was submitted and accepted against a card',
    independentlyOpenable: false,
    openabilityNote: 'source_ref is a UUID into our own tables.',
  },
  {
    sourceType: 'implementation',
    proves: 'An implementation step was recorded against a card',
    independentlyOpenable: false,
    openabilityNote: 'source_ref is a UUID into our own tables.',
  },
  {
    sourceType: 'prompt_lab',
    proves: 'A prompt-lab exercise was completed',
    independentlyOpenable: false,
    openabilityNote: 'source_ref is a UUID into our own tables.',
  },
] as const;

const BY_SOURCE_TYPE = new Map(EVIDENCE_CLASSES.map((c) => [c.sourceType, c]));

export function evidenceClassFor(sourceType: string): EvidenceClass | null {
  return BY_SOURCE_TYPE.get(sourceType) ?? null;
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

/**
 * `measured` means an instrument produced the number. `claimed` means the learner said
 * it. The two are never merged, because the whole value of this report is that a sponsor
 * can tell which one they are reading.
 */
export type BaselineState = 'measured' | 'claimed' | 'not_measured';

/** The only two columns anyone could mistake for a day-one figure. */
export type BaselineSource = 'placement_score' | 'intake_resume_claim';

export interface BaselineReading {
  readonly state: BaselineState;
  /** Null whenever state is not_measured. Never 0 standing in for "unknown". */
  readonly value: number | null;
  /** True only when an instrument produced it. A resume claim is not an instrument. */
  readonly isMeasurement: boolean;
  readonly because: string;
}

/**
 * THE CENTRAL FINDING OF C8.12: this platform has no baseline, for anybody.
 *
 * `placement_score` is the only column that looks like one, and it is not one. Two
 * independent facts rule it out, both verified rather than assumed:
 *
 *  1. capePlacementService's own header states it is "always DERIVED FRESH from source
 *     (current resume_skill_claims + diagnostic_attempts history)" on every full-replace
 *     recompute, and computePlacementScore() calls getCurrentResumeSkillClaims(), which
 *     filters on the profile's CURRENT resume_version. Upload a new resume in week 10 and
 *     the "baseline" moves - normally upward, which would shrink the learner's apparent
 *     progress. A figure that changes after the fact is not a record of the past.
 *  2. Its only measured input is the diagnostic nudge, and `diagnostic_attempts` holds
 *     ZERO rows in production. So placement reduces to max(credit_weight) over a
 *     self-reported resume. Nothing has ever been measured into it.
 *
 * On top of that the column is NOT NULL defaulted to 0 and sits at exactly 0 on 5,376 of
 * 5,390 rows, with claim_score and judgment_score at 0 on all 5,390.
 *
 * So this function refuses placement outright rather than refusing only the zeros. The
 * fourteen non-zero rows are the dangerous ones: they are the only inputs that would let
 * the report print a movement sentence, and that sentence would be false.
 */
export function readBaseline(input: {
  source: BaselineSource;
  value: number | null | undefined;
}): BaselineReading {
  const { source, value } = input;

  if (source === 'placement_score') {
    return {
      state: 'not_measured',
      value: null,
      isMeasurement: false,
      because: 'placement_score is recomputed from the learner\'s CURRENT resume on every '
        + 'recompute and its only measured input (diagnostic_attempts) has never been '
        + 'populated, so it is a present-tense self-report estimate and not an intake '
        + 'measurement - whatever value it holds',
    };
  }

  if (value === null || value === undefined) {
    return { state: 'not_measured', value: null, isMeasurement: false, because: `${source} is null` };
  }
  if (value === 0) {
    return {
      state: 'not_measured',
      value: null,
      isMeasurement: false,
      because: `${source} is zero, which records the absence of a claim rather than a claim of zero`,
    };
  }
  // An intake resume claim IS durable: resume_skill_claims is insert-only and versioned,
  // so the earliest surviving version is a frozen record of what the learner said, on a
  // known date. It is still a claim, so it never reports as a measurement.
  return {
    state: 'claimed',
    value,
    isMeasurement: false,
    because: 'the earliest surviving resume claim for this skill, which records what the learner '
      + 'stated rather than anything we measured',
  };
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/**
 * `measured` is reserved for an instrument-to-instrument comparison and is currently
 * unreachable in production by design - nothing in the platform measures a learner at
 * intake. `claim_to_evidence` is the strongest thing the data does support: what the
 * learner stated on a known date, beside what they have since had verified.
 */
export type MovementState = 'measured' | 'claim_to_evidence' | 'single_observation' | 'no_baseline';

export interface MovementReading {
  readonly state: MovementState;
  readonly from: number | null;
  readonly to: number | null;
  readonly observationDays: number;
  /** False whenever `from` is a claim. Callers must not phrase it as improvement. */
  readonly isLikeForLike: boolean;
  readonly because: string;
}

/**
 * Baseline-to-exit movement needs two observations on two different days. Production:
 * of the 154 enrollments carrying skill evidence, 106 have every row stamped on a single
 * day - a one-shot backfill, not a trajectory. Reporting "movement" off one observation
 * is the same error as reporting it off a zero baseline, arrived at from the other side.
 */
export function readMovement(input: {
  baseline: BaselineReading;
  latest: number | null | undefined;
  distinctObservationDays: number;
}): MovementReading {
  const { baseline, latest, distinctObservationDays } = input;
  const to = latest === null || latest === undefined ? null : latest;

  if (baseline.state === 'not_measured') {
    return {
      state: 'no_baseline',
      from: null,
      to,
      observationDays: distinctObservationDays,
      isLikeForLike: false,
      because: `movement cannot be stated without a baseline: ${baseline.because}`,
    };
  }
  if (distinctObservationDays < 2) {
    return {
      state: 'single_observation',
      from: baseline.value,
      to,
      observationDays: distinctObservationDays,
      isLikeForLike: false,
      because: 'all evidence for this learner carries a single observation date, so there is no '
        + 'second point to compare against',
    };
  }
  // A claim on one end and verified evidence on the other is not a like-for-like
  // comparison, and the difference between them is not an improvement figure. Saying so
  // in the type is the only way the renderer cannot accidentally subtract them.
  if (!baseline.isMeasurement) {
    return {
      state: 'claim_to_evidence',
      from: baseline.value,
      to,
      observationDays: distinctObservationDays,
      isLikeForLike: false,
      because: 'the starting figure is what the learner claimed and the current figure is what has '
        + 'been verified; the two are different kinds of statement and the gap between them is '
        + 'not an improvement measurement',
    };
  }
  return {
    state: 'measured',
    from: baseline.value,
    to,
    observationDays: distinctObservationDays,
    isLikeForLike: true,
    because: `baseline and latest both measured, across ${distinctObservationDays} distinct days`,
  };
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export type AssessmentState = 'passed' | 'not_passed' | 'not_graded';

export interface AssessmentReading {
  readonly state: AssessmentState;
  readonly score: number | null;
  readonly threshold: number | null;
  readonly because: string;
}

/**
 * Production holds 230 quiz attempts across 78 enrollments whose `pass_threshold` is
 * null, which makes `passed` false on every one of them - while the mean score is 0.835
 * and 960 of 1,150 answers are correct. By contrast all 134 `evaluation` attempts carry a
 * 0.7 threshold and 125 of them passed.
 *
 * So "0 of 78 learners passed" is a sentence this codebase can currently produce and it
 * is false. An attempt with no threshold was never graded, and not-graded is its own
 * state, never a failure.
 */
export function readAssessment(input: {
  score: number | null | undefined;
  passThreshold: number | null | undefined;
  passedFlag?: boolean | null;
}): AssessmentReading {
  const score = input.score === null || input.score === undefined ? null : input.score;
  const threshold = input.passThreshold === null || input.passThreshold === undefined
    ? null
    : input.passThreshold;

  if (threshold === null) {
    return {
      state: 'not_graded',
      score,
      threshold: null,
      because: 'no pass_threshold was ever set on this attempt, so it was never graded; the stored '
        + 'passed flag is false by default and does not mean the learner failed',
    };
  }
  if (score === null) {
    return { state: 'not_graded', score: null, threshold, because: 'attempt carries no score' };
  }
  return {
    state: score >= threshold ? 'passed' : 'not_passed',
    score,
    threshold,
    because: `scored ${score} against a threshold of ${threshold}`,
  };
}

// ---------------------------------------------------------------------------
// Proficiency scales
// ---------------------------------------------------------------------------

export type ScaleBand = 'unit' | 'ten' | 'wide';

/**
 * `student_architecture_skill.proficiency` holds three mutually incompatible scales at
 * the same `weights_version = 1`. Production, among the 527 rows above zero:
 *   0 - 1    4 rows    (4 enrollments)
 *   2.5 - 6  199 rows  (98 enrollments)
 *   12 - 60  324 rows  (66 enrollments)
 * A leaderboard over this column ranks the scale a learner happened to be scored on.
 */
export function scaleBandOf(value: number): ScaleBand {
  if (value <= 1) return 'unit';
  if (value <= 10) return 'ten';
  return 'wide';
}

export function scalesAreComparable(values: readonly number[]): boolean {
  const bands = new Set(values.filter((v) => v > 0).map(scaleBandOf));
  return bands.size <= 1;
}

// ---------------------------------------------------------------------------
// Commit resolution
// ---------------------------------------------------------------------------

export interface CommitResolution {
  readonly sha: string | null;
  readonly storyKey: string | null;
  /** An address a sponsor can open, or null with a stated reason. */
  readonly url: string | null;
  readonly because: string;
}

const COMMIT_REF = /^(.+)@([0-9a-f]{40})$/;
const GITHUB_REPO = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/;

/**
 * Turn the stored `STORY-NNN@<sha>` into something checkable.
 *
 * The repository is resolved through the PROJECT, never the enrollment. Measured on
 * production: joining the 383 commit-evidence rows through `enrollment_id` leaves 236 of
 * them ambiguous, because 7 enrollments own between 2 and 6 github_connections. Joining
 * the 384 verified tasks through `project_id` is unambiguous for all 384. An ambiguous
 * join would silently attribute a learner's commit to the wrong repository, which is a
 * worse outcome than declining to link it.
 */
export function resolveCommitEvidence(input: {
  sourceRef: string | null | undefined;
  repoUrl: string | null | undefined;
}): CommitResolution {
  const ref = (input.sourceRef ?? '').trim();
  const match = COMMIT_REF.exec(ref);
  if (!match) {
    return { sha: null, storyKey: null, url: null, because: 'source_ref is not <key>@<40-hex sha>' };
  }
  const [, storyKey, sha] = match;

  const repo = (input.repoUrl ?? '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  if (!repo) {
    return {
      sha,
      storyKey,
      url: null,
      because: 'the commit was verified but no repository was recorded against the project, so the '
        + 'SHA cannot be opened',
    };
  }
  if (!GITHUB_REPO.test(repo)) {
    return { sha, storyKey, url: null, because: `recorded repository is not an https GitHub repo URL` };
  }
  return { sha, storyKey, url: `${repo}/commit/${sha}`, because: 'resolved through the project repository' };
}

// ---------------------------------------------------------------------------
// Guards - these run at assembly time and throw rather than ship a false report
// ---------------------------------------------------------------------------

export function assertZeroIsNeverAMeasuredBaseline(): void {
  const zero = readBaseline({ source: 'intake_resume_claim', value: 0 });
  if (zero.state !== 'not_measured' || zero.value !== null) {
    throw new Error('impact policy: a zero baseline was treated as a measurement');
  }
  const real = readBaseline({ source: 'intake_resume_claim', value: 8.64 });
  if (real.state !== 'claimed' || real.value !== 8.64) {
    throw new Error('impact policy: a real intake claim was discarded');
  }
}

/**
 * The guard that stops the only sentence in this report that would be a lie: fourteen
 * non-zero placement scores are the sole inputs capable of producing a movement claim,
 * and placement is a present-tense resume derivation.
 */
export function assertPlacementIsNeverABaseline(): void {
  for (const value of [0, 8.64, 16.2, 100]) {
    const r = readBaseline({ source: 'placement_score', value });
    if (r.state !== 'not_measured' || r.value !== null || r.isMeasurement) {
      throw new Error(`impact policy: placement_score ${value} was accepted as a baseline`);
    }
  }
}

export function assertAClaimIsNeverCalledAMeasurement(): void {
  const claim = readBaseline({ source: 'intake_resume_claim', value: 8.64 });
  if (claim.isMeasurement) {
    throw new Error('impact policy: a resume claim reported itself as a measurement');
  }
  const m = readMovement({ baseline: claim, latest: 20, distinctObservationDays: 5 });
  if (m.state !== 'claim_to_evidence' || m.isLikeForLike) {
    throw new Error('impact policy: a claim-to-evidence comparison was reported as measured movement');
  }
}

export function assertMovementNeedsTwoObservations(): void {
  const baseline = readBaseline({ source: 'intake_resume_claim', value: 8.64 });
  const one = readMovement({ baseline, latest: 20, distinctObservationDays: 1 });
  if (one.state !== 'single_observation') {
    throw new Error('impact policy: movement was stated from a single observation');
  }
  const two = readMovement({ baseline, latest: 20, distinctObservationDays: 2 });
  if (two.from !== 8.64 || two.to !== 20) {
    throw new Error('impact policy: a genuinely comparable pair was suppressed');
  }
  const none = readMovement({
    baseline: readBaseline({ source: 'intake_resume_claim', value: 0 }),
    latest: 20,
    distinctObservationDays: 9,
  });
  if (none.state !== 'no_baseline' || none.from !== null) {
    throw new Error('impact policy: movement was stated without a baseline');
  }
}

export function assertUngradedIsNeverAFailure(): void {
  const ungraded = readAssessment({ score: 0.835, passThreshold: null, passedFlag: false });
  if (ungraded.state !== 'not_graded') {
    throw new Error('impact policy: an ungraded attempt was reported as a failure');
  }
  const failed = readAssessment({ score: 0.5, passThreshold: 0.7, passedFlag: false });
  if (failed.state !== 'not_passed') {
    throw new Error('impact policy: a real failure was hidden');
  }
  const passed = readAssessment({ score: 0.9, passThreshold: 0.7, passedFlag: true });
  if (passed.state !== 'passed') {
    throw new Error('impact policy: a real pass was suppressed');
  }
}

export function assertIncomparableScalesAreNeverRanked(): void {
  if (scalesAreComparable([0.5, 60])) {
    throw new Error('impact policy: two incompatible proficiency scales were called comparable');
  }
  if (!scalesAreComparable([2.5, 6])) {
    throw new Error('impact policy: one consistent scale was called incomparable');
  }
}

export function assertAnUnlocatableCommitIsNeverCalledOpenable(): void {
  const sha = 'a'.repeat(40);
  const bare = resolveCommitEvidence({ sourceRef: `STORY-001@${sha}`, repoUrl: null });
  if (bare.url !== null || bare.sha !== sha) {
    throw new Error('impact policy: a commit with no repository was presented as openable');
  }
  const resolved = resolveCommitEvidence({
    sourceRef: `STORY-001@${sha}`,
    repoUrl: 'https://github.com/acme/widget',
  });
  if (resolved.url !== `https://github.com/acme/widget/commit/${sha}`) {
    throw new Error('impact policy: a resolvable commit was not resolved');
  }
}

/** Run every guard. Called by the report assembler before it returns anything. */
export function assertImpactPolicyHolds(): void {
  assertZeroIsNeverAMeasuredBaseline();
  assertPlacementIsNeverABaseline();
  assertAClaimIsNeverCalledAMeasurement();
  assertMovementNeedsTwoObservations();
  assertUngradedIsNeverAFailure();
  assertIncomparableScalesAreNeverRanked();
  assertAnUnlocatableCommitIsNeverCalledOpenable();
}
