/**
 * govProposalDocumentActions — the shared "draft a proposal document" action, used by BOTH the student
 * portal route and the admin gov-contracts route, so the manual-or-AI draft logic lives in exactly one
 * place (CLAUDE.md modular composition: the same ~20 lines were otherwise about to exist in two routes).
 *
 * The draft ALWAYS lands `drafted`, never `accepted` — the maker never marks its own work done (the store
 * enforces that). Errors are thrown as `ProposalDocumentError` (the store's class, name preserved) so BOTH
 * routes' existing error maps translate them to HTTP. Reasons this action raises:
 *   not_found  → 404 (no such document on the project)
 *   forbidden  → 403 (an admin-only / pricing document drafted by a caller without verify authority)
 *   ai_failed  → 502 (the model could not produce a draft)
 * plus `empty` (422) from the store when content is blank.
 */
import type { ProposalDocumentView } from './govProposalDocumentStore';

export interface DraftProposalDocumentInput {
  deliveryProjectId: string;
  docKey: string;
  /** The acting identity recorded as the drafter; may be null (anonymous draft is allowed by the store). */
  identityId: string | null;
  /** Reviewer authority: lets this caller draft an admin-only (pricing) document. */
  canVerify: boolean;
  /** A string saves this as a manual (server-sanitized) edit; null/undefined has the AI draft from requirements. */
  manualHtml?: string | null;
}

/**
 * Draft one proposal document (manual edit or AI generation). Pure orchestration over the store + the AI
 * drafter; no HTTP concerns. Callers map the thrown `ProposalDocumentError.reason` to a status code.
 */
export async function draftProposalDocument(input: DraftProposalDocumentInput): Promise<ProposalDocumentView> {
  const { deliveryProjectId, docKey, identityId, canVerify } = input;
  const store = await import('./govProposalDocumentStore');
  const { sanitizeProposalHtml, generateProposalDocumentDraftAI } = await import('./govProposalDocumentDraftAI');

  const existing = (await store.listProposalDocuments(deliveryProjectId)).find((d) => d.key === docKey);
  if (!existing) throw new store.ProposalDocumentError('Document not found.', 'not_found');
  if (existing.adminOnly && !canVerify) throw new store.ProposalDocumentError('A reviewer is required to draft this document.', 'forbidden');

  const manual = typeof input.manualHtml === 'string' ? input.manualHtml : null;
  if (manual !== null) {
    return store.saveProposalDocumentDraft(deliveryProjectId, docKey, sanitizeProposalHtml(manual), identityId);
  }

  // AI draft: re-derive to get this document's requirement statements for grounding.
  const { default: ContractRequirement } = await import('../../../models/ContractRequirement');
  const { deriveProposalDocuments } = await import('./govProposalDocuments');
  const reqRows: any[] = await ContractRequirement.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const derived = deriveProposalDocuments(reqRows.map((r) => (r && r.get ? r.get({ plain: true }) : r))).find((d) => d.key === docKey);
  await store.markProposalDocumentDrafting(deliveryProjectId, docKey).catch(() => { /* advisory state only */ });
  const result = await generateProposalDocumentDraftAI({ docKey, title: existing.title, requirements: derived?.requirements ?? [] });
  if (result.error || !result.html) throw new store.ProposalDocumentError(result.error || 'The AI draft could not be generated.', 'ai_failed');
  return store.saveProposalDocumentDraft(deliveryProjectId, docKey, result.html, identityId);
}
