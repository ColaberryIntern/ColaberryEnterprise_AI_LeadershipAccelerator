/**
 * migrateProposalSlotsToDocumentSections — the one-off P1 migration that moves the response-slot model's authored
 * content, figures and gaps onto the NAMED DOCUMENTS (the single proposal model after P1). The mapping logic is the
 * PURE `planSlotMigration` (services/factory/proposal/migrateSlotsToDocuments.ts); this script only does the I/O.
 *
 * IDEMPOTENT: section content is SET by `sectionKey` (re-applying is a no-op) and gap rows insert ON CONFLICT by
 * `source_gap_id`, so re-running changes nothing. NO LOSS: a response that routes to no document (a `scope`/build
 * requirement) is logged under `unmatched`, never written into a proposal document and never dropped.
 *
 * Run inside the backend container:
 *   node dist/scripts/migrateProposalSlotsToDocumentSections.js                      # DRY-RUN (default): writes nothing
 *   node dist/scripts/migrateProposalSlotsToDocumentSections.js --apply              # write
 *   node dist/scripts/migrateProposalSlotsToDocumentSections.js --project <id>       # scope to one delivery project
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import ContractRequirement from '../models/ContractRequirement';
import GovProposalResponse from '../models/GovProposalResponse';
import GovProposalDocument from '../models/GovProposalDocument';
import { syncProposalDocuments } from '../services/factory/proposal/govProposalDocumentStore';
import { planSlotMigration, applySectionPatches, type MigrationRequirement, type MigrationResponse, type SectionPatch } from '../services/factory/proposal/migrateSlotsToDocuments';

const APPLY = process.argv.includes('--apply');
const projectArgIdx = process.argv.indexOf('--project');
const ONLY_PROJECT = projectArgIdx >= 0 ? process.argv[projectArgIdx + 1] : null;

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'proposal-studio-migration', ...fields }));
}

async function projectsWithResponses(): Promise<string[]> {
  if (ONLY_PROJECT) return [ONLY_PROJECT];
  const rows = await sequelize.query<{ delivery_project_id: string }>(
    'SELECT DISTINCT delivery_project_id FROM gov_proposal_response', { type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.delivery_project_id).filter(Boolean);
}

async function loadRequirements(pid: string): Promise<MigrationRequirement[]> {
  const rows = await ContractRequirement.findAll({ where: { delivery_project_id: pid } });
  return rows.map((r) => {
    const p = r.get({ plain: true }) as unknown as { id: string; canonical_req_id: string; statement: string; kind: string };
    return { id: p.id, canonical_req_id: p.canonical_req_id, statement: p.statement, kind: p.kind };
  });
}

async function loadResponses(pid: string): Promise<MigrationResponse[]> {
  const rows = await GovProposalResponse.findAll({ where: { delivery_project_id: pid } });
  return rows.map((r) => {
    const p = r.get({ plain: true }) as unknown as { requirement_id: string; content: unknown; figures: unknown; gaps: unknown };
    return {
      requirementId: p.requirement_id,
      content: typeof p.content === 'string' ? p.content : '',
      figures: Array.isArray(p.figures) ? (p.figures as MigrationResponse['figures']) : [],
      gaps: Array.isArray(p.gaps) ? (p.gaps as MigrationResponse['gaps']) : [],
    };
  });
}

async function applyGapRow(pid: string, g: { docKey: string; sectionKey: string; question: string; suggestions: string[]; resolution: string; answer: string | null; sourceGapId: string }): Promise<void> {
  await sequelize.query(
    `INSERT INTO gov_proposal_document_gaps
       (delivery_project_id, doc_key, section_key, question, suggestions, resolution, answer, source_gap_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     ON CONFLICT (delivery_project_id, source_gap_id) WHERE source_gap_id IS NOT NULL DO NOTHING`,
    { bind: [pid, g.docKey, g.sectionKey, g.question, JSON.stringify(g.suggestions), g.resolution, g.answer, g.sourceGapId], type: QueryTypes.INSERT },
  );
}

(async () => {
  const pids = await projectsWithResponses();
  let totSections = 0; let totGaps = 0; let totUnmatched = 0;

  for (const pid of pids) {
    const requirements = await loadRequirements(pid);
    const responses = await loadResponses(pid);
    if (responses.length === 0) continue;
    const plan = planSlotMigration(requirements, responses);

    if (APPLY) {
      // Ensure the documents exist with their derived sections, then overwrite each section's content directly
      // (NOT via sync's merge, which deliberately preserves stored content — here the slot IS the source of truth).
      await syncProposalDocuments(pid, plan.documents);
      const byDoc = new Map<string, SectionPatch[]>();
      for (const p of plan.sectionPatches) { const a = byDoc.get(p.docKey) ?? []; a.push(p); byDoc.set(p.docKey, a); }
      for (const [docKey, patches] of byDoc) {
        const row = await GovProposalDocument.findOne({ where: { delivery_project_id: pid, doc_key: docKey } });
        if (!row) continue;
        const stored = Array.isArray((row as any).sections_json) ? (row as any).sections_json : [];
        await (row as any).update({ sections_json: applySectionPatches(stored, patches), updated_at: new Date() });
      }
      for (const g of plan.gapRows) await applyGapRow(pid, g);
    }

    totSections += plan.sectionPatches.length;
    totGaps += plan.gapRows.length;
    totUnmatched += plan.unmatched.length;
    log({ project: pid, section_patches: plan.sectionPatches.length, gap_rows: plan.gapRows.length, unmatched: plan.unmatched });
  }

  log({ summary: true, mode: APPLY ? 'apply' : 'dry-run', projects: pids.length, section_patches: totSections, gap_rows: totGaps, unmatched: totUnmatched });
  process.exit(0);
})().catch((e) => { console.error('MIGRATION FAILED:', e && e.message ? e.message : e); process.exit(1); });
