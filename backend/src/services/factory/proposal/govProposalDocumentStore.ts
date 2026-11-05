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
import type { ProposalDocument, ProposalDocumentSection, ProposalDocType, SectionPlanFields } from './govProposalDocuments';

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
  /** P1: the document's sections (one per covered requirement). The proposal is modelled here, not on slots. */
  sections: ProposalDocumentSection[];
  /** P2: blueprint-derived shape. */
  docType: ProposalDocType;
  pageLimit: number | null;
  fileName: string | null;
  blueprintVersion: number | null;
  /** C.1: a blueprint FORM document that no longer applies (e.g. a Texas CIQ on a non-Texas buyer) but still has
   *  authored work — flagged "No longer required", excluded from readiness + the package. */
  superseded: boolean;
  comments: GovProposalDocumentComment[];
  draftedAt: string | null;
  acceptedAt: string | null;
}

/**
 * Merge freshly-DERIVED sections with the STORED ones: derived structure (heading, requirementIds, order) wins, but
 * authored content/plan/figures on a section with the same `sectionKey` are PRESERVED — the section-level form of
 * the "re-derivation never wipes authored work" rail. A section whose requirement left the set is dropped, matching
 * how `requirement_ids` drops a departed requirement; the whole-document `content_html` is preserved regardless.
 */
function mergeSections(derived: ProposalDocumentSection[], stored: ProposalDocumentSection[]): ProposalDocumentSection[] {
  const authored = new Map<string, ProposalDocumentSection>();
  for (const s of Array.isArray(stored) ? stored : []) if (s && s.sectionKey) authored.set(s.sectionKey, s);
  return (Array.isArray(derived) ? derived : []).map((d) => {
    const prior = authored.get(d.sectionKey);
    if (!prior) return d;
    return { ...d, plan: prior.plan ?? d.plan, contentHtml: prior.contentHtml, figures: prior.figures };
  });
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
    sections: Array.isArray(row.sections_json) ? row.sections_json : [],
    docType: row.doc_type ?? 'derived',
    pageLimit: row.page_limit ?? null,
    fileName: row.file_name ?? null,
    blueprintVersion: row.blueprint_version ?? null,
    superseded: !!row.superseded,
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
        requirement_ids: d.requirements.map((r) => r.canonicalReqId), sections_json: d.sections, comments: [],
        doc_type: d.docType ?? 'derived', page_limit: d.pageLimit ?? null, file_name: d.fileName ?? null, blueprint_version: d.blueprintVersion ?? null,
        drafted_at: null, drafted_by_identity_id: null, accepted_at: null, accepted_by_identity_id: null,
      } as any,
    });
    if (!created) {
      // Source-derived fields only — NEVER content/status/version/comments/acceptance. Sections merge: derived
      // structure wins, authored section content/plan/figures preserved by sectionKey (see mergeSections). The P2
      // blueprint-derived fields (doc_type/page_limit/file_name/blueprint_version) are source-derived, so they sync.
      const plain = (row as any).get({ plain: true }) as GovProposalDocumentAttributes;
      await (row as any).update({ title: d.title, admin_only: d.adminOnly, gate: d.gate, order_index: d.order, requirement_ids: d.requirements.map((r) => r.canonicalReqId), sections_json: mergeSections(d.sections, plain.sections_json), doc_type: d.docType ?? 'derived', page_limit: d.pageLimit ?? null, file_name: d.fileName ?? null, blueprint_version: d.blueprintVersion ?? null, updated_at: new Date() });
    }
  }
  return listProposalDocuments(deliveryProjectId);
}

export async function listProposalDocuments(deliveryProjectId: string): Promise<ProposalDocumentView[]> {
  if (!deliveryProjectId) return [];
  const rows = await GovProposalDocument.findAll({ where: { delivery_project_id: deliveryProjectId }, order: [['order_index', 'ASC']] });
  return rows.map((r) => toView(r.get({ plain: true }) as GovProposalDocumentAttributes));
}

/** One stored document, reduced to the facts the reconcile needs. */
export interface StoredDocReconcile {
  docKey: string;
  docType: ProposalDocType;
  status: GovProposalDocumentStatus;
  version: number;
  hasContent: boolean;
  hasVersion: boolean;
  superseded: boolean;
}

/** What to do with each stored document after a re-analyze. */
export interface ReconcilePlan { toDelete: string[]; toFlag: string[]; toUnflag: string[]; }

/**
 * PURE decision core for the C.1 "no longer required" rail (so it is unit-testable without a DB). Given the stored
 * documents and the keys the NEW blueprint derives, decide which blueprint FORM documents no longer apply:
 *  - a FORM doc absent from the derived set with NO authored work (not_started, version 0, no content, no version) is
 *    removed (`toDelete`); with work, it is flagged `superseded` (`toFlag`) so authored work is never destroyed;
 *  - a doc that is back in the derived set is un-flagged (`toUnflag`).
 * Requirement-derived / generated / build documents are left untouched — they follow the "persist, never delete"
 * rail; only engine/solicitation FORM docs are pruned. Deterministic: same inputs ⇒ same plan (idempotent to re-run).
 */
export function planSupersededReconcile(stored: StoredDocReconcile[], derivedKeys: Set<string>): ReconcilePlan {
  const toDelete: string[] = [];
  const toFlag: string[] = [];
  const toUnflag: string[] = [];
  for (const d of Array.isArray(stored) ? stored : []) {
    if (!d || !d.docKey) continue;
    if (derivedKeys.has(d.docKey)) { if (d.superseded) toUnflag.push(d.docKey); continue; }
    if (d.docType !== 'form') continue; // only blueprint FORM docs are pruned/flagged
    const hasWork = d.status !== 'not_started' || (d.version ?? 0) > 0 || d.hasContent || d.hasVersion;
    if (hasWork) { if (!d.superseded) toFlag.push(d.docKey); }
    else toDelete.push(d.docKey);
  }
  return { toDelete, toFlag, toUnflag };
}

/**
 * Reconcile stored FORM documents against the newly-derived document set (called from the re-analyze path, AFTER
 * syncProposalDocuments, so authored work is already preserved). Applies {@link planSupersededReconcile}: deletes the
 * no-work stale form docs, flags the ones with work as superseded, and un-flags any that apply again. A read-path
 * projection never calls this, so a routine GET never deletes a row.
 */
export async function reconcileSupersededFormDocuments(deliveryProjectId: string, derived: ProposalDocument[]): Promise<ReconcilePlan> {
  const empty: ReconcilePlan = { toDelete: [], toFlag: [], toUnflag: [] };
  if (!deliveryProjectId) return empty;
  const derivedKeys = new Set((Array.isArray(derived) ? derived : []).map((d) => d.key));
  const rows = await GovProposalDocument.findAll({ where: { delivery_project_id: deliveryProjectId } });
  const stored: StoredDocReconcile[] = rows.map((r) => {
    const p = r.get({ plain: true }) as GovProposalDocumentAttributes;
    return {
      docKey: p.doc_key,
      docType: p.doc_type ?? 'derived',
      status: p.status,
      version: p.version ?? 0,
      hasContent: !!p.content_html,
      hasVersion: !!p.current_version_id,
      superseded: !!p.superseded,
    };
  });
  const plan = planSupersededReconcile(stored, derivedKeys);
  for (const key of plan.toDelete) await GovProposalDocument.destroy({ where: { delivery_project_id: deliveryProjectId, doc_key: key } });
  for (const key of plan.toFlag) await GovProposalDocument.update({ superseded: true, updated_at: new Date() } as any, { where: { delivery_project_id: deliveryProjectId, doc_key: key } });
  for (const key of plan.toUnflag) await GovProposalDocument.update({ superseded: false, updated_at: new Date() } as any, { where: { delivery_project_id: deliveryProjectId, doc_key: key } });
  return plan;
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

/**
 * Save the structured section plan (B.7) onto a document's section AND write a new HUMAN version capturing it, so a
 * plan change is auditable in the version history. Reviewer-only (the route gates it). 404 when the section is not on
 * the document; the content is unchanged (only the section's planFields updates).
 */
export async function saveSectionPlan(deliveryProjectId: string, docKey: string, sectionKey: string, plan: SectionPlanFields, reviewerIdentityId: string | null): Promise<ProposalDocumentView> {
  if (!reviewerIdentityId) throw new ProposalDocumentError('A reviewer identity is required.', 'no_reviewer');
  const row = await findDoc(deliveryProjectId, docKey);
  const plain = row.get({ plain: true }) as GovProposalDocumentAttributes;
  const sections: ProposalDocumentSection[] = Array.isArray(plain.sections_json) ? plain.sections_json : [];
  const idx = sections.findIndex((s) => s && s.sectionKey === sectionKey);
  if (idx < 0) throw new ProposalDocumentError('Section not found on this document.', 'not_found');
  const updatedSections = sections.map((s, i) => (i === idx ? { ...s, planFields: plan } : s));
  await row.update({ sections_json: updatedSections, updated_at: new Date() });
  // A plan change is a reviewer edit — record it as a new human version (auditable), content unchanged.
  const { createVersionForDocKey } = await import('./govProposalReviewStore');
  await createVersionForDocKey(deliveryProjectId, docKey, {
    contentHtml: plain.content_html ?? null, sections: updatedSections, authorKind: 'human',
    authorIdentityId: reviewerIdentityId, changeSummary: `Section plan updated: ${sectionKey}`,
  });
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
