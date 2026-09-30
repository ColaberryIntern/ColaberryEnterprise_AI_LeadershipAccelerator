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
