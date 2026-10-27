/**
 * C8.12 - the reads behind the day-90 impact report.
 *
 * Rules live in `impactEvidencePolicy`; this file only moves rows to and from Postgres,
 * the same split `broadcastPopulationService` uses.
 *
 * EVERY QUERY HERE IS SCOPED TO AN EXPLICIT ENROLLMENT LIST. The report is sponsor-facing,
 * so a query that quietly widened its own population would disclose one customer's
 * learners to another. There is no "all enrollments" path in this file by design.
 *
 * COMMIT EVIDENCE IS JOINED THROUGH THE PROJECT, NOT THE ENROLLMENT. Measured on
 * production 2026-10-26: the enrollment join leaves 236 of 383 commit rows ambiguous
 * because seven enrollments own between two and six github_connections; the project join
 * is unambiguous for all 384 verified tasks. See resolveCommitEvidence().
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export interface EvidenceTally {
  enrollmentId: string;
  sourceType: string;
  records: number;
  firstAt: string | null;
  lastAt: string | null;
  observationDays: number;
}

export interface VerifiedCommit {
  enrollmentId: string;
  projectId: string | null;
  taskTitle: string;
  storyId: string | null;
  verifiedRef: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  repoUrl: string | null;
}

export interface AssessmentRow {
  enrollmentId: string;
  kind: string;
  attempts: number;
  graded: number;
  meanScore: number | null;
  threshold: number | null;
  lastAt: string | null;
}

export interface SkillStanding {
  enrollmentId: string;
  skillId: string;
  placementScore: number | null;
  proficiency: number | null;
  evidenceCount: number;
  lastEvidenceAt: string | null;
}

export type PopulationSelector =
  | { kind: 'sponsor'; sponsorId: string }
  | { kind: 'cohort'; cohortId: string }
  | { kind: 'enrollments'; enrollmentIds: readonly string[] };

export interface ResolvedPopulation {
  enrollmentIds: string[];
  /** What the selector was supposed to yield, so an empty result can be explained. */
  note: string;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const maybeNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : new Date(v as string).toISOString();

/**
 * Turn a selector into an explicit enrollment list.
 *
 * The sponsor branch deliberately reads `sponsor_seats` rather than `sponsors.
 * seats_purchased`. Production holds one sponsor with seats_purchased = 25 and zero rows
 * in sponsor_seats, so trusting the purchased count would report twenty-five learners
 * who do not exist.
 */
export async function resolvePopulation(selector: PopulationSelector): Promise<ResolvedPopulation> {
  if (selector.kind === 'enrollments') {
    return {
      enrollmentIds: [...new Set(selector.enrollmentIds)],
      note: 'explicit enrollment list',
    };
  }

  if (selector.kind === 'sponsor') {
    const rows = await sequelize.query<{ assigned_enrollment_id: string }>(
      `SELECT DISTINCT assigned_enrollment_id
         FROM sponsor_seats
        WHERE sponsor_id = :id
          AND assigned_enrollment_id IS NOT NULL`,
      { replacements: { id: selector.sponsorId }, type: QueryTypes.SELECT },
    );
    return {
      enrollmentIds: rows.map((r) => r.assigned_enrollment_id),
      note: 'seats actually minted and assigned to this sponsor (sponsor_seats), not seats purchased',
    };
  }

  const rows = await sequelize.query<{ enrollment_id: string }>(
    `SELECT DISTINCT enrollment_id
       FROM cohort_memberships
      WHERE cohort_id = :id
        AND enrollment_id IS NOT NULL`,
    { replacements: { id: selector.cohortId }, type: QueryTypes.SELECT },
  );
  return { enrollmentIds: rows.map((r) => r.enrollment_id), note: 'cohort_memberships for this cohort' };
}

/**
 * Validated evidence, tallied per learner per source type.
 *
 * `validated` is in the WHERE clause even though all 1,100 production rows carry true.
 * The column is the contract; relying on today's distribution would make the query wrong
 * the first time an unvalidated row is written.
 */
export async function readEvidenceTallies(enrollmentIds: readonly string[]): Promise<EvidenceTally[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT enrollment_id,
            source_type,
            COUNT(*)                                   AS records,
            MIN(created_at)                            AS first_at,
            MAX(created_at)                            AS last_at,
            COUNT(DISTINCT (created_at AT TIME ZONE 'America/Chicago')::date) AS observation_days
       FROM evidence_records
      WHERE validated = true
        AND enrollment_id IN (:ids)
      GROUP BY enrollment_id, source_type
      ORDER BY enrollment_id, source_type`,
    { replacements: { ids: enrollmentIds }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    enrollmentId: String(r.enrollment_id),
    sourceType: String(r.source_type),
    records: num(r.records),
    firstAt: iso(r.first_at),
    lastAt: iso(r.last_at),
    observationDays: num(r.observation_days),
  }));
}

/**
 * The verified build work, with the repository that makes each SHA openable.
 *
 * LEFT JOIN on github_connections, never INNER: a task whose repository was never
 * recorded must still appear in the report as verified-but-unlocatable. Dropping it would
 * quietly shrink the learner's evidence to only the parts we can link, which flatters us.
 */
export async function readVerifiedCommits(enrollmentIds: readonly string[]): Promise<VerifiedCommit[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT l.enrollment_id,
            t.project_id,
            t.title          AS task_title,
            t.story_id,
            t.verified_ref,
            t.verified_by,
            t.verified_at,
            gc.repo_url
       FROM student_tasks t
       JOIN student_task_lists l ON l.id = t.task_list_id
       LEFT JOIN LATERAL (
            SELECT c.repo_url
              FROM github_connections c
             WHERE c.project_id = t.project_id
               AND c.repo_url IS NOT NULL
             ORDER BY c.last_sync_at DESC NULLS LAST, c.created_at DESC
             LIMIT 1
       ) gc ON true
      WHERE t.verified_at IS NOT NULL
        AND l.enrollment_id IN (:ids)
      ORDER BY l.enrollment_id, t.verified_at`,
    { replacements: { ids: enrollmentIds }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    enrollmentId: String(r.enrollment_id),
    projectId: r.project_id ? String(r.project_id) : null,
    taskTitle: String(r.task_title ?? ''),
    storyId: r.story_id ? String(r.story_id) : null,
    verifiedRef: r.verified_ref ? String(r.verified_ref) : null,
    verifiedBy: r.verified_by ? String(r.verified_by) : null,
    verifiedAt: iso(r.verified_at),
    repoUrl: r.repo_url ? String(r.repo_url) : null,
  }));
}

/**
 * Assessment attempts, carrying the threshold so the caller can tell a failure from an
 * attempt that was never graded. MIN(pass_threshold) rather than a bare column because
 * the grouping is per kind; production has one threshold per kind (0.7 for evaluation,
 * null throughout for quiz), and a future second threshold would surface as a changed
 * value here rather than silently picking one.
 */
export async function readAssessments(enrollmentIds: readonly string[]): Promise<AssessmentRow[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT enrollment_id,
            kind,
            COUNT(*)                                         AS attempts,
            COUNT(pass_threshold)                            AS graded,
            AVG(score) FILTER (WHERE score IS NOT NULL)      AS mean_score,
            MIN(pass_threshold)                              AS threshold,
            MAX(created_at)                                  AS last_at
       FROM runtime_assessment_attempts
      WHERE enrollment_id IN (:ids)
      GROUP BY enrollment_id, kind
      ORDER BY enrollment_id, kind`,
    { replacements: { ids: enrollmentIds }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    enrollmentId: String(r.enrollment_id),
    kind: String(r.kind),
    attempts: num(r.attempts),
    graded: num(r.graded),
    meanScore: maybeNum(r.mean_score),
    threshold: maybeNum(r.threshold),
    lastAt: iso(r.last_at),
  }));
}

/**
 * Where each learner stands per architecture skill, with the raw placement score left
 * exactly as stored. Interpreting a zero is the policy layer's job, not this one's -
 * a read that quietly mapped 0 to null would hide the fact that the column is
 * zero-filled, which is itself one of the findings.
 */
export async function readSkillStandings(enrollmentIds: readonly string[]): Promise<SkillStanding[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT enrollment_id, skill_id, placement_score, proficiency, evidence_count, last_evidence_at
       FROM student_architecture_skill
      WHERE enrollment_id IN (:ids)
      ORDER BY enrollment_id, skill_id`,
    { replacements: { ids: enrollmentIds }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    enrollmentId: String(r.enrollment_id),
    skillId: String(r.skill_id),
    placementScore: maybeNum(r.placement_score),
    proficiency: maybeNum(r.proficiency),
    evidenceCount: num(r.evidence_count),
    lastEvidenceAt: iso(r.last_evidence_at),
  }));
}

export interface IntakeClaim {
  enrollmentId: string;
  skillId: string;
  resumeVersion: number;
  creditWeight: number | null;
  evidenceKind: string | null;
  claimedAt: string | null;
}

/**
 * The earliest surviving resume claim per learner per skill.
 *
 * This is the closest thing the platform has to a day-one record, and it is a CLAIM.
 * `resume_skill_claims` is insert-only and keyed by `resume_version`, so earlier
 * versions survive later uploads - which is exactly why this is usable where
 * `placement_score` is not: placement is recomputed from the CURRENT resume and moves
 * after the fact, whereas these rows do not.
 *
 * DISTINCT ON the lowest resume_version rather than MIN(created_at): a backfill could
 * give several versions the same timestamp, and the version number is the authoritative
 * ordering. Production holds nine version-1 rows across four enrollments and five
 * version-2 rows across three more, so for those three the earliest SURVIVING claim is
 * their second upload - the caller is given resumeVersion so it can say so.
 */
export async function readIntakeClaims(enrollmentIds: readonly string[]): Promise<IntakeClaim[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT DISTINCT ON (enrollment_id, skill_id)
            enrollment_id, skill_id, resume_version, credit_weight, evidence_kind, created_at
       FROM resume_skill_claims
      WHERE enrollment_id IN (:ids)
      ORDER BY enrollment_id, skill_id, resume_version ASC, created_at ASC`,
    { replacements: { ids: enrollmentIds }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    enrollmentId: String(r.enrollment_id),
    skillId: String(r.skill_id),
    resumeVersion: num(r.resume_version),
    creditWeight: maybeNum(r.credit_weight),
    evidenceKind: r.evidence_kind ? String(r.evidence_kind) : null,
    claimedAt: iso(r.created_at),
  }));
}

export interface EnrollmentAnchor {
  enrollmentId: string;
  /** When the enrollment ROW was created. Not necessarily the day the learner started. */
  enrolledAt: string | null;
}

/**
 * The enrollment anchor date.
 *
 * Deliberately named `enrolledAt` and documented as the row's creation timestamp rather
 * than "day one". The repo has no recorded program start per learner, and labelling a
 * row-creation timestamp as day one would put a number in a customer document that
 * nobody has verified means what it says.
 */
export async function readEnrollmentAnchors(
  enrollmentIds: readonly string[],
): Promise<EnrollmentAnchor[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT id, created_at FROM enrollments WHERE id IN (:ids)`,
    { replacements: { ids: enrollmentIds }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ enrollmentId: String(r.id), enrolledAt: iso(r.created_at) }));
}

export interface SponsorStanding {
  sponsorId: string;
  companyName: string;
  seatsPurchased: number;
  seatsMinted: number;
  seatsAssigned: number;
  hasPortalToken: boolean;
}

/** The sponsor's own standing, so the report can explain an empty population. */
export async function readSponsorStanding(sponsorId: string): Promise<SponsorStanding | null> {
  const rows = await sequelize.query<Record<string, unknown>>(
    `SELECT s.id,
            s.company_name,
            s.seats_purchased,
            (s.portal_token IS NOT NULL)                                      AS has_token,
            (SELECT COUNT(*) FROM sponsor_seats ss WHERE ss.sponsor_id = s.id) AS seats_minted,
            (SELECT COUNT(*) FROM sponsor_seats ss
              WHERE ss.sponsor_id = s.id AND ss.assigned_enrollment_id IS NOT NULL) AS seats_assigned
       FROM sponsors s
      WHERE s.id = :id`,
    { replacements: { id: sponsorId }, type: QueryTypes.SELECT },
  );
  const r = rows[0];
  if (!r) return null;
  return {
    sponsorId: String(r.id),
    companyName: String(r.company_name ?? ''),
    seatsPurchased: num(r.seats_purchased),
    seatsMinted: num(r.seats_minted),
    seatsAssigned: num(r.seats_assigned),
    hasPortalToken: r.has_token === true,
  };
}
