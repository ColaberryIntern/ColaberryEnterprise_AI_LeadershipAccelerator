import CertReadinessSnapshot from '../../models/CertReadinessSnapshot';
import { CertReadinessValue, SnapshotField } from './types';

/**
 * Reads the most recent PERSISTED snapshot — never triggers a live
 * computeReadiness() call, which per certReadinessService.ts's own design
 * is meant to fire on a real practice-exam completion, not be invoked
 * speculatively by an evidence-assembly read. `weights_available:false` is
 * a first-class real state (the model's own header: "a coverage estimate,
 * not an exam-weighted one") — surfaced honestly via `weightsAvailable`,
 * never hidden or upgraded to false confidence.
 */
export async function getCertReadinessField(enrollmentId: string): Promise<SnapshotField<CertReadinessValue>> {
  const latest = await CertReadinessSnapshot.findOne({
    where: { enrollment_id: enrollmentId },
    order: [['computed_at', 'DESC']],
  });

  if (!latest) {
    return {
      value: null,
      status: 'unknown',
      sourceSystem: 'cert_readiness_snapshots',
      sourceRecordIds: [],
      observedAt: null,
      freshnessPolicy: 'real-time-snapshot-on-practice-exam-completion',
      reliabilityState: 'healthy',
      reliabilityReason: 'No practice-exam session completed yet — no snapshot exists.',
    };
  }

  const l: any = latest;
  return {
    value: {
      overallState: l.overall_state,
      overallScaled: l.overall_scaled,
      knowledgeScaled: l.knowledge_scaled,
      evidenceCoveragePct: l.evidence_coverage_pct,
      weightsAvailable: l.weights_available,
    },
    status: 'known',
    sourceSystem: 'cert_readiness_snapshots',
    sourceRecordIds: [l.id],
    observedAt: l.computed_at,
    freshnessPolicy: 'real-time-snapshot-on-practice-exam-completion',
    reliabilityState: 'healthy',
  };
}
