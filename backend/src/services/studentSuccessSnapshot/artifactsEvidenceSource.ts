import EvidenceRecord from '../../models/EvidenceRecord';
import { ArtifactsEvidenceValue, SnapshotField } from './types';

/**
 * The raw evidence ledger competencyEngine.ts's recomputeForEnrollment()
 * reads to produce StudentCompetency's computed confidence — a different,
 * complementary lens from competencyEvidenceSource.ts (that one surfaces
 * the computed aggregate; this one surfaces the real underlying items and
 * their real source breakdown, e.g. how many came from a validated GitHub
 * commit vs. an instructor review).
 */
export async function getArtifactsEvidenceField(enrollmentId: string): Promise<SnapshotField<ArtifactsEvidenceValue>> {
  const rows = await EvidenceRecord.findAll({ where: { enrollment_id: enrollmentId, validated: true } });

  const bySource: Record<string, number> = {};
  for (const r of rows as any[]) {
    bySource[r.source_type] = (bySource[r.source_type] || 0) + 1;
  }

  return {
    value: { totalValidated: rows.length, bySourceType: bySource },
    status: 'known',
    sourceSystem: 'evidence_records',
    sourceRecordIds: rows.map((r: any) => r.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time-on-card-completion',
    reliabilityState: 'healthy',
  };
}
