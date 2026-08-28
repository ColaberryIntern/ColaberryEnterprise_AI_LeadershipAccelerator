/**
 * caseStudyReadinessService — spec §13's readiness engine. T010.
 *
 * ADVISORY, NOT AUTHORISING. This module answers "how complete is this record?"
 * It does not authorise publication and must never be read as doing so. A score
 * of 100 grants nothing: `caseStudyPublicationService` (T012) is the only
 * authority on whether a Case Study may be published, it fails closed, and it
 * re-checks consent and evidence itself. Nothing exported here is named for a
 * decision, returns a boolean verdict, or can be dropped into an `if` and
 * mistaken for the publish gate — `caseStudyReadinessService.test.ts` asserts
 * that against the export list and against the report's own field types, so a
 * future `isPublishable` helper added here fails the suite rather than quietly
 * becoming a second gate that disagrees with the first.
 *
 * PURE. No clock, no randomness, no I/O, no database, no network, no logging.
 * Same input ⇒ same report, byte for byte, proven by a test that scores the
 * same record at two different mocked system times. Two consequences worth
 * stating: (a) there is no log line here that could carry a student email, an
 * enrollment id or a private repository identity — the strongest form of the
 * repo's redaction rule rather than an application of it; (b) the admin UI may
 * recompute a score on every keystroke at no cost and with no side effect.
 *
 * THE RUBRIC IS SPEC §13, VERBATIM (the table lives in
 * `caseStudyReadinessRubric.ts`, which this file imports and re-exports):
 *
 *     Identity               10      Evidence               20
 *     Technical facts        15      Outcome/proof point    15
 *     Story completeness     15      Consent/privacy        10
 *     Artifacts/media        10      Publication setup       5      = 100
 *
 * NO BUSINESS ROI NUMBER IS REQUIRED, ANYWHERE. Spec §13: "A Case Study does not
 * need a business ROI number to be valid. A repo/platform-verified technical
 * proof point is acceptable." Not one check reads `metricType`, so a record
 * whose only proof point is `class: verified, method: repo` reaches a full 100.
 * That is deliberate and load-bearing: spec §22 forbids manufacturing a number
 * to fill a card, and a rubric that could not score such a record without a
 * business metric would create exactly the pressure to invent one. The suite
 * pins it by flipping a metric's `metricType` and asserting the score does not
 * move.
 *
 * GAPS, NOT A NUMBER. `{ score: 47 }` tells an admin nothing. Every point not
 * awarded produces a named gap carrying its category, the points lost, what is
 * missing and what would close it, so the readiness panel reads as a worklist.
 *
 * FAILURE-FIRST. (1) An absent or non-object `content` throws
 * `CaseStudyReadinessError('ValidationError')` — a contract violation, not a low
 * score. (2) Everything else missing, empty or malformed scores zero and reports
 * a gap: an incomplete record is this module's subject matter, so throwing on
 * one would be the defect. (3) No retry — it is CPU-only and pure, so a retry
 * returns the same answer. (4) Recovery: the admin closes the named gaps.
 * (5) Not handled: content large enough to make array traversal slow, bounded
 * upstream by the analyzer's excerpt caps and the manifest reader's 64KB limit.
 */
import {
  CASE_STUDY_READINESS_ADVISORY,
  CASE_STUDY_READINESS_BAND_FLOORS,
  CASE_STUDY_READINESS_CATEGORIES,
  CASE_STUDY_READINESS_CATEGORY_LABELS,
  CASE_STUDY_READINESS_CHECKS,
  CASE_STUDY_READINESS_MAX_SCORE,
  CASE_STUDY_READINESS_WEIGHTS,
  buildReadinessContext,
  clampAward,
} from './caseStudyReadinessRubric';
import type {
  CaseStudyReadinessBand,
  CaseStudyReadinessCategory,
  CaseStudyReadinessInput,
} from './caseStudyReadinessRubric';

/**
 * One import site for consumers and for the suite. The rubric is a separate
 * FILE for the line ceiling, not a separate CONCEPT, so callers should never
 * need to know it exists.
 */
export {
  CASE_STUDY_READINESS_ADVISORY,
  CASE_STUDY_READINESS_BAND_FLOORS,
  CASE_STUDY_READINESS_CATEGORIES,
  CASE_STUDY_READINESS_CATEGORY_LABELS,
  CASE_STUDY_READINESS_CHECK_POINTS,
  CASE_STUDY_READINESS_MAX_SCORE,
  CASE_STUDY_READINESS_WEIGHTS,
} from './caseStudyReadinessRubric';
export type {
  CaseStudyReadinessBand,
  CaseStudyReadinessCategory,
  CaseStudyReadinessInput,
  CaseStudyReadinessPublicationSetup,
} from './caseStudyReadinessRubric';

/* ─────────────────────────────────────────────────────────────── errors ──── */

export type CaseStudyReadinessErrorClass = 'ValidationError';

export class CaseStudyReadinessError extends Error {
  public readonly error_class: CaseStudyReadinessErrorClass;
  public readonly http_status: number;

  constructor(error_class: CaseStudyReadinessErrorClass, message: string) {
    super(message);
    this.name = 'CaseStudyReadinessError';
    this.error_class = error_class;
    this.http_status = 400;
  }
}

export function isCaseStudyReadinessError(err: unknown): err is CaseStudyReadinessError {
  return err instanceof CaseStudyReadinessError;
}

/* ──────────────────────────────────────────────────────────── the report ──── */

/**
 * One thing that is not yet true, and what to do about it. AC4: a gap names its
 * category, the points it costs, and the action that closes it — the difference
 * between a worklist and a verdict.
 */
export interface CaseStudyReadinessGap {
  readonly category: CaseStudyReadinessCategory;
  readonly categoryLabel: string;
  /** Stable identifier (`evidence.headline_linked`) for UI anchors and tests. */
  readonly checkKey: string;
  readonly pointsLost: number;
  readonly pointsPossible: number;
  /** What is missing. */
  readonly detail: string;
  /** What would close it. */
  readonly remedy: string;
}

export interface CaseStudyReadinessCategoryScore {
  readonly category: CaseStudyReadinessCategory;
  readonly label: string;
  readonly weight: number;
  readonly awarded: number;
  /** `Evidence: 6/20` — the line the admin panel renders above its gap list. */
  readonly summary: string;
  readonly gaps: readonly CaseStudyReadinessGap[];
}

/**
 * Deliberately carries no boolean and no field a caller could read as
 * permission. `band` is descriptive (`thin` / `developing` / `substantial`) and
 * `advisory` restates, in the payload itself, that this is not a publish
 * decision — an admin API response repeats it to whoever renders the panel.
 */
export interface CaseStudyReadinessReport {
  readonly score: number;
  readonly maxScore: number;
  readonly band: CaseStudyReadinessBand;
  readonly categories: readonly CaseStudyReadinessCategoryScore[];
  /** Every gap, in rubric order. Empty means every point was awarded. */
  readonly gaps: readonly CaseStudyReadinessGap[];
  readonly advisory: string;
}

/* ─────────────────────────────────────────────────────────────── scoring ──── */

function bandFor(score: number): CaseStudyReadinessBand {
  if (score >= CASE_STUDY_READINESS_BAND_FLOORS.substantial) return 'substantial';
  if (score >= CASE_STUDY_READINESS_BAND_FLOORS.developing) return 'developing';
  return 'thin';
}

/** `Evidence: -8 of 20 — <what is missing>. To close: <what would fix it>` */
export function formatCaseStudyReadinessGap(gap: CaseStudyReadinessGap): string {
  return `${gap.categoryLabel}: -${gap.pointsLost} of ${gap.pointsPossible} `
    + `— ${gap.detail}. To close: ${gap.remedy}`;
}

/**
 * Score one candidate against spec §13's rubric.
 *
 * Pure: the same input always produces the same report. The result describes
 * completeness only and authorises nothing — see this file's header.
 *
 * @throws CaseStudyReadinessError('ValidationError') when `content` is absent.
 */
export function scoreCaseStudyReadiness(input: CaseStudyReadinessInput): CaseStudyReadinessReport {
  if (!input || typeof input !== 'object' || !input.content || typeof input.content !== 'object') {
    throw new CaseStudyReadinessError('ValidationError', 'readiness requires snapshot content');
  }
  const ctx = buildReadinessContext(input);
  const awarded = new Map<CaseStudyReadinessCategory, number>(
    CASE_STUDY_READINESS_CATEGORIES.map((key) => [key, 0]),
  );
  const gapsByCategory = new Map<CaseStudyReadinessCategory, CaseStudyReadinessGap[]>(
    CASE_STUDY_READINESS_CATEGORIES.map((key) => [key, []]),
  );

  for (const check of CASE_STUDY_READINESS_CHECKS) {
    const points = clampAward(check.score(ctx), check.points);
    awarded.set(check.category, (awarded.get(check.category) ?? 0) + points);
    if (points < check.points) {
      gapsByCategory.get(check.category)?.push(Object.freeze({
        category: check.category,
        categoryLabel: CASE_STUDY_READINESS_CATEGORY_LABELS[check.category],
        checkKey: check.key,
        pointsLost: check.points - points,
        pointsPossible: check.points,
        detail: check.detail,
        remedy: check.remedy,
      }));
    }
  }

  const categories = CASE_STUDY_READINESS_CATEGORIES.map((category) => {
    const label = CASE_STUDY_READINESS_CATEGORY_LABELS[category];
    const weight = CASE_STUDY_READINESS_WEIGHTS[category];
    const got = awarded.get(category) ?? 0;
    return Object.freeze({
      category,
      label,
      weight,
      awarded: got,
      summary: `${label}: ${got}/${weight}`,
      gaps: Object.freeze(gapsByCategory.get(category) ?? []),
    });
  });
  const score = categories.reduce((total, c) => total + c.awarded, 0);

  return Object.freeze({
    score,
    maxScore: CASE_STUDY_READINESS_MAX_SCORE,
    band: bandFor(score),
    categories: Object.freeze(categories),
    gaps: Object.freeze(categories.flatMap((c) => c.gaps)),
    advisory: CASE_STUDY_READINESS_ADVISORY,
  });
}
