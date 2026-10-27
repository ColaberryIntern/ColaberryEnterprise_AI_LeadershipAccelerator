/**
 * C8.12 - assembling the day-90 impact report.
 *
 * THE REPORT'S DEFINING BEHAVIOR IS WHAT IT REFUSES TO SAY. Three of the four things a
 * sponsor most wants to read are not currently supportable by the data, and every one of
 * them is supportable-looking:
 *
 *   "They improved from X to Y"   - the baseline columns are NOT NULL defaulted to zero,
 *                                   so the subtraction succeeds and means nothing.
 *   "N of M passed the quizzes"   - pass_threshold is null on every quiz attempt, so the
 *                                   stored passed flag is false at a mean score of 0.835.
 *   "Ranked by proficiency"       - that column holds three incompatible scales at one
 *                                   weights_version.
 *
 * Each of those is blocked by a guard in impactEvidencePolicy rather than by a comment,
 * and each refusal is reported as a named gap instead of being silently omitted. A gap a
 * sponsor can see is a renewal conversation; a gap papered over is the reason they do not
 * renew the year after.
 */
import {
  assertImpactPolicyHolds,
  evidenceClassFor,
  readAssessment,
  readBaseline,
  readMovement,
  resolveCommitEvidence,
  scaleBandOf,
  scalesAreComparable,
  type AssessmentReading,
  type MovementReading,
} from './impactEvidencePolicy';
import {
  readAssessments,
  readEnrollmentAnchors,
  readEvidenceTallies,
  readIntakeClaims,
  readSkillStandings,
  readSponsorStanding,
  readVerifiedCommits,
  resolvePopulation,
  type PopulationSelector,
  type SponsorStanding,
} from './dayNinetyReportService';

export const DAY_NINETY = 90;

/** One factual statement plus the thing that backs it. Nothing renders without both. */
export interface ImpactClaim {
  statement: string;
  sourceType: string;
  sourceRef: string | null;
  /** An address the reader can open, or null with a reason. */
  openableUrl: string | null;
  whyNotOpenable: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export interface LearnerImpact {
  enrollmentId: string;
  /** The enrollment row's own creation date. Named for what it is, not called "day one". */
  enrolledAt: string | null;
  firstEvidenceAt: string | null;
  lastEvidenceAt: string | null;
  daysObserved: number;
  reachedDayNinety: boolean;
  claims: ImpactClaim[];
  verifiedCommits: number;
  openableCommits: number;
  /** Which resume version the starting claim came from, or null if none survives. */
  earliestClaimVersion: number | null;
  movement: MovementReading;
  assessments: Array<{ kind: string; attempts: number; reading: AssessmentReading }>;
  /** Statements this learner's data cannot support, each with the reason. */
  gaps: string[];
}

export interface DayNinetyReport {
  generatedAt: string;
  selector: PopulationSelector;
  populationNote: string;
  sponsor: SponsorStanding | null;
  learners: LearnerImpact[];
  summary: {
    learnersInPopulation: number;
    learnersWithAnyEvidence: number;
    learnersPastDayNinety: number;
    totalClaims: number;
    openableClaims: number;
    /** Instrument-to-instrument movement. Zero everywhere until an intake measure exists. */
    learnersWithMeasuredMovement: number;
    /** Resume claim beside verified evidence - the strongest comparison the data supports. */
    learnersWithClaimToEvidence: number;
  };
  /** Report-level statements that cannot be made, and why. */
  gaps: string[];
}

const report0MeasuredMovement = (ls: readonly LearnerImpact[]): boolean =>
  ls.every((l) => l.movement.state !== 'measured');

const daysBetween = (a: string | null, b: string | null): number => {
  if (!a || !b) return 0;
  return Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);
};

function buildCommitClaims(
  commits: ReadonlyArray<{
    taskTitle: string; storyId: string | null; verifiedRef: string | null;
    verifiedBy: string | null; verifiedAt: string | null; repoUrl: string | null;
  }>,
): ImpactClaim[] {
  return commits.map((c) => {
    // verified_ref holds a bare 40-hex SHA on the build-pipeline rows and a URL on the
    // demo-evidence ones, so the ref is normalized into the policy's <key>@<sha> form
    // before resolution rather than being pattern-matched twice.
    const bare = (c.verifiedRef ?? '').trim();
    const looksLikeSha = /^[0-9a-f]{40}$/.test(bare);
    const resolution = looksLikeSha
      ? resolveCommitEvidence({ sourceRef: `${c.storyId ?? 'STORY'}@${bare}`, repoUrl: c.repoUrl })
      : { sha: null, storyKey: null, url: /^https?:\/\//.test(bare) ? bare : null, because: bare
          ? 'the recorded reference is a link rather than a commit' : 'no reference was recorded' };

    return {
      statement: c.taskTitle || 'Verified build task',
      sourceType: looksLikeSha ? 'github_commit' : 'submitted_artifact',
      sourceRef: bare || null,
      openableUrl: resolution.url,
      whyNotOpenable: resolution.url ? null : resolution.because,
      verifiedBy: c.verifiedBy,
      verifiedAt: c.verifiedAt,
    };
  });
}

/**
 * Every claim must carry a source. A claim without one is not a weaker claim, it is an
 * assertion, and this report exists specifically so the sponsor is not handed assertions.
 */
export function assertNoClaimWithoutASource(claims: readonly ImpactClaim[]): void {
  for (const c of claims) {
    if (!c.statement.trim()) throw new Error('impact report: a claim has no statement');
    if (!c.sourceType.trim()) throw new Error(`impact report: claim "${c.statement}" has no source type`);
    if (!c.openableUrl && !c.whyNotOpenable) {
      throw new Error(`impact report: claim "${c.statement}" is neither openable nor explained`);
    }
  }
}

/** A report that lists no gaps is the one failure mode this ticket was written about. */
export function assertGapsAreStatedNotHidden(report: DayNinetyReport): void {
  const anyUnmeasured = report.learners.some((l) => l.movement.state !== 'measured');
  if (anyUnmeasured && report.learners.every((l) => l.gaps.length === 0)) {
    throw new Error('impact report: movement was unmeasurable for someone and no gap was recorded');
  }
  if (report.summary.learnersInPopulation === 0 && report.gaps.length === 0) {
    throw new Error('impact report: an empty population was returned without explaining why');
  }
}

function learnerGaps(input: {
  movement: MovementReading;
  assessments: Array<{ kind: string; reading: AssessmentReading }>;
  proficiencies: number[];
  reachedDayNinety: boolean;
  daysObserved: number;
  earliestClaimVersion: number | null;
}): string[] {
  const gaps: string[] = [];
  if (input.movement.state === 'no_baseline') {
    gaps.push('Baseline-to-exit movement cannot be stated: nothing in the platform measured this '
      + 'learner at intake, and no resume claim survives for them either. The placement score is '
      + 'not a substitute - it is recomputed from the current resume on every recompute.');
  } else if (input.movement.state === 'single_observation') {
    gaps.push('Baseline-to-exit movement cannot be stated: every piece of evidence for this '
      + 'learner carries a single observation date, so there is no second point to compare.');
  } else if (input.movement.state === 'claim_to_evidence') {
    gaps.push('The starting figure is what this learner CLAIMED on their resume, not something we '
      + 'measured. It sits beside verified evidence, so the two are different kinds of statement '
      + `and the difference between them is not an improvement figure.${
        input.earliestClaimVersion && input.earliestClaimVersion > 1
          ? ` Their earliest surviving claim is resume version ${input.earliestClaimVersion}, so it`
            + ' was recorded at a later upload rather than at intake.'
          : ''}`);
  }
  for (const a of input.assessments) {
    if (a.reading.state === 'not_graded') {
      gaps.push(`${a.kind} attempts cannot be reported as passed or failed: no pass threshold was `
        + 'ever set, so the stored pass flag is false regardless of score.');
    }
  }
  if (!scalesAreComparable(input.proficiencies)) {
    const bands = [...new Set(input.proficiencies.filter((p) => p > 0).map(scaleBandOf))];
    gaps.push(`Proficiency figures for this learner span ${bands.length} incompatible scales `
      + `(${bands.join(', ')}), so they are reported individually and never ranked or averaged.`);
  }
  if (!input.reachedDayNinety) {
    gaps.push(`This learner is ${input.daysObserved} days into the observation window, so a `
      + 'day-90 statement is premature; the figures below are current, not final.');
  }
  return gaps;
}

/**
 * Build the report.
 *
 * The policy guards run FIRST and throw. A report that cannot prove its own rules hold is
 * more dangerous than no report, because it will be forwarded to a customer.
 */
export async function buildDayNinetyReport(selector: PopulationSelector): Promise<DayNinetyReport> {
  assertImpactPolicyHolds();

  const population = await resolvePopulation(selector);
  const ids = population.enrollmentIds;
  const sponsor = selector.kind === 'sponsor' ? await readSponsorStanding(selector.sponsorId) : null;

  const [anchors, tallies, commits, assessments, standings, intakeClaims] = await Promise.all([
    readEnrollmentAnchors(ids),
    readEvidenceTallies(ids),
    readVerifiedCommits(ids),
    readAssessments(ids),
    readSkillStandings(ids),
    readIntakeClaims(ids),
  ]);

  const anchorBy = new Map(anchors.map((a) => [a.enrollmentId, a.enrolledAt]));
  const learners: LearnerImpact[] = ids.map((id) => {
    const myTallies = tallies.filter((t) => t.enrollmentId === id);
    const myCommits = commits.filter((c) => c.enrollmentId === id);
    const myStandings = standings.filter((s) => s.enrollmentId === id);

    const firstEvidenceAt = myTallies.reduce<string | null>(
      (acc, t) => (t.firstAt && (!acc || t.firstAt < acc) ? t.firstAt : acc), null);
    const lastEvidenceAt = myTallies.reduce<string | null>(
      (acc, t) => (t.lastAt && (!acc || t.lastAt > acc) ? t.lastAt : acc), null);
    const observationDays = myTallies.reduce((acc, t) => Math.max(acc, t.observationDays), 0);
    const daysObserved = daysBetween(firstEvidenceAt, lastEvidenceAt);

    const claims = buildCommitClaims(myCommits);
    for (const t of myTallies) {
      const klass = evidenceClassFor(t.sourceType);
      // github_commit is skipped here on purpose. Those 382 evidence_records rows describe
      // the same verified work as the 384 student_tasks rows, recorded by a second
      // subsystem, and counting both would inflate every learner's evidence by roughly
      // double. The student_tasks path is the one kept because it carries project_id,
      // which is what makes the commit resolvable at all.
      if (!klass || t.sourceType === 'github_commit') continue;
      claims.push({
        statement: `${t.records} ${klass.proves.toLowerCase()}`,
        sourceType: t.sourceType,
        sourceRef: null,
        openableUrl: null,
        whyNotOpenable: klass.openabilityNote,
        verifiedBy: null,
        verifiedAt: t.lastAt,
      });
    }
    assertNoClaimWithoutASource(claims);

    // The starting figure comes from the earliest surviving RESUME CLAIM, never from
    // placement_score. Placement is recomputed from the current resume on every
    // recompute, so using it would let a learner's starting point move after the fact -
    // and its only measured input, diagnostic_attempts, has never had a row written to
    // it. readBaseline() refuses placement outright; this is the other half of that.
    //
    // Highest claim rather than mean: a mean across skills the resume never mentioned
    // would drag a real claim down toward zeros that mean "not claimed".
    const myClaimRows = intakeClaims.filter((c) => c.enrollmentId === id);
    const earliestClaimVersion = myClaimRows.length > 0
      ? Math.min(...myClaimRows.map((c) => c.resumeVersion))
      : null;
    const myClaims = myClaimRows
      .map((c) => readBaseline({ source: 'intake_resume_claim', value: c.creditWeight }))
      .filter((b) => b.state === 'claimed');
    const baseline = myClaims.length > 0
      ? myClaims.reduce((a, b) => ((b.value ?? 0) > (a.value ?? 0) ? b : a))
      : readBaseline({ source: 'intake_resume_claim', value: null });
    const latest = myStandings.reduce<number | null>(
      (acc, s) => (s.proficiency !== null && (acc === null || s.proficiency > acc) ? s.proficiency : acc),
      null);
    const movement = readMovement({ baseline, latest, distinctObservationDays: observationDays });

    const myAssessments = assessments
      .filter((a) => a.enrollmentId === id)
      .map((a) => ({
        kind: a.kind,
        attempts: a.attempts,
        reading: readAssessment({ score: a.meanScore, passThreshold: a.threshold }),
      }));

    const reachedDayNinety = daysObserved >= DAY_NINETY;
    return {
      enrollmentId: id,
      enrolledAt: anchorBy.get(id) ?? null,
      firstEvidenceAt,
      lastEvidenceAt,
      daysObserved,
      reachedDayNinety,
      claims,
      verifiedCommits: myCommits.length,
      openableCommits: claims.filter((c) => c.openableUrl !== null).length,
      movement,
      assessments: myAssessments,
      earliestClaimVersion,
      gaps: learnerGaps({
        movement,
        assessments: myAssessments,
        proficiencies: myStandings.map((s) => s.proficiency ?? 0),
        reachedDayNinety,
        daysObserved,
        earliestClaimVersion,
      }),
    };
  });

  const gaps: string[] = [];
  if (ids.length === 0) {
    gaps.push(selector.kind === 'sponsor'
      ? `This sponsor has no participants to report on. Population source: ${population.note}.`
        + (sponsor ? ` ${sponsor.seatsPurchased} seats were purchased and ${sponsor.seatsMinted} `
          + 'have been minted.' : '')
      : `No learners resolved from this selector. Population source: ${population.note}.`);
  }
  if (learners.length > 0 && report0MeasuredMovement(learners)) {
    gaps.push('No learner here shows instrument-measured baseline-to-exit movement, and none can: '
      + 'nothing in the platform measures a learner at intake. The only starting figure available '
      + 'is what a learner claimed on a resume. Closing this needs an intake instrument, not a '
      + 'report change.');
  }
  if (learners.length > 0 && learners.every((l) => !l.reachedDayNinety)) {
    gaps.push('No learner in this population has yet accumulated 90 days of observed evidence, so '
      + 'this is an in-flight report rather than a day-90 report.');
  }

  const report: DayNinetyReport = {
    generatedAt: new Date().toISOString(),
    selector,
    populationNote: population.note,
    sponsor,
    learners,
    summary: {
      learnersInPopulation: ids.length,
      learnersWithAnyEvidence: learners.filter((l) => l.claims.length > 0).length,
      learnersPastDayNinety: learners.filter((l) => l.reachedDayNinety).length,
      totalClaims: learners.reduce((a, l) => a + l.claims.length, 0),
      openableClaims: learners.reduce((a, l) => a + l.openableCommits, 0),
      learnersWithMeasuredMovement: learners.filter((l) => l.movement.state === 'measured').length,
      learnersWithClaimToEvidence:
        learners.filter((l) => l.movement.state === 'claim_to_evidence').length,
    },
    gaps,
  };
  assertGapsAreStatedNotHidden(report);
  return report;
}
