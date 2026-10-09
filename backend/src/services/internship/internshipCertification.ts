/**
 * internshipCertification — the intern's certification picture, headline only.
 *
 * ── WHY A SUMMARY, NOT A REBUILD ────────────────────────────────────────────
 *
 * The full cert-prep experience (practice, mock exams, per-domain map, evidence)
 * already lives at /portal/cert-prep. This does NOT duplicate it; it surfaces the
 * two headline signals an intern wants on their dashboard and links out for the
 * rest.
 *
 * ── THE TWO SIGNALS, KEPT SEPARATE ─────────────────────────────────────────
 *
 * They are different things and the code keeps them in different shapes so a UI
 * cannot accidentally merge them:
 *
 *   1. Practice READINESS — a Colaberry estimate from practice sittings, on a
 *      100-1000 scale. It is NOT an Anthropic exam score, and when
 *      `weights_available` is false it is a coverage estimate, not exam-weighted.
 *      Read from the same snapshot the dashboard's readiness stat already uses, so
 *      the two never disagree.
 *
 *   2. The official CLAIM — a certificate the student says they earned, uploaded
 *      and then approved by a named staff member. "Verified" here means exactly
 *      that: a human approved the upload. There is no external/automated verifier,
 *      and nothing here reads the practice readiness to decide it.
 *
 * Practice is never summed with the official claim; they are separate fields.
 */
import { getCertReadinessField } from '../studentSuccessSnapshot/certReadinessSource';
import StudentCertification, { StudentCertificationStatus } from '../../models/StudentCertification';
import CertSession, { CertSessionMode } from '../../models/CertSession';
import { PASSING_SCALED } from '../certPrep/certScoring';
import { env } from '../../config/env';

export interface InternCertReadiness {
  /** not_measured | building | approaching | sustained. */
  state: string;
  /** Blended headline estimate (100-1000). A Colaberry estimate, never an Anthropic score. */
  overall_scaled: number | null;
  /** Practice-performance component of the estimate. */
  knowledge_scaled: number | null;
  /** % of blueprint objectives with verified evidence. */
  evidence_coverage_pct: number | null;
  /** When false, the estimate is a coverage figure, not exam-weighted — caption it. */
  weights_available: boolean;
  computed_at: string | null;
}

export interface InternOfficialCert {
  /** 'none' when the student has not claimed a certificate yet. */
  status: 'none' | 'pending' | 'approved' | 'rejected';
  /** The date the student says they passed (self-reported). */
  passed_on: string | null;
  submitted_at: string | null;
  /** When a named staff member approved or rejected it. */
  reviewed_at: string | null;
}

export interface InternCertification {
  readiness: InternCertReadiness;
  official: InternOfficialCert;
}

const NOT_MEASURED: InternCertReadiness = {
  state: 'not_measured',
  overall_scaled: null,
  knowledge_scaled: null,
  evidence_coverage_pct: null,
  weights_available: false,
  computed_at: null,
};

const toIso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : String(d);

const ms = (d: Date | string | null | undefined): number => {
  if (d == null) return 0;
  const t = d instanceof Date ? d.getTime() : Date.parse(String(d));
  return Number.isNaN(t) ? 0 : t;
};

interface OfficialRow {
  status: StudentCertificationStatus;
  passed_on: string | null;
  submitted_at: Date | string | null;
  reviewed_at: Date | string | null;
}

/**
 * Pick the claim to show from all of a student's rows. An approved claim wins (it
 * is the strongest true statement); otherwise the most recently submitted. Pure,
 * so the precedence is tested without a database.
 */
export function summarizeOfficialClaim(rows: readonly OfficialRow[]): InternOfficialCert {
  if (!rows.length) {
    return { status: 'none', passed_on: null, submitted_at: null, reviewed_at: null };
  }
  const approved = rows.find((r) => r.status === 'approved');
  const chosen = approved ?? [...rows].sort((a, b) => ms(b.submitted_at) - ms(a.submitted_at))[0];
  return {
    status: chosen.status,
    passed_on: chosen.passed_on ?? null,
    submitted_at: toIso(chosen.submitted_at),
    reviewed_at: toIso(chosen.reviewed_at),
  };
}

/**
 * The intern's certification headline. Owner-scoped by enrollment; returns the
 * not-measured / no-claim state (not an error) for an intern who has neither yet.
 */
export async function internCertification(enrollmentId: string): Promise<InternCertification> {
  if (!enrollmentId) return { readiness: NOT_MEASURED, official: summarizeOfficialClaim([]) };

  const [certField, claims] = await Promise.all([
    getCertReadinessField(enrollmentId),
    StudentCertification.findAll({ where: { enrollment_id: enrollmentId } }),
  ]);

  const cv = (certField as any).value;
  const readiness: InternCertReadiness = cv
    ? {
      state: cv.overallState ?? 'not_measured',
      overall_scaled: cv.overallScaled ?? null,
      knowledge_scaled: cv.knowledgeScaled ?? null,
      evidence_coverage_pct: cv.evidenceCoveragePct ?? null,
      weights_available: !!cv.weightsAvailable,
      computed_at: (certField as any).observedAt ?? null,
    }
    : NOT_MEASURED;

  return { readiness, official: summarizeOfficialClaim(claims as unknown as OfficialRow[]) };
}

/**
 * -- THE PRACTICE-SCORE SERIES BEHIND THE CONSOLE'S TREND LINE -----------------------------
 *
 * `internCertification()` above answers "where does this intern stand". The console also draws
 * the shape of getting there, which needs the sittings themselves rather than a headline.
 *
 * Three decisions worth knowing:
 *
 *  1. **Only scored, completed sittings.** An abandoned or in-progress session has no
 *     `scaled_score`. Plotting it would either drop to the axis - drawing a collapse that never
 *     happened - or need a fabricated value. It is left out, and the series is therefore shorter
 *     than the intern's session count. That is correct, not missing data.
 *
 *  2. **The ordering is done HERE, not only in the ORDER BY.** The SQL clause orders what the
 *     database returns; this sort is what makes oldest-first a property of the function. Without
 *     it, a test against a mocked model would only be asserting its own fixture order back at
 *     itself, and the guarantee would be unfalsifiable.
 *
 *  3. **Keyed on `enrollment_id` alone, exactly like `internCertification()`.** No `track_id`
 *     filter and no comparison against the official claim's `track`. The practice blueprint says
 *     `ccar-f` and the official enum says `cca_f`; they do not join, and a filter that assumed
 *     they did would silently return an empty series for everyone.
 */
export interface CertAttempt {
  readonly completed_at: string;
  readonly mode: CertSessionMode;
  readonly scaled_score: number;
  /**
   * How many items the sitting was scored on, and how many were right.
   *
   * Carried because the scaled score alone is not interpretable. In production the practice sets
   * are 1, 10, 15 and 60 items, and there are 1-item sittings scoring 1000 — the top of the scale
   * — sitting in the same series as a 60-item mock exam scoring 895. Plotting those as comparable
   * points, or worse averaging them into a "best score", states something the data cannot support.
   * So every point carries its own denominator and no aggregate is offered anywhere.
   */
  readonly items: number | null;
  readonly correct: number | null;
}

export interface CertAttemptSeries {
  /** Oldest first, so the series reads left to right as time. */
  readonly attempts: CertAttempt[];
  /**
   * The line the chart draws across the series.
   *
   * Taken from `PASSING_SCALED` - the constant the scoring engine itself uses to decide a pass -
   * rather than from the blueprint row, so the line cannot disagree with how these very scores
   * were computed. The blueprint carries the same 720, and the tests assert the two agree, so a
   * future divergence fails loudly instead of quietly drawing the wrong line.
   */
  readonly passing_scaled_score: number;
}

/** The shape of the `cert_sessions` row this reads. Exported so the fold is testable. */
export interface CertSessionRow {
  mode: CertSessionMode;
  completed_at: Date | string | null;
  scaled_score: number | null;
  correct_count?: number | null;
  total_count?: number | null;
}

/** Pure fold: drop the unscored, order by time, normalise the timestamp. */
export function toCertAttempts(rows: readonly CertSessionRow[]): CertAttempt[] {
  return rows
    .filter((r) => r.completed_at != null && typeof r.scaled_score === 'number')
    .map((r) => ({
      completed_at: new Date(r.completed_at as Date | string).toISOString(),
      mode: r.mode,
      scaled_score: r.scaled_score as number,
      // Null rather than 0 when a row does not record them: "we do not know how many items" and
      // "it was scored on none" are different, and 0 would read as a denominator of zero.
      items: typeof r.total_count === 'number' ? r.total_count : null,
      correct: typeof r.correct_count === 'number' ? r.correct_count : null,
    }))
    .sort((a, b) => (a.completed_at < b.completed_at ? -1 : a.completed_at > b.completed_at ? 1 : 0));
}

/**
 * This intern's practice-score series.
 *
 * Degrades to an empty series when cert prep is switched off rather than throwing: the console
 * renders every other panel for an intern whose certification track is not enabled yet, and a
 * thrown error here would blank the whole page over a feature flag.
 */
export async function certAttempts(enrollmentId: string): Promise<CertAttemptSeries> {
  const empty: CertAttemptSeries = { attempts: [], passing_scaled_score: PASSING_SCALED };
  if (!enrollmentId || !env.certPrepEnabled) return empty;

  const rows = await CertSession.findAll({
    where: { enrollment_id: enrollmentId, status: 'completed' },
    attributes: ['mode', 'completed_at', 'scaled_score', 'correct_count', 'total_count'],
    order: [['completed_at', 'ASC']],
  });

  return {
    attempts: toCertAttempts(rows as unknown as CertSessionRow[]),
    passing_scaled_score: PASSING_SCALED,
  };
}
