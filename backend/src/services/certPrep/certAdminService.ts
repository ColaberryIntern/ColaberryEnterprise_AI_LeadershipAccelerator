import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import CertQuestion from '../../models/CertQuestion';
import CertQuestionRevision from '../../models/CertQuestionRevision';
import CertReadinessSnapshot from '../../models/CertReadinessSnapshot';

/**
 * certAdminService — what an instructor needs to run Cert Prep for a cohort.
 *
 * Two jobs, and they are different in kind. One is OPERATIONAL: who has not
 * started, where the cohort is weak, which evidence is waiting on a decision.
 * The other is QUALITY CONTROL on the bank itself: which questions everybody
 * gets right (too easy to be worth asking), which nobody gets right (usually
 * miskeyed rather than hard), and which distractors nobody ever picks.
 *
 * THE ITEM STATISTICS ARE THE POINT. A question bank that is never measured
 * decays quietly: a miskeyed item marks competent students wrong forever and
 * looks exactly like a hard question. The three signals below are how
 * certification bodies actually find those, and they are cheap once responses
 * exist:
 *
 *   - p-value (proportion correct). Above ~0.9 the item is not discriminating;
 *     below ~0.25 it is usually broken rather than difficult.
 *   - discrimination. Do students who score well overall do BETTER on this item?
 *     If the strongest students underperform on it, the key is probably wrong —
 *     that is the classic signature and it cannot be seen any other way.
 *   - dead distractors. An option nobody selects is not doing any work.
 *
 * Nothing here mutates a question. It reports; a human decides.
 */

export interface CohortReadinessRow {
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  overall_state: string;
  overall_scaled: number | null;
  knowledge_scaled: number | null;
  sample_confidence: number | null;
  evidence_coverage_pct: number | null;
  answered_total: number;
  computed_at: Date | null;
}

/**
 * Latest readiness snapshot per student in a cohort, including students who have
 * never been measured.
 *
 * A LEFT JOIN, deliberately. The students who matter most to an instructor are
 * the ones with no snapshot at all — an INNER JOIN would hide exactly the people
 * who have not started, which is the first question anyone asks.
 */
export async function getCohortReadiness(cohortId: string): Promise<CohortReadinessRow[]> {
  return sequelize.query<CohortReadinessRow>(
    `SELECT e.id::text            AS enrollment_id,
            e.full_name,
            e.email,
            COALESCE(s.overall_state, 'not_measured') AS overall_state,
            s.overall_scaled,
            s.knowledge_scaled,
            s.sample_confidence,
            s.evidence_coverage_pct,
            COALESCE(r.answered, 0)::int AS answered_total,
            s.computed_at
       FROM enrollments e
       LEFT JOIN LATERAL (
            SELECT * FROM cert_readiness_snapshots cs
             WHERE cs.enrollment_id = e.id
             ORDER BY cs.computed_at DESC LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
            SELECT count(*) AS answered FROM cert_responses cr
             WHERE cr.enrollment_id = e.id AND cr.is_correct IS NOT NULL
       ) r ON true
      WHERE e.cohort_id = :cohortId
      ORDER BY s.overall_scaled DESC NULLS LAST, e.full_name`,
    { replacements: { cohortId }, type: QueryTypes.SELECT },
  );
}

export interface DomainWeakness {
  domain_id: string;
  answered: number;
  correct: number;
  pct: number;
  students: number;
}

/**
 * Where a cohort is weakest, aggregated across students.
 *
 * Reports the number of students behind each figure alongside it: a 40% domain
 * measured across two students is a different fact from one measured across
 * twenty, and a single number hides which it is.
 */
export async function getCohortDomainWeakness(cohortId: string): Promise<DomainWeakness[]> {
  return sequelize.query<DomainWeakness>(
    `SELECT cr.domain_id,
            count(*)::int                                        AS answered,
            count(*) FILTER (WHERE cr.is_correct)::int           AS correct,
            ROUND((count(*) FILTER (WHERE cr.is_correct))::numeric
                  / NULLIF(count(*), 0), 3)::float               AS pct,
            count(DISTINCT cr.enrollment_id)::int                AS students
       FROM cert_responses cr
       JOIN enrollments e ON e.id = cr.enrollment_id
      WHERE e.cohort_id = :cohortId AND cr.is_correct IS NOT NULL
      GROUP BY cr.domain_id
      ORDER BY pct ASC`,
    { replacements: { cohortId }, type: QueryTypes.SELECT },
  );
}

export interface ItemStatistic {
  question_key: string;
  revision: number;
  domain_id: string;
  difficulty: string;
  exposures: number;
  correct: number;
  /** Proportion correct. High = too easy; very low = usually miskeyed. */
  p_value: number;
  /** Do stronger students do better on this item? Negative implies a wrong key. */
  discrimination: number | null;
  flags: string[];
}

/** Below this, an item is more likely broken than hard. */
export const P_VALUE_BROKEN = 0.25;
/** Above this, an item is not telling us anything. */
export const P_VALUE_TOO_EASY = 0.9;
/** Fewer exposures than this and the statistics mean nothing yet. */
export const MIN_EXPOSURES_FOR_STATS = 8;

/**
 * Per-item statistics with flags a human can act on.
 *
 * Discrimination is computed as the difference in mean overall session score
 * between students who got the item right and those who got it wrong. A NEGATIVE
 * value means the strongest candidates are getting it wrong — which is what a
 * miskeyed answer looks like, and it is invisible to p-value alone.
 *
 * Items under MIN_EXPOSURES_FOR_STATS are returned with `discrimination: null`
 * and no flags rather than a confident-looking number computed from three
 * answers. Reporting a statistic that thin would be worse than reporting none.
 */
export async function getItemStatistics(blueprintVersion?: string): Promise<ItemStatistic[]> {
  const rows = await sequelize.query<any>(
    `WITH answered AS (
       SELECT cr.question_key, cr.question_revision, cr.domain_id, cr.is_correct,
              cs.scaled_score
         FROM cert_responses cr
         JOIN cert_sessions cs ON cs.id = cr.session_id
        WHERE cr.is_correct IS NOT NULL AND cs.scaled_score IS NOT NULL
     )
     SELECT a.question_key,
            a.question_revision                                   AS revision,
            a.domain_id,
            count(*)::int                                         AS exposures,
            count(*) FILTER (WHERE a.is_correct)::int             AS correct,
            AVG(a.scaled_score) FILTER (WHERE a.is_correct)       AS mean_when_right,
            AVG(a.scaled_score) FILTER (WHERE NOT a.is_correct)   AS mean_when_wrong
       FROM answered a
      GROUP BY a.question_key, a.question_revision, a.domain_id`,
    { type: QueryTypes.SELECT },
  );

  const revisions = await CertQuestionRevision.findAll({
    where: blueprintVersion ? { blueprint_version: blueprintVersion } : {},
    attributes: ['question_key', 'revision', 'difficulty', 'blueprint_version'],
  });
  const meta = new Map(revisions.map((r) => [`${r.question_key}#${r.revision}`, r]));

  const out: ItemStatistic[] = [];
  for (const row of rows) {
    const key = `${row.question_key}#${row.revision}`;
    const rev = meta.get(key);
    if (blueprintVersion && !rev) continue;

    const exposures = Number(row.exposures);
    const correct = Number(row.correct);
    const pValue = exposures > 0 ? correct / exposures : 0;

    let discrimination: number | null = null;
    const flags: string[] = [];

    if (exposures >= MIN_EXPOSURES_FOR_STATS) {
      const right = row.mean_when_right === null ? null : Number(row.mean_when_right);
      const wrong = row.mean_when_wrong === null ? null : Number(row.mean_when_wrong);
      if (right !== null && wrong !== null) discrimination = Math.round(right - wrong);

      if (pValue >= P_VALUE_TOO_EASY) flags.push('too_easy');
      if (pValue <= P_VALUE_BROKEN) flags.push('possibly_miskeyed_or_broken');
      if (discrimination !== null && discrimination < 0) flags.push('negative_discrimination');
    } else {
      flags.push('insufficient_exposures');
    }

    out.push({
      question_key: row.question_key,
      revision: Number(row.revision),
      domain_id: row.domain_id,
      difficulty: rev?.difficulty ?? 'unknown',
      exposures,
      correct,
      p_value: Number(pValue.toFixed(3)),
      discrimination,
      flags,
    });
  }

  // Worst signals first — a negative-discrimination item is the one to read today.
  return out.sort((a, b) => {
    const rank = (s: ItemStatistic) =>
      (s.flags.includes('negative_discrimination') ? 0 : 1) * 10 +
      (s.flags.includes('possibly_miskeyed_or_broken') ? 0 : 1);
    return rank(a) - rank(b) || a.p_value - b.p_value;
  });
}

export interface BankHealth {
  total_questions: number;
  by_status: Record<string, number>;
  approved_by_domain: Record<string, number>;
  /** Domains with no approved items — a form cannot be built for these. */
  domains_with_no_approved: string[];
}

/**
 * The bank's own state. `domains_with_no_approved` is the one that matters
 * operationally: a domain with nothing approved silently shortens every form,
 * which looks like a scoring quirk rather than a content gap.
 */
export async function getBankHealth(blueprintVersion: string, allDomainIds: string[]): Promise<BankHealth> {
  const revisions = await CertQuestionRevision.findAll({
    where: { blueprint_version: blueprintVersion },
    attributes: ['question_key', 'revision', 'domain_id', 'review_status'],
  });

  const byStatus: Record<string, number> = {};
  const approvedByDomain: Record<string, number> = {};
  for (const r of revisions) {
    byStatus[r.review_status] = (byStatus[r.review_status] ?? 0) + 1;
    if (r.review_status === 'approved') {
      approvedByDomain[r.domain_id] = (approvedByDomain[r.domain_id] ?? 0) + 1;
    }
  }

  const total = await CertQuestion.count();
  return {
    total_questions: total,
    by_status: byStatus,
    approved_by_domain: approvedByDomain,
    domains_with_no_approved: allDomainIds.filter((d) => !approvedByDomain[d]),
  };
}

/** Students past the fence who have never answered anything. */
export async function getNotStarted(cohortId: string): Promise<{ enrollment_id: string; full_name: string | null; email: string | null }[]> {
  return sequelize.query(
    `SELECT e.id::text AS enrollment_id, e.full_name, e.email
       FROM enrollments e
      WHERE e.cohort_id = :cohortId
        AND NOT EXISTS (SELECT 1 FROM cert_responses cr WHERE cr.enrollment_id = e.id)
      ORDER BY e.full_name`,
    { replacements: { cohortId }, type: QueryTypes.SELECT },
  ) as any;
}

/** Recent approvals and verifications — the audit trail, newest first. */
export async function getAuditTrail(limit = 50): Promise<any[]> {
  const approvals = await CertQuestionRevision.findAll({
    where: { reviewer: { [Op.ne]: null as any }, reviewed_at: { [Op.ne]: null as any } },
    attributes: ['question_key', 'revision', 'review_status', 'reviewer', 'reviewed_at'],
    order: [['reviewed_at', 'DESC']],
    limit,
  });
  return approvals.map((a) => ({
    kind: 'question_review',
    question_key: a.question_key,
    revision: a.revision,
    status: a.review_status,
    actor: a.reviewer,
    at: a.reviewed_at,
  }));
}

/** Readiness over time for one student — the instructor's progress view. */
export async function getReadinessHistory(enrollmentId: string, limit = 30): Promise<CertReadinessSnapshot[]> {
  return CertReadinessSnapshot.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['computed_at', 'DESC']],
    limit,
  });
}
