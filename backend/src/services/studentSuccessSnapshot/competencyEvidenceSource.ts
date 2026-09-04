import StudentCompetency from '../../models/StudentCompetency';
import CompetencyDomain from '../../models/CompetencyDomain';
import { CompetencyEvidenceValue, SnapshotField } from './types';

/**
 * StudentCompetency.confidence is RECOMPUTED (not incremented) from
 * validated EvidenceRecord rows per its own header comment — a real,
 * already-idempotent aggregate, not something this source re-derives.
 * Domain names resolved via a single batch lookup rather than N+1 queries.
 */
export async function getCompetencyEvidenceField(enrollmentId: string): Promise<SnapshotField<CompetencyEvidenceValue>> {
  const rows = await StudentCompetency.findAll({ where: { enrollment_id: enrollmentId } });

  if (rows.length === 0) {
    return {
      value: { domains: [] },
      status: 'known',
      sourceSystem: 'student_competency',
      sourceRecordIds: [],
      observedAt: new Date(),
      freshnessPolicy: 'real-time-on-card-completion',
      reliabilityState: 'healthy',
    };
  }

  const domainIds = Array.from(new Set(rows.map((r: any) => r.domain_id)));
  const domains = await CompetencyDomain.findAll({ where: { domain_id: domainIds } as any });
  const nameByDomainId = new Map(domains.map((d: any) => [d.domain_id, d.name]));

  return {
    value: {
      domains: rows.map((r: any) => ({
        domainId: r.domain_id,
        domainName: nameByDomainId.get(r.domain_id) ?? r.domain_id,
        confidence: r.confidence,
        evidenceCount: r.evidence_count,
      })),
    },
    status: 'known',
    sourceSystem: 'student_competency',
    sourceRecordIds: rows.map((r: any) => r.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time-on-card-completion',
    reliabilityState: 'healthy',
  };
}
