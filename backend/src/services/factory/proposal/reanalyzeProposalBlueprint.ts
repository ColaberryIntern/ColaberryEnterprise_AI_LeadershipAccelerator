/**
 * reanalyzeProposalBlueprint — the Proposal Studio P2 action: re-read the STORED solicitation ZIP for a delivery
 * project and write the NEXT blueprint version, then re-derive the document set from it and return a diff from the
 * previous blueprint. No re-upload: it resolves the project -> latest qualification -> stored source bundle, loads
 * the bytes, and runs the shipped extractor. A missing qualification or bundle is a typed `bundle_missing` error the
 * route turns into a 409 ("re-upload on the Solicitation step") — never a fabricated blueprint.
 *
 * Determinism + fail-soft: the blueprint itself is built by the PURE buildProposalBlueprint (no AI). Extraction and
 * persistence are the only I/O; a failure throws a typed BlueprintReanalysisError, never an unhandled rejection past
 * the route. Each run emits one structured JSON log line.
 */
import fs from 'fs/promises';
import GovQualification from '../../../models/GovQualification';
import GovProposalBlueprint from '../../../models/GovProposalBlueprint';
import ContractRequirement from '../../../models/ContractRequirement';
import { loadLatestGovSourceBundle } from './govSourceBundleStore';
import { extractProposal } from './proposalExtractor';
import { readGovProvenanceFacts } from '../govCockpit';
import { buildProposalBlueprint } from './buildProposalBlueprint';
import { deriveProposalDocuments } from './govProposalDocuments';
import { syncProposalDocuments, reconcileSupersededFormDocuments } from './govProposalDocumentStore';
import { diffBlueprints, type BlueprintDiff } from './blueprintDiff';
import type { ProposalBlueprint } from './proposalBlueprintTypes';

export class BlueprintReanalysisError extends Error {
  constructor(message: string, readonly reason: 'bundle_missing' | 'extract_failed') { super(message); this.name = 'BlueprintReanalysisError'; }
}

export interface ReanalysisResult {
  version: number;
  blueprint: ProposalBlueprint;
  diff: BlueprintDiff;
  documentCount: number;
}

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'proposal-studio-blueprint', ...fields }));
}

export async function reanalyzeProposalBlueprint(deliveryProjectId: string, identityId: string | null): Promise<ReanalysisResult> {
  if (!deliveryProjectId) throw new BlueprintReanalysisError('Project id is required.', 'bundle_missing');

  const qual: any = await GovQualification.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
  if (!qual) throw new BlueprintReanalysisError('Solicitation package missing. Re-upload it on the Solicitation step.', 'bundle_missing');
  const tenantId: string = qual.tenant_id;
  const qualificationKey: string = qual.canonical_opportunity_id;

  const bundle = await loadLatestGovSourceBundle(tenantId, qualificationKey);
  if (!bundle) throw new BlueprintReanalysisError('Solicitation package missing. Re-upload it on the Solicitation step.', 'bundle_missing');

  let perFileText: { name: string; text: string }[];
  try {
    const buffer = await fs.readFile(bundle.path);
    const extraction = await extractProposal(buffer);
    perFileText = extraction.perFileText ?? [];
  } catch (err: any) {
    log({ event: 'blueprint_extract_failed', outcome: 'failure', deliveryProjectId, error_class: err?.constructor?.name ?? 'Error', message: err?.message });
    throw new BlueprintReanalysisError('Could not read the stored solicitation package.', 'extract_failed');
  }

  const reqRows: any[] = await ContractRequirement.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const reqPlain = reqRows.map((r) => (typeof r?.get === 'function' ? r.get({ plain: true }) : r));
  // For the blueprint's elimination-risk scan we only need statement + section; deriveProposalDocuments below needs
  // the full rows (canonical_req_id, kind) to route each requirement to its document.
  const requirements = reqPlain.map((r: any) => ({ statement: r.statement, section: r.section ?? null }));
  const facts = readGovProvenanceFacts(qual.requirements_json);
  const keyDates = (facts?.keyDates ?? []).map((k: any) => ({ date: k.date ?? null, text: k.text ?? null }));

  const blueprint = buildProposalBlueprint({ files: perFileText, requirements, keyDates, buyer: {} });

  // Previous blueprint (for the diff) + next version number.
  const prevRow: any = await GovProposalBlueprint.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
  const prevBlueprint: ProposalBlueprint | null = prevRow ? (prevRow.blueprint_json as ProposalBlueprint) : null;
  const version = (prevRow?.version ?? 0) + 1;

  await GovProposalBlueprint.create({
    delivery_project_id: deliveryProjectId,
    version,
    source_sha256: bundle.sha256,
    blueprint_json: blueprint,
    created_by_identity_id: identityId,
  } as any);

  // Re-derive the document set from the blueprint and sync it (source-derived fields only; authored work preserved).
  const docs = deriveProposalDocuments(reqPlain, blueprint, { blueprintVersion: version });
  await syncProposalDocuments(deliveryProjectId, docs);
  // C.1: a blueprint FORM doc that no longer applies (e.g. a Texas CIQ once the buyer is detected non-Texas) is
  // removed when it has no authored work, else flagged "No longer required". Only runs on this explicit re-analyze
  // action, never on a read projection, so a routine GET never deletes a row.
  await reconcileSupersededFormDocuments(deliveryProjectId, docs);

  const diff = diffBlueprints(prevBlueprint, blueprint);
  log({ event: 'blueprint_reanalyzed', outcome: 'success', deliveryProjectId, version, rules: blueprint.rules.length, dropped: blueprint.droppedRuleCount, documents: docs.length });
  return { version, blueprint, diff, documentCount: docs.length };
}
