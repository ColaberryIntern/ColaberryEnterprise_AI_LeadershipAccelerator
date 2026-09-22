/**
 * proposalIngest — turn an uploaded solicitation zip into the contract's REAL requirements, replacing the
 * UNASSESSED shell that "start" created. Deterministic (no LLM). In ONE transaction it: deletes the
 * `UNASSESSED` marker requirement, upserts the source-cited requirements the extractor found, flips the
 * tracks off `unassessed`, and attaches the extracted source blocks to each draft process document (the
 * decomposition stays EMPTY — turning requirements into a task graph is slice 3). Idempotent: re-uploading
 * re-derives and re-upserts by deterministic id. Safe while the doc is a draft (fork-on-edit only kicks in
 * at approval, and an unassessed contract cannot be approved).
 */
import { sequelize } from '../../../config/database';
import { factoryId } from '../factoryIds';
import { contentHash } from '../factoryApproval';
import { extractProposal, ExtractedBlock } from './proposalExtractor';

const TRACK_TYPES = ['proposal', 'solution_build'] as const;

function docJsonWithBlocks(blocks: ExtractedBlock[]) {
  return {
    processes: [], roles: [], tasks: [], assignments: [], transitions: [], allocation: [], role_map: [],
    source_blocks: blocks.map((b) => ({ id: b.id, locator: b.locator, text: b.text, kind: b.kind })),
  };
}

export interface IngestResult { requirements: number; blocks: number; fileName: string; }

export async function ingestProposal(deliveryProjectId: string, zipBuffer: Buffer, fileName: string): Promise<IngestResult> {
  const { blocks, requirements } = await extractProposal(zipBuffer);

  const { default: ContractTrack } = await import('../../../models/ContractTrack');
  const { default: ContractRequirement } = await import('../../../models/ContractRequirement');
  const { default: ContractProcessDocument } = await import('../../../models/ContractProcessDocument');

  const docJson = docJsonWithBlocks(blocks);

  await sequelize.transaction(async (transaction) => {
    // (a) retire the honest "not yet assessed" marker — the real requirements replace it.
    await ContractRequirement.destroy({
      where: { id: factoryId('contract_requirement', [deliveryProjectId, 'UNASSESSED']) }, transaction,
    });

    // (b) upsert the real, source-cited requirements (deterministic id -> idempotent re-upload).
    for (const r of requirements) {
      await ContractRequirement.upsert({
        id: factoryId('contract_requirement', [deliveryProjectId, r.canonicalReqId]),
        delivery_project_id: deliveryProjectId, canonical_req_id: r.canonicalReqId,
        statement: r.statement, kind: r.kind, priority: r.priority, tracks: r.tracks,
        source_document: r.sourceDocument, amendment_version: '', section: r.section,
        extracted_text: r.extractedText, interpretation: r.interpretation,
        human_confirmed: r.humanConfirmed, evidence_state: r.evidenceState, source_evidence: r.sourceEvidence,
      }, { transaction });
    }

    // (c) the tracks are no longer unassessed (they now carry real requirements).
    await ContractTrack.update({ status: 'in_progress' },
      { where: { delivery_project_id: deliveryProjectId, status: 'unassessed' }, transaction });

    // (d) attach the source blocks to each draft doc; decomposition stays empty (slice 3). Overwrite v1 in
    // place (safe while draft — fork-on-edit is an approval-time behavior).
    for (const trackType of TRACK_TYPES) {
      await ContractProcessDocument.upsert({
        id: factoryId('contract_process_document', [deliveryProjectId, trackType, '1']),
        delivery_project_id: deliveryProjectId, track_type: trackType, version: 1,
        doc_json: docJson, content_sha256: contentHash(`${deliveryProjectId}:${trackType}:1`, docJson),
        status: 'draft',
      }, { transaction });
    }
  });

  return { requirements: requirements.length, blocks: blocks.length, fileName };
}
