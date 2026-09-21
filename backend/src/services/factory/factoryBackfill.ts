/**
 * factoryBackfill — put an EXISTING delivery project onto the factory model, HONESTLY (Phase 6).
 *
 * For a delivery project with no factory decomposition, this writes an `unassessed` shell: the two
 * tracks, ONE explicit "not yet assessed" requirement marker, and a minimal `draft` process document
 * per track with an EMPTY decomposition. It FABRICATES NOTHING — no processes, tasks, assignments,
 * roles, or invented requirements. Everything unknown is stored as `unassessed` (a value, not a blank),
 * so the command center renders the project honestly and the gate CORRECTLY refuses to approve it (an
 * empty task graph fails the START/END structural checks). The one fact it will record if present — the
 * link to a student build — is read from `DeliveryProjectSourceLink`, never guessed.
 *
 * Idempotent (deterministic `factoryId`s → a re-run upserts the same rows) and atomic (one
 * transaction, so a mid-write failure leaves no partial shell). Reversible: deleting the parent
 * `delivery_projects` row cascades these away.
 */
import { sequelize } from '../../config/database';
import { factoryId } from './factoryIds';
import { contentHash } from './factoryApproval';

const TRACK_TYPES = ['proposal', 'solution_build'] as const;

/** The empty, honest decomposition a migrated shell carries — nothing invented. */
function emptyDecomposition() {
  return {
    processes: [], roles: [], tasks: [], assignments: [],
    transitions: [], allocation: [], role_map: [], source_blocks: [],
  };
}

export interface BackfillResult {
  tracks: number;
  requirements: number;
  process_documents: number;
  /** Set only when a real DeliveryProjectSourceLink exists — otherwise null (never invented). */
  solution_student_project_id: string | null;
}

/**
 * Backfill an `unassessed` factory shell onto a delivery project.
 * Idempotent, atomic, non-fabricating. Safe to run on a project that already has a shell (upserts).
 */
export async function backfillUnassessedContract(deliveryProjectId: string): Promise<BackfillResult> {
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const { default: ContractRequirement } = await import('../../models/ContractRequirement');
  const { default: ContractProcessDocument } = await import('../../models/ContractProcessDocument');
  const { default: DeliveryProjectSourceLink } = await import('../../models/DeliveryProjectSourceLink');

  // The student-build link is a FACT we either have or don't — never guessed.
  const link = await DeliveryProjectSourceLink.findOne({ where: { delivery_project_id: deliveryProjectId } });
  const solutionStudentProjectId = link ? link.student_project_id : null;

  const docJson = emptyDecomposition();

  await sequelize.transaction(async (transaction) => {
    for (const trackType of TRACK_TYPES) {
      await ContractTrack.upsert({
        id: factoryId('track', [deliveryProjectId, trackType]),
        delivery_project_id: deliveryProjectId,
        track_type: trackType,
        status: 'unassessed',
        owner_identity_id: null, // owner unknown on a migrated shell
        solution_student_project_id: trackType === 'solution_build' ? solutionStudentProjectId : null,
      }, { transaction });
    }

    // ONE explicit "not yet assessed" marker — a stored "don't know", NOT a fabricated requirement.
    await ContractRequirement.upsert({
      id: factoryId('contract_requirement', [deliveryProjectId, 'UNASSESSED']),
      delivery_project_id: deliveryProjectId,
      canonical_req_id: 'UNASSESSED',
      statement: 'This project has not been assessed against the factory model. Its requirements and process decomposition are unassessed.',
      kind: 'compliance',
      priority: 'must',
      tracks: ['proposal', 'solution_build'],
      source_document: '',
      amendment_version: '',
      section: '',
      extracted_text: '',
      interpretation: 'Migrated shell — evidence not yet established.',
      human_confirmed: false,
      evidence_state: 'unassessed',
      source_evidence: [],
    }, { transaction });

    for (const trackType of TRACK_TYPES) {
      await ContractProcessDocument.upsert({
        id: factoryId('contract_process_document', [deliveryProjectId, trackType, '1']),
        delivery_project_id: deliveryProjectId,
        track_type: trackType,
        version: 1,
        doc_json: docJson,
        content_sha256: contentHash(`${deliveryProjectId}:${trackType}:1`, docJson),
        status: 'draft',
      }, { transaction });
    }
  });

  return {
    tracks: TRACK_TYPES.length,
    requirements: 1,
    process_documents: TRACK_TYPES.length,
    solution_student_project_id: solutionStudentProjectId,
  };
}
