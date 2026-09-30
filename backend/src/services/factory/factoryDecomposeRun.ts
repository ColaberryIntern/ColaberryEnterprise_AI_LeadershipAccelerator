/**
 * factoryDecomposeRun — the "Generate decomposition" action (slice 3).
 *
 * Loads a gov contract's persisted requirements + tracks, runs the factory generation engine via the DARK
 * switch `factoryGenerateIfEnabled` (NEVER `factoryGenerate` directly), and — ONLY when the engine returns a
 * gate-clean result (`accepted === (factoryErrors === 0)`) — persists the task graph over the
 * `solution_build` draft document. A not-accepted result surfaces the gate issues and persists NOTHING
 * (never a fake pass); when the flag is off it reports `disabled` without a model call.
 *
 * Additive; overwrites the v1 draft `doc_json` in place (fork-on-edit is an approval-time behavior). The
 * row->typed mappers are inline (not imported from factoryRoutes) so this service does not create a circular
 * dependency with the routes module that imports it.
 */
import { sequelize } from '../../config/database';
import { factoryId } from './factoryIds';
import { contentHash } from './factoryApproval';
import { factoryGenerateIfEnabled, FACTORY_GENERATION_DISABLED } from './factoryGenerationEntry';
import type { ContractTrack, ContractRequirement, RequirementKind, RequirementPriority, EvidenceState } from './contracts/factoryContract';
import type { ValidationIssue } from './factoryValidate';

/** The generated decomposition lands on the solution_build track (the view/approve default). */
const GEN_TRACK = 'solution_build';

function toRequirement(r: any): ContractRequirement {
  return {
    id: r.canonical_req_id, // the traceability spine id, NOT the row UUID
    statement: r.statement ?? '',
    kind: (r.kind ?? 'technical') as RequirementKind,
    priority: (r.priority ?? 'must') as RequirementPriority,
    tracks: Array.isArray(r.tracks) ? r.tracks : [],
    source_document: r.source_document ?? '',
    amendment_version: r.amendment_version ?? '',
    section: r.section ?? '',
    extracted_text: r.extracted_text ?? '',
    interpretation: r.interpretation ?? null,
    human_confirmed: !!r.human_confirmed,
    evidence_state: (r.evidence_state ?? 'unassessed') as EvidenceState,
    source_evidence: Array.isArray(r.source_evidence) ? r.source_evidence : [],
  };
}
function toTrack(t: any): ContractTrack {
  return {
    id: t.id,
    delivery_project_id: t.delivery_project_id,
    track_type: t.track_type,
    status: t.status ?? '',
    owner_identity_id: t.owner_identity_id ?? null,
    solution_student_project_id: t.solution_student_project_id ?? null,
  };
}

/** Assemble the FactoryGenerateInput from the contract's persisted rows (requirements + tracks only). */
export async function loadFactoryGenerateInput(deliveryProjectId: string) {
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const { default: ContractRequirement } = await import('../../models/ContractRequirement');
  const [trackRows, reqRows] = await Promise.all([
    ContractTrack.findAll({ where: { delivery_project_id: deliveryProjectId } }),
    ContractRequirement.findAll({ where: { delivery_project_id: deliveryProjectId } }),
  ]);
  return {
    deliveryProjectId,
    requirements: (reqRows as any[]).map(toRequirement),
    tracks: (trackRows as any[]).map(toTrack),
  };
}

export type GenerateOutcome =
  | { status: 'disabled' }
  | { status: 'rejected'; errorCount: number; issues: ValidationIssue[] }
  | { status: 'generated'; errorCount: 0 };

/**
 * Run the generation engine on a contract's requirements. Persists the task graph ONLY when gate-clean;
 * otherwise surfaces the issues and writes nothing.
 */
export async function generateDecomposition(deliveryProjectId: string): Promise<GenerateOutcome> {
  const input = await loadFactoryGenerateInput(deliveryProjectId);
  const result = await factoryGenerateIfEnabled(input);

  if (result.issues.some((i) => i.code === FACTORY_GENERATION_DISABLED.code)) {
    return { status: 'disabled' };
  }
  if (!result.accepted) {
    return { status: 'rejected', errorCount: result.issues.length, issues: result.issues };
  }

  const p = result.project;
  const docJson = {
    processes: p.processes, roles: p.roles, tasks: p.tasks, assignments: p.assignments,
    transitions: p.transitions, allocation: p.allocation, role_map: p.role_map, source_blocks: p.source_blocks,
  };
  const { default: ContractProcessDocument } = await import('../../models/ContractProcessDocument');
  await sequelize.transaction(async (transaction) => {
    await ContractProcessDocument.upsert({
      id: factoryId('contract_process_document', [deliveryProjectId, GEN_TRACK, '1']),
      delivery_project_id: deliveryProjectId, track_type: GEN_TRACK, version: 1,
      doc_json: docJson, content_sha256: contentHash(`${deliveryProjectId}:${GEN_TRACK}:1`, docJson),
      status: 'draft',
    }, { transaction });
  });
  return { status: 'generated', errorCount: 0 };
}
