/**
 * Competency Engine — recomputes each domain's confidence for a student from
 * ALL their evidence (a full recompute, so it is inherently idempotent — no
 * increment to drift). Confidence uses the saturating curve in scoring.ts.
 */
import EvidenceRecord from '../../models/EvidenceRecord';
import StudentCompetency from '../../models/StudentCompetency';
import { computeConfidence } from './scoring';

export interface DomainConfidence { domain_id: string; confidence: number; evidence_count: number; }

export async function recomputeForEnrollment(enrollmentId: string): Promise<DomainConfidence[]> {
  const evidence = await EvidenceRecord.findAll({ where: { enrollment_id: enrollmentId, validated: true } });

  const weightByDomain = new Map<string, number>();
  const countByDomain = new Map<string, number>();
  const lastByDomain = new Map<string, Date>();

  for (const e of evidence) {
    const weights = (e.competency_weights || []) as Array<{ domain_id: string; weight: number }>;
    for (const w of weights) {
      if (!w || !w.domain_id) continue;
      weightByDomain.set(w.domain_id, (weightByDomain.get(w.domain_id) || 0) + (Number(w.weight) || 0));
      countByDomain.set(w.domain_id, (countByDomain.get(w.domain_id) || 0) + 1);
      const prev = lastByDomain.get(w.domain_id);
      if (!prev || e.created_at > prev) lastByDomain.set(w.domain_id, e.created_at);
    }
  }

  const out: DomainConfidence[] = [];
  for (const [domain, weight] of weightByDomain) {
    const confidence = computeConfidence(weight);
    const evidence_count = countByDomain.get(domain) || 0;
    const last_evidence_at = lastByDomain.get(domain) || null;
    out.push({ domain_id: domain, confidence, evidence_count });

    const [row, created] = await StudentCompetency.findOrCreate({
      where: { enrollment_id: enrollmentId, domain_id: domain },
      defaults: { enrollment_id: enrollmentId, domain_id: domain, confidence, evidence_count, last_evidence_at },
    });
    if (!created) {
      await row.update({ confidence, evidence_count, last_evidence_at });
    }
  }
  return out;
}

export async function getStudentCompetency(enrollmentId: string): Promise<StudentCompetency[]> {
  return StudentCompetency.findAll({ where: { enrollment_id: enrollmentId } });
}
