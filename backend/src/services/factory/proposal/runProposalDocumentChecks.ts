/**
 * runProposalDocumentChecks — orchestrate the six-check scoring of a document's CURRENT version (P3) and record the
 * result on it. Renders the content to a PDF for the real page count (fail-soft: a render failure degrades the
 * format check, never crashes), runs the AI checks (fail-soft / null without a key), merges them with the pure
 * deterministic checks, and writes the scores/findings/passes/page_count onto the immutable version once.
 *
 * I/O at the edges (models, Playwright, OpenAI); the scoring itself is the pure runDocumentChecks. Returns the
 * CheckRunResult, or null when the document has no current version to score.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import GovProposalDocument from '../../../models/GovProposalDocument';
import GovProposalBlueprint from '../../../models/GovProposalBlueprint';
import { runDocumentChecks, type DocumentCheckInput } from './documentChecks';
import { runAiChecks } from './documentChecksAI';
import { renderProposalPdf } from './renderProposalPdf';
import { recordVersionChecks } from './govProposalReviewStore';
import type { CheckRunResult } from './proposalReviewTypes';
import type { ProposalBlueprint } from './proposalBlueprintTypes';

async function loadGaps(deliveryProjectId: string, docKey: string): Promise<Array<{ resolution: 'open' | 'answered' | 'filler' }>> {
  try {
    const rows = await sequelize.query<{ resolution: string }>(
      'SELECT resolution FROM gov_proposal_document_gaps WHERE delivery_project_id = $1 AND doc_key = $2',
      { bind: [deliveryProjectId, docKey], type: QueryTypes.SELECT },
    );
    return rows.map((r) => ({ resolution: (r.resolution === 'answered' || r.resolution === 'filler' ? r.resolution : 'open') as 'open' | 'answered' | 'filler' }));
  } catch { return []; }
}

export async function runProposalDocumentChecks(deliveryProjectId: string, docKey: string): Promise<CheckRunResult | null> {
  const doc: any = await GovProposalDocument.findOne({ where: { delivery_project_id: deliveryProjectId, doc_key: docKey } });
  if (!doc || !doc.current_version_id) return null;

  const bpRow: any = await GovProposalBlueprint.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
  const blueprint: ProposalBlueprint | null = bpRow ? (bpRow.blueprint_json as ProposalBlueprint) : null;

  const contentHtml: string | null = doc.content_html ?? null;
  const sections = Array.isArray(doc.sections_json) ? doc.sections_json : [];
  const requirementIds: string[] = Array.isArray(doc.requirement_ids) ? doc.requirement_ids : [];
  const gaps = await loadGaps(deliveryProjectId, docKey);

  // Render for the REAL page count (fail-soft: a render failure leaves pageCount null, so format can't assert over-limit).
  let pageCount: number | null = null;
  if (contentHtml && contentHtml.trim()) {
    try {
      const rendered = await renderProposalPdf(contentHtml, { pageSize: 'Letter', minFontPt: 11, headerText: doc.title, timeoutMs: 20000 });
      pageCount = rendered.pageCount;
    } catch { pageCount = null; }
  }

  const ai = await runAiChecks({
    docKey, title: doc.title, contentHtml,
    scoringFactors: blueprint?.scoring?.factors ?? [],
    backingRefs: [],
  });

  const input: DocumentCheckInput = {
    contentHtml, sections, requirementIds,
    pageLimit: doc.page_limit ?? null, fileName: doc.file_name ?? null, pageCount,
    gaps, isPricingDoc: !!doc.admin_only,
  };
  const result = runDocumentChecks(input, ai);
  await recordVersionChecks(doc.current_version_id, result);
  return result;
}
