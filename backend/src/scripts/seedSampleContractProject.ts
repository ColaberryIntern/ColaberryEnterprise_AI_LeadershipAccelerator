/**
 * seedSampleContractProject — persist the Phase-1 sample contract's FACTORY layer (tracks,
 * compliance requirements, and the versioned process document) onto a delivery project.
 *
 * Idempotent: every id is deterministic (factoryIds), so re-running upserts the same rows and
 * never duplicates. It does NOT create the `delivery_projects` parent — that row needs an
 * engagement and a tenant, which is delivery-domain integration. Pass an existing
 * delivery_projects.id; it defaults to the sample id for a dry description. The persistence is
 * exported as `persistSampleContract` so the Phase-4 demo seed (seedFactoryDemoContract) reuses it
 * against a real delivery project.
 *
 *   Usage (on prod, after the schema deploys):
 *     docker exec accelerator-backend node dist/scripts/seedSampleContractProject.js <delivery_project_id>
 */
import { buildSampleContractProject, SAMPLE_DELIVERY_PROJECT_ID } from '../services/factory/sample/sampleContractProject';
import { contentHash } from '../services/factory/factoryApproval';
import { factoryId } from '../services/factory/factoryIds';

/** Upsert the sample contract's factory layer onto a delivery project. Idempotent + reusable. */
export async function persistSampleContract(deliveryProjectId: string): Promise<{ tracks: number; requirements: number; process_documents: number }> {
  const sample = buildSampleContractProject();

  const { default: ContractTrack } = await import('../models/ContractTrack');
  const { default: ContractRequirement } = await import('../models/ContractRequirement');
  const { default: ContractProcessDocument } = await import('../models/ContractProcessDocument');

  // Tracks — upsert by the deterministic id.
  for (const t of sample.tracks) {
    await ContractTrack.upsert({
      id: t.id, delivery_project_id: deliveryProjectId, track_type: t.track_type,
      status: t.status, owner_identity_id: t.owner_identity_id, solution_student_project_id: t.solution_student_project_id,
    });
  }

  // Requirements — id is derived from (delivery, canonical_req_id) so re-runs are stable.
  for (const r of sample.requirements) {
    await ContractRequirement.upsert({
      id: factoryId('contract_requirement', [deliveryProjectId, r.id]),
      delivery_project_id: deliveryProjectId, canonical_req_id: r.id, statement: r.statement, kind: r.kind,
      priority: r.priority, tracks: r.tracks, source_document: r.source_document, amendment_version: r.amendment_version,
      section: r.section, extracted_text: r.extracted_text, interpretation: r.interpretation,
      human_confirmed: r.human_confirmed, evidence_state: r.evidence_state, source_evidence: r.source_evidence,
    });
  }

  // The decomposition document, one per track, version 1, content-hashed.
  const docJson = {
    processes: sample.processes, roles: sample.roles, tasks: sample.tasks,
    assignments: sample.assignments, transitions: sample.transitions,
    allocation: sample.allocation, role_map: sample.role_map, source_blocks: sample.source_blocks,
  };
  for (const trackType of ['proposal', 'solution_build']) {
    await ContractProcessDocument.upsert({
      id: factoryId('contract_process_document', [deliveryProjectId, trackType, '1']),
      delivery_project_id: deliveryProjectId, track_type: trackType, version: 1,
      doc_json: docJson, content_sha256: contentHash(`${deliveryProjectId}:${trackType}:1`, docJson),
      status: 'draft',
    });
  }

  return { tracks: sample.tracks.length, requirements: sample.requirements.length, process_documents: 2 };
}

async function main() {
  const deliveryProjectId = process.argv[2] || SAMPLE_DELIVERY_PROJECT_ID;
  const result = await persistSampleContract(deliveryProjectId);
  console.log(JSON.stringify({
    event: 'sample_contract_seeded', outcome: 'success', delivery_project_id: deliveryProjectId, ...result,
  }));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
}
