/**
 * govProposalReviewStore — the P3 review layer's persistence: IMMUTABLE document versions and the color-team gate
 * decisions over them.
 *
 * - createDocumentVersion inserts the next version (never updates an existing row) and points
 *   gov_proposal_documents.current_version_id at it; it also REOPENS every gate (a content change invalidates prior
 *   approvals — "a new version after an approval reopens the later gates", applied as: reset all gates to pending).
 * - recordVersionChecks fills a version's evaluation fields (scores/findings/passes/page_count) ONCE after creation
 *   — the content is immutable, the evaluation is written by the check run.
 * - decideGate enforces the Shipley order (earlier gates first), that the version PASSES the checks relevant to the
 *   gate, and — for Gold — separation of duties (the approver is not the version's last human author) unless a
 *   master-admin override. The AI can never approve; only a human reviewer calls this.
 */
import GovProposalDocument from '../../../models/GovProposalDocument';
import GovProposalDocumentVersion from '../../../models/GovProposalDocumentVersion';
import GovProposalGateReview from '../../../models/GovProposalGateReview';
import { GATE_ORDER, type GovProposalGate, type CheckScores, type CheckFinding, type VersionAuthorKind } from './proposalReviewTypes';
import { GATE_CHECKS, CHECK_FLOOR, weightedTotal, PASS_THRESHOLD } from './proposalReviewConfig';
import type { ProposalDocumentSection } from './govProposalDocuments';
import { diffVersionsHtml, type DiffSegment } from './htmlTextDiff';

export class ProposalReviewError extends Error {
  constructor(message: string, readonly reason: 'not_found' | 'gate_order' | 'checks_not_met' | 'separation_of_duties' | 'no_reviewer' | 'no_version') { super(message); this.name = 'ProposalReviewError'; }
}

export interface CreateVersionInput {
  contentHtml: string | null;
  sections: ProposalDocumentSection[];
  authorKind: VersionAuthorKind;
  authorIdentityId: string | null;
  changeSummary: string | null;
}

/** Insert the next immutable version of a document, point current_version_id at it, and reopen the gates. */
export async function createDocumentVersion(documentId: string, input: CreateVersionInput): Promise<{ id: string; version: number }> {
  if (!documentId) throw new ProposalReviewError('Document id is required.', 'not_found');
  const last: any = await GovProposalDocumentVersion.findOne({ where: { document_id: documentId }, order: [['version', 'DESC']] });
  const version = ((last?.version as number) ?? 0) + 1;
  const row: any = await GovProposalDocumentVersion.create({
    document_id: documentId, version,
    content_html: input.contentHtml ?? null,
    sections_json: Array.isArray(input.sections) ? input.sections : [],
    author_kind: input.authorKind, author_identity_id: input.authorIdentityId,
    change_summary: input.changeSummary ?? null,
    check_scores: {}, findings: [], passes: false, page_count: null,
  } as any);
  await GovProposalDocument.update({ current_version_id: row.id } as any, { where: { id: documentId } });
  // A new version invalidates every gate approval — the reviewed content no longer exists.
  await GovProposalGateReview.update({ status: 'pending', version_id: null, decided_at: null } as any, { where: { document_id: documentId } });
  return { id: row.id, version };
}

/** Resolve a (project, docKey) to its document id and create the next version. Returns null when no such document
 *  (the caller already validated the project/doc, so this is a defensive null, not an error path). */
export async function createVersionForDocKey(deliveryProjectId: string, docKey: string, input: CreateVersionInput): Promise<{ id: string; version: number } | null> {
  const doc: any = await GovProposalDocument.findOne({ where: { delivery_project_id: deliveryProjectId, doc_key: docKey } });
  if (!doc) return null;
  return createDocumentVersion(doc.id, input);
}

/** The document id (pk) for a (project, docKey), or null. Lets routes that have a docKey use the id-keyed ops. */
export async function docIdFor(deliveryProjectId: string, docKey: string): Promise<string | null> {
  const doc: any = await GovProposalDocument.findOne({ where: { delivery_project_id: deliveryProjectId, doc_key: docKey } });
  return doc ? doc.id : null;
}

/** Write a version's evaluation ONCE (content stays immutable; this fills scores/findings/passes/page_count). */
export async function recordVersionChecks(versionId: string, result: { scores: CheckScores; findings: CheckFinding[]; passes: boolean; pageCount: number | null }): Promise<void> {
  await GovProposalDocumentVersion.update(
    { check_scores: result.scores, findings: result.findings, passes: result.passes, page_count: result.pageCount } as any,
    { where: { id: versionId } },
  );
}

export interface VersionView {
  id: string; version: number; authorKind: VersionAuthorKind; changeSummary: string | null;
  scores: Partial<CheckScores>; findings: CheckFinding[]; passes: boolean; pageCount: number | null; createdAt: string | null;
}
function toVersionView(row: any): VersionView {
  const p = typeof row?.get === 'function' ? row.get({ plain: true }) : row;
  return { id: p.id, version: p.version, authorKind: p.author_kind, changeSummary: p.change_summary ?? null, scores: p.check_scores ?? {}, findings: Array.isArray(p.findings) ? p.findings : [], passes: !!p.passes, pageCount: p.page_count ?? null, createdAt: p.created_at ? new Date(p.created_at).toISOString() : null };
}

export async function listDocumentVersions(documentId: string): Promise<VersionView[]> {
  const rows = await GovProposalDocumentVersion.findAll({ where: { document_id: documentId }, order: [['version', 'DESC']] });
  return rows.map(toVersionView);
}

/** Batch: load specific versions by id (e.g. every document's current_version_id) in ONE query → map by version id.
 *  Backs the projection's per-doc `latest` summary without an N+1. */
export async function listVersionsByIds(ids: string[]): Promise<Map<string, VersionView>> {
  const out = new Map<string, VersionView>();
  const clean = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (clean.length === 0) return out;
  const rows = await GovProposalDocumentVersion.findAll({ where: { id: clean } });
  for (const r of rows) { const v = toVersionView(r); out.set(v.id, v); }
  return out;
}

/** Batch: load the gate decisions for many documents in ONE query → map document id → the GATE_ORDER gate views
 *  (missing gates default to `pending`). Backs the projection's per-doc `gates`/`currentGate` summary without an N+1. */
export async function listGatesForDocs(documentIds: string[]): Promise<Map<string, GateView[]>> {
  const out = new Map<string, GateView[]>();
  const clean = (Array.isArray(documentIds) ? documentIds : []).filter(Boolean);
  if (clean.length === 0) return out;
  const rows = await GovProposalGateReview.findAll({ where: { document_id: clean } });
  const byDoc = new Map<string, Map<string, any>>();
  for (const r of rows) {
    const p: any = r.get({ plain: true });
    const m = byDoc.get(p.document_id) ?? new Map<string, any>();
    m.set(p.gate, p);
    byDoc.set(p.document_id, m);
  }
  for (const docId of clean) {
    const m = byDoc.get(docId) ?? new Map<string, any>();
    out.set(docId, GATE_ORDER.map((gate) => {
      const p: any = m.get(gate);
      return { gate, status: p?.status ?? 'pending', versionId: p?.version_id ?? null, note: p?.note ?? null, decidedAt: p?.decided_at ? new Date(p.decided_at).toISOString() : null };
    }));
  }
  return out;
}
export async function getDocumentVersion(versionId: string): Promise<VersionView | null> {
  const row = await GovProposalDocumentVersion.findByPk(versionId);
  return row ? toVersionView(row) : null;
}

/** The stored CONTENT of a version — the sanitized HTML, its sections, and the figures bound to them (B.2). */
export interface VersionContentView { contentHtml: string | null; sections: ProposalDocumentSection[]; figures: unknown[] }
export async function getDocumentVersionContent(versionId: string): Promise<VersionContentView | null> {
  const row: any = await GovProposalDocumentVersion.findByPk(versionId);
  if (!row) return null;
  const p = row.get({ plain: true });
  const sections: ProposalDocumentSection[] = Array.isArray(p.sections_json) ? p.sections_json : [];
  const figures = sections.flatMap((s) => (Array.isArray(s.figures) ? s.figures : []));
  return { contentHtml: p.content_html ?? null, sections, figures };
}

/** Resolve a version id to its (project, docKey) — used by the portal mirror to confirm the version belongs to a
 *  document the caller may see (pricing is dropped from the caller's projection, so a pricing version 404s). */
export async function docRefForVersion(versionId: string): Promise<{ deliveryProjectId: string; docKey: string } | null> {
  const v: any = await GovProposalDocumentVersion.findByPk(versionId);
  if (!v) return null;
  const docId = v.get({ plain: true }).document_id;
  const doc: any = docId ? await GovProposalDocument.findByPk(docId) : null;
  if (!doc) return null;
  const p = doc.get({ plain: true });
  return { deliveryProjectId: p.delivery_project_id, docKey: p.doc_key };
}

/** HTML-aware word diff between two versions' content (server-side; the in-repo LCS, no new dependency). */
export async function diffVersions(aVersionId: string, bVersionId: string): Promise<DiffSegment[]> {
  const [a, b]: any[] = await Promise.all([GovProposalDocumentVersion.findByPk(aVersionId), GovProposalDocumentVersion.findByPk(bVersionId)]);
  const ah = a ? (a.get({ plain: true }).content_html as string | null) : null;
  const bh = b ? (b.get({ plain: true }).content_html as string | null) : null;
  return diffVersionsHtml(ah, bh);
}

/** True when the version's stored scores satisfy the checks a gate opens on (floor on each; full pass rule for Gold). */
export function versionPassesGate(scores: Partial<CheckScores>, findings: CheckFinding[], gate: GovProposalGate): boolean {
  const relevant = GATE_CHECKS[gate];
  const fatalInRelevant = (findings ?? []).some((f) => f.severity === 'fatal' && relevant.includes(f.check));
  if (fatalInRelevant) return false;
  const floorsMet = relevant.every((k) => (scores?.[k] ?? 0) >= CHECK_FLOOR);
  if (gate === 'gold') return floorsMet && weightedTotal(scores as CheckScores) >= PASS_THRESHOLD;
  return floorsMet;
}

export interface GateView { gate: GovProposalGate; status: string; versionId: string | null; note: string | null; decidedAt: string | null; }
export async function listGateReviews(documentId: string): Promise<GateView[]> {
  const rows = await GovProposalGateReview.findAll({ where: { document_id: documentId } });
  const byGate = new Map(rows.map((r: any) => { const p = r.get({ plain: true }); return [p.gate, p]; }));
  return GATE_ORDER.map((gate) => {
    const p: any = byGate.get(gate);
    return { gate, status: p?.status ?? 'pending', versionId: p?.version_id ?? null, note: p?.note ?? null, decidedAt: p?.decided_at ? new Date(p.decided_at).toISOString() : null };
  });
}

export interface DecideGateInput {
  documentId: string; gate: GovProposalGate; reviewerIdentityId: string | null;
  decision: 'approve' | 'return'; note?: string; isMasterAdmin?: boolean;
}

/** A reviewer approves or returns a gate. Enforces gate order, the pass-the-relevant-checks rule, and Gold SoD. */
export async function decideGate(input: DecideGateInput): Promise<GateView[]> {
  const { documentId, gate, reviewerIdentityId, decision } = input;
  if (!reviewerIdentityId) throw new ProposalReviewError('A reviewer identity is required.', 'no_reviewer');
  const doc: any = await GovProposalDocument.findByPk(documentId);
  if (!doc) throw new ProposalReviewError('Document not found.', 'not_found');

  const upsertGate = async (status: 'approved' | 'returned', versionId: string | null) => {
    const [row]: any = await GovProposalGateReview.findOrCreate({ where: { document_id: documentId, gate }, defaults: { document_id: documentId, gate, status: 'pending' } as any });
    await row.update({ status, version_id: versionId, reviewer_identity_id: reviewerIdentityId, note: input.note ?? null, decided_at: new Date(), updated_at: new Date() });
  };

  if (decision === 'return') { await upsertGate('returned', doc.current_version_id ?? null); return listGateReviews(documentId); }

  // Approve: there must be a current version, earlier gates approved, the checks met, and Gold SoD satisfied.
  const currentVersionId = doc.current_version_id;
  if (!currentVersionId) throw new ProposalReviewError('There is no current version to approve.', 'no_version');
  const version: any = await GovProposalDocumentVersion.findByPk(currentVersionId);
  if (!version) throw new ProposalReviewError('The current version was not found.', 'no_version');

  const gates = await listGateReviews(documentId);
  const idx = GATE_ORDER.indexOf(gate);
  for (let i = 0; i < idx; i++) {
    if (gates.find((g) => g.gate === GATE_ORDER[i])?.status !== 'approved') throw new ProposalReviewError(`The ${GATE_ORDER[i]} gate must be approved first.`, 'gate_order');
  }
  const vp = version.get({ plain: true });
  if (!versionPassesGate(vp.check_scores ?? {}, Array.isArray(vp.findings) ? vp.findings : [], gate)) {
    throw new ProposalReviewError(`The version does not yet pass the checks required for the ${gate} gate.`, 'checks_not_met');
  }
  if (gate === 'gold' && !input.isMasterAdmin && vp.author_kind === 'human' && vp.author_identity_id && vp.author_identity_id === reviewerIdentityId) {
    throw new ProposalReviewError('Separation of duties: the last human author of this version cannot approve its Gold gate.', 'separation_of_duties');
  }
  await upsertGate('approved', currentVersionId);
  return listGateReviews(documentId);
}
