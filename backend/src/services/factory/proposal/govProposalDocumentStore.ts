/**
 * govProposalDocumentStore — persistence + lifecycle for the named proposal documents (cockpit v2 Proposal
 * workstream). The derived document list (govProposalDocuments) is SYNCED into gov_proposal_documents so each
 * document's authored state — draft content, status, review comments, acceptance — survives re-derivation.
 *
 * RAILS:
 *  - sync is source-derived ONLY: it updates title/order/gate/admin_only/requirement_ids, and NEVER resets content,
 *    status, version, comments or acceptance. Re-deriving the requirement set can never wipe a drafted document.
 *  - a document is `accepted` ONLY through acceptProposalDocument (a reviewer action). The AI draft path sets
 *    `drafted`, never `accepted` — the same "the maker never marks its own work done" rail as build evidence.
 *  - acceptance is reversible by a re-draft (status falls back to `drafted`), so a comment-driven revision loop works.
 */
import GovProposalDocument, { type GovProposalDocumentAttributes, type GovProposalDocumentComment, type GovProposalDocumentStatus } from '../../../models/GovProposalDocument';
import type { ProposalDocument } from './govProposalDocuments';

export interface ProposalDocumentView {
  key: string;
  title: string;
  status: GovProposalDocumentStatus;
  contentHtml: string | null;
  version: number;
  adminOnly: boolean;
  gate: boolean;
  order: number;
  requirementIds: string[];
  comments: GovProposalDocumentComment[];
  draftedAt: string | null;
  acceptedAt: string | null;
}

export class ProposalDocumentError extends Error {
  constructor(message: string, readonly reason: string) { super(message); this.name = 'ProposalDocumentError'; }
}

function toView(row: GovProposalDocumentAttributes): ProposalDocumentView {
  return {
    key: row.doc_key,
    title: row.title,
    status: row.status,
    contentHtml: row.content_html ?? null,
    version: row.version ?? 0,
    adminOnly: !!row.admin_only,
    gate: !!row.gate,
    order: row.order_index ?? 0,
    requirementIds: Array.isArray(row.requirement_ids) ? row.requirement_ids : [],
    comments: Array.isArray(row.comments) ? row.comments : [],
    draftedAt: row.drafted_at ? new Date(row.drafted_at).toISOString() : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
  };
}

/** Upsert the derived documents into the store (source-derived fields only; authored state preserved), then return
 *  every stored document for the project in volume order. Removing a doc from the derived set does NOT delete its
 *  row — authored work is never destroyed by re-derivation (it simply has an empty requirement set). */
export async function syncProposalDocuments(deliveryProjectId: string, derived: ProposalDocument[]): Promise<ProposalDocumentView[]> {
  if (!deliveryProjectId) return [];
  for (const d of Array.isArray(derived) ? derived : []) {
    const [row, created] = await GovProposalDocument.findOrCreate({
      where: { delivery_project_id: deliveryProjectId, doc_key: d.key },
      defaults: {
        delivery_project_id: deliveryProjectId, doc_key: d.key, title: d.title, status: 'not_started',
        content_html: null, version: 0, admin_only: d.adminOnly, gate: d.gate, order_index: d.order,
        requirement_ids: d.requirements.map((r) => r.canonicalReqId), comments: [],
        drafted_at: null, drafted_by_identity_id: null, accepted_at: null, accepted_by_identity_id: null,
      } as any,
    });
    if (!created) {
      // Source-derived fields only — NEVER content/status/version/comments/acceptance.
      await (row as any).update({ title: d.title, admin_only: d.adminOnly, gate: d.gate, order_index: d.order, requirement_ids: d.requirements.map((r) => r.canonicalReqId), updated_at: new Date() });
    }
  }
  return listProposalDocuments(deliveryProjectId);
}

export async function listProposalDocuments(deliveryProjectId: string): Promise<ProposalDocumentView[]> {
  if (!deliveryProjectId) return [];
  const rows = await GovProposalDocument.findAll({ where: { delivery_project_id: deliveryProjectId }, order: [['order_index', 'ASC']] });
  return rows.map((r) => toView(r.get({ plain: true }) as GovProposalDocumentAttributes));
}

async function findDoc(deliveryProjectId: string, docKey: string) {
  const row: any = await GovProposalDocument.findOne({ where: { delivery_project_id: deliveryProjectId, doc_key: docKey } });
  if (!row) throw new ProposalDocumentError('Document not found.', 'not_found');
  return row;
}

/** Mark a document as actively drafting (the AI is working). Advisory UI state. */
export async function markProposalDocumentDrafting(deliveryProjectId: string, docKey: string): Promise<ProposalDocumentView> {
  const row = await findDoc(deliveryProjectId, docKey);
  await row.update({ status: 'drafting', updated_at: new Date() });
  return toView(row.get({ plain: true }) as GovProposalDocumentAttributes);
}

/** Save drafted content (from the AI, or a human edit). ALWAYS lands `drafted` — never `accepted`. Bumps the
 *  version; a re-draft of an accepted document reopens it (status falls back to drafted, acceptance cleared). */
export async function saveProposalDocumentDraft(deliveryProjectId: string, docKey: string, contentHtml: string, draftedByIdentityId: string | null): Promise<ProposalDocumentView> {
  const content = String(contentHtml ?? '').trim();
  if (!content) throw new ProposalDocumentError('Draft content is required.', 'empty');
  const row = await findDoc(deliveryProjectId, docKey);
  const plain = row.get({ plain: true }) as GovProposalDocumentAttributes;
  await row.update({
    content_html: content, status: 'drafted', version: (plain.version ?? 0) + 1,
    drafted_at: new Date(), drafted_by_identity_id: draftedByIdentityId,
    accepted_at: null, accepted_by_identity_id: null, updated_at: new Date(),
  });
  return toView(row.get({ plain: true }) as GovProposalDocumentAttributes);
}

/** A reviewer ACCEPTS a drafted document — the only path to `accepted`. Requires content on file. */
export async function acceptProposalDocument(deliveryProjectId: string, docKey: string, reviewerIdentityId: string): Promise<ProposalDocumentView> {
  if (!reviewerIdentityId) throw new ProposalDocumentError('A reviewer identity is required.', 'no_reviewer');
  const row = await findDoc(deliveryProjectId, docKey);
  const plain = row.get({ plain: true }) as GovProposalDocumentAttributes;
  if (!plain.content_html) throw new ProposalDocumentError('Nothing to accept — the document has no draft yet.', 'not_drafted');
  if (plain.status === 'accepted') throw new ProposalDocumentError('This document is already accepted.', 'already_accepted');
  await row.update({ status: 'accepted', accepted_at: new Date(), accepted_by_identity_id: reviewerIdentityId, updated_at: new Date() });
  return toView(row.get({ plain: true }) as GovProposalDocumentAttributes);
}

/** A reviewer requests changes: status → changes_requested, and the note is appended to the review thread. */
export async function requestChangesProposalDocument(deliveryProjectId: string, docKey: string, reviewerIdentityId: string, note: string): Promise<ProposalDocumentView> {
  const row = await addCommentRow(deliveryProjectId, docKey, reviewerIdentityId, note);
  await row.update({ status: 'changes_requested', updated_at: new Date() });
  return toView(row.get({ plain: true }) as GovProposalDocumentAttributes);
}

/** Append a comment to a document's review thread (no status change). */
export async function addProposalDocumentComment(deliveryProjectId: string, docKey: string, authorIdentityId: string, body: string): Promise<ProposalDocumentView> {
  const row = await addCommentRow(deliveryProjectId, docKey, authorIdentityId, body);
  return toView(row.get({ plain: true }) as GovProposalDocumentAttributes);
}

async function addCommentRow(deliveryProjectId: string, docKey: string, authorIdentityId: string, body: string) {
  const text = String(body ?? '').trim();
  if (!authorIdentityId) throw new ProposalDocumentError('An author identity is required.', 'no_author');
  if (!text) throw new ProposalDocumentError('A comment body is required.', 'empty');
  const row = await findDoc(deliveryProjectId, docKey);
  const plain = row.get({ plain: true }) as GovProposalDocumentAttributes;
  const comment: GovProposalDocumentComment = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    authorIdentityId, body: text.slice(0, 4000), at: new Date().toISOString(),
  };
  await row.update({ comments: [...(Array.isArray(plain.comments) ? plain.comments : []), comment], updated_at: new Date() });
  return row;
}
