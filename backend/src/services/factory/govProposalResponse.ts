/**
 * govProposalResponse — authoring + the review lifecycle for a proposal response (P4 proposal production).
 *
 * THE LIFECYCLE RAIL (load-bearing): a response moves `draft` → `reviewed` → `approved` in order, with
 * `revision_required` as the kickback. You CANNOT skip review (no draft → approved), you CANNOT advance an empty
 * answer, and ANY content/figure edit resets the status to `draft` — a changed answer is not a reviewed/approved
 * one. The agent never advances the lifecycle; review/approve are explicit human acts.
 *
 * THE FIGURE RAIL: a figure must be bound to a git commit (its provenance). An unbound figure is refused — a
 * "proof" figure with no commit it was captured at is not evidence.
 *
 * Keyed (delivery_project_id, requirement_id); a re-save upserts in place. Overlays the derived response slots.
 */
import GovProposalResponse, { type GovProposalResponseAttributes, type ResponseFigureAttr, type ResponseGapAttr, type ProposalResponseStatusAttr } from '../../models/GovProposalResponse';
import type { ResponseOverlay, ResponseGap } from './proposal/responseSlots';

export type ResponseView = ResponseOverlay;

export class ResponseError extends Error {
  constructor(message: string, readonly reason: string) { super(message); this.name = 'ResponseError'; }
}

function cleanFigures(raw: any): ResponseFigureAttr[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && typeof f === 'object')
    .map((f) => ({ commit: String(f.commit ?? '').trim(), ref: String(f.ref ?? '').trim(), caption: String(f.caption ?? '').trim() }))
    .filter((f) => f.commit && f.ref);
}

function cleanGaps(raw: any): ResponseGapAttr[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g) => g && typeof g === 'object' && String(g.id ?? '').trim())
    .map((g) => {
      const resolution = g.resolution === 'answered' || g.resolution === 'filler' ? g.resolution : 'open';
      const gap: ResponseGapAttr = {
        id: String(g.id).trim(),
        question: String(g.question ?? '').trim(),
        suggestions: Array.isArray(g.suggestions) ? g.suggestions.map((s: any) => String(s)).slice(0, 10) : [],
        resolution,
      };
      if (g.answer != null) gap.answer = String(g.answer);
      return gap;
    });
}

/** A response is 'filler' (for display) whenever any gap is a filler. The submission gate also checks the gaps
 *  directly, so this is a convenience, not the gate. Never upgrades a terminal state. */
function statusForGaps(base: ProposalResponseStatusAttr, gaps: ResponseGapAttr[]): ProposalResponseStatusAttr {
  return gaps.some((g) => g.resolution === 'filler') ? 'filler' : base;
}

function toView(row: GovProposalResponseAttributes): ResponseView {
  return {
    requirementId: row.requirement_id,
    status: row.status,
    content: row.content ?? '',
    figures: cleanFigures(row.figures),
    gaps: cleanGaps(row.gaps) as ResponseGap[],
    authoredByIdentityId: row.authored_by_identity_id ?? null,
    reviewedByIdentityId: row.reviewed_by_identity_id ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function findRow(deliveryProjectId: string, requirementId: string): Promise<any> {
  return GovProposalResponse.findOne({ where: { delivery_project_id: deliveryProjectId, requirement_id: requirementId } });
}

export interface SaveResponseInput {
  deliveryProjectId: string;
  requirementId: string;
  content: string;
  authoredByIdentityId?: string | null;
}

/** Author/edit a response. ANY edit sets status to `draft` (a changed answer is not reviewed/approved). Upsert. */
export async function saveProposalResponse(input: SaveResponseInput): Promise<ResponseView> {
  const deliveryProjectId = String(input.deliveryProjectId ?? '').trim();
  const requirementId = String(input.requirementId ?? '').trim();
  if (!deliveryProjectId || !requirementId) throw new ResponseError('Missing project/requirement identifiers.', 'bad_input');
  const content = String(input.content ?? '');
  const authored = input.authoredByIdentityId ? String(input.authoredByIdentityId).trim() || null : null;
  const existing = await findRow(deliveryProjectId, requirementId);
  if (existing) {
    const gaps = cleanGaps((existing.get({ plain: true }) as GovProposalResponseAttributes).gaps);
    await existing.update({ content, status: statusForGaps('draft', gaps), authored_by_identity_id: authored, updated_at: new Date() });
    return toView(existing.get({ plain: true }) as GovProposalResponseAttributes);
  }
  try {
    const row = await GovProposalResponse.create({
      delivery_project_id: deliveryProjectId, requirement_id: requirementId,
      content, status: 'draft', figures: [], gaps: [], authored_by_identity_id: authored, reviewed_by_identity_id: null,
    });
    return toView(row.get({ plain: true }) as GovProposalResponseAttributes);
  } catch (err) {
    const raced = await findRow(deliveryProjectId, requirementId);
    if (!raced) throw err;
    const gaps = cleanGaps((raced.get({ plain: true }) as GovProposalResponseAttributes).gaps);
    await raced.update({ content, status: statusForGaps('draft', gaps), authored_by_identity_id: authored, updated_at: new Date() });
    return toView(raced.get({ plain: true }) as GovProposalResponseAttributes);
  }
}

export interface DraftWithGapsInput {
  deliveryProjectId: string;
  requirementId: string;
  content: string;
  gaps: ResponseGap[];
  authoredByIdentityId?: string | null;
}

/**
 * Persist a Draft-with-AI result: the grounded draft `content` plus the typed gaps the AI could not answer. The
 * draft is ADVISORY - it always lands as `draft` (never reviewed/approved), and a filler gap marks it `filler`. It
 * upserts in place like saveProposalResponse.
 */
export async function saveDraftWithGaps(input: DraftWithGapsInput): Promise<ResponseView> {
  const deliveryProjectId = String(input.deliveryProjectId ?? '').trim();
  const requirementId = String(input.requirementId ?? '').trim();
  if (!deliveryProjectId || !requirementId) throw new ResponseError('Missing project/requirement identifiers.', 'bad_input');
  const content = String(input.content ?? '');
  const gaps = cleanGaps(input.gaps);
  const authored = input.authoredByIdentityId ? String(input.authoredByIdentityId).trim() || null : null;
  const status = statusForGaps('draft', gaps);
  const existing = await findRow(deliveryProjectId, requirementId);
  if (existing) {
    await existing.update({ content, gaps, status, authored_by_identity_id: authored, updated_at: new Date() });
    return toView(existing.get({ plain: true }) as GovProposalResponseAttributes);
  }
  const row = await GovProposalResponse.create({
    delivery_project_id: deliveryProjectId, requirement_id: requirementId,
    content, status, figures: [], gaps, authored_by_identity_id: authored, reviewed_by_identity_id: null,
  });
  return toView(row.get({ plain: true }) as GovProposalResponseAttributes);
}

export interface ResolveGapInput {
  deliveryProjectId: string;
  requirementId: string;
  gapId: string;
  resolution: 'open' | 'answered' | 'filler';
  answer?: string | null;
}

/**
 * Resolve one Draft-with-AI gap: `answered` with a real answer, or `filler` with a visible placeholder that BLOCKS
 * export until replaced. Recomputes the response status (filler if any filler gap remains, else draft) and clears
 * any prior review sign-off - a changed answer is not an approved one.
 */
export async function resolveProposalGap(input: ResolveGapInput): Promise<ResponseView> {
  const deliveryProjectId = String(input.deliveryProjectId ?? '').trim();
  const requirementId = String(input.requirementId ?? '').trim();
  const gapId = String(input.gapId ?? '').trim();
  if (!deliveryProjectId || !requirementId || !gapId) throw new ResponseError('Missing project/requirement/gap identifiers.', 'bad_input');
  if (input.resolution !== 'open' && input.resolution !== 'answered' && input.resolution !== 'filler') {
    throw new ResponseError('Resolution must be open, answered, or filler.', 'bad_resolution');
  }
  if (input.resolution === 'answered' && !String(input.answer ?? '').trim()) {
    throw new ResponseError('An answered gap needs an answer.', 'empty_answer');
  }
  const row = await findRow(deliveryProjectId, requirementId);
  if (!row) throw new ResponseError('No response for this requirement.', 'not_found');
  const plain = row.get({ plain: true }) as GovProposalResponseAttributes;
  const gaps = cleanGaps(plain.gaps);
  const gap = gaps.find((g) => g.id === gapId);
  if (!gap) throw new ResponseError('No such gap on this response.', 'gap_not_found');
  gap.resolution = input.resolution;
  if (input.resolution === 'answered') gap.answer = String(input.answer); else delete gap.answer;
  await row.update({ gaps, status: statusForGaps('draft', gaps), reviewed_by_identity_id: null, updated_at: new Date() });
  return toView(row.get({ plain: true }) as GovProposalResponseAttributes);
}

export type ReviewDecision = 'reviewed' | 'approved' | 'revision_required';
export interface ReviewResponseInput {
  deliveryProjectId: string;
  requirementId: string;
  decision: ReviewDecision;
  reviewerIdentityId?: string | null;
}

/**
 * Advance the lifecycle. The ORDER is the rail: `reviewed` only from `draft` (and only with content), `approved`
 * only from `reviewed`, `revision_required` from any authored state. An illegal jump (e.g. draft → approved) is
 * refused — the review step cannot be skipped.
 */
export async function reviewProposalResponse(input: ReviewResponseInput): Promise<ResponseView> {
  const deliveryProjectId = String(input.deliveryProjectId ?? '').trim();
  const requirementId = String(input.requirementId ?? '').trim();
  if (!deliveryProjectId || !requirementId) throw new ResponseError('Missing project/requirement identifiers.', 'bad_input');
  if (input.decision !== 'reviewed' && input.decision !== 'approved' && input.decision !== 'revision_required') {
    throw new ResponseError('Decision must be reviewed, approved, or revision_required.', 'bad_decision');
  }
  const row = await findRow(deliveryProjectId, requirementId);
  if (!row) throw new ResponseError('No response to review for this requirement.', 'not_found');
  const plain = row.get({ plain: true }) as GovProposalResponseAttributes;

  if (input.decision === 'reviewed') {
    if (plain.status !== 'draft') throw new ResponseError('Only a draft can be marked reviewed.', 'not_draft');
    if (!String(plain.content ?? '').trim()) throw new ResponseError('An empty response cannot be reviewed.', 'empty_content');
  } else if (input.decision === 'approved') {
    if (plain.status !== 'reviewed') throw new ResponseError('A response must be reviewed before it can be approved.', 'not_reviewed');
  }
  // revision_required is allowed from any authored state (draft/reviewed/approved) — the kickback.

  const reviewer = input.reviewerIdentityId ? String(input.reviewerIdentityId).trim() || null : null;
  await row.update({ status: input.decision, reviewed_by_identity_id: reviewer, updated_at: new Date() });
  return toView(row.get({ plain: true }) as GovProposalResponseAttributes);
}

export interface FigureInput {
  deliveryProjectId: string;
  requirementId: string;
  figure: { commit: string; ref: string; caption?: string };
}

/** Attach a COMMIT-BOUND figure to a response. A figure with no commit (unprovenanced) is refused. Resets to draft. */
export async function addProposalFigure(input: FigureInput): Promise<ResponseView> {
  const deliveryProjectId = String(input.deliveryProjectId ?? '').trim();
  const requirementId = String(input.requirementId ?? '').trim();
  if (!deliveryProjectId || !requirementId) throw new ResponseError('Missing project/requirement identifiers.', 'bad_input');
  const commit = String(input.figure?.commit ?? '').trim();
  const ref = String(input.figure?.ref ?? '').trim();
  const caption = String(input.figure?.caption ?? '').trim();
  if (!commit) throw new ResponseError('A figure must be bound to a commit.', 'figure_not_commit_bound');
  if (!ref) throw new ResponseError('A figure reference is required.', 'figure_no_ref');
  const row = await findRow(deliveryProjectId, requirementId);
  if (!row) throw new ResponseError('Author a response before attaching a figure.', 'not_found');
  const plain = row.get({ plain: true }) as GovProposalResponseAttributes;
  const figures = [...cleanFigures(plain.figures), { commit, ref, caption }];
  await row.update({ figures, status: 'draft', updated_at: new Date() }); // the answer changed → re-review
  return toView(row.get({ plain: true }) as GovProposalResponseAttributes);
}

/** Remove a figure by its ref. Resets to draft (the answer changed). Idempotent on a missing ref. */
export async function removeProposalFigure(deliveryProjectId: string, requirementId: string, ref: string): Promise<ResponseView> {
  if (!deliveryProjectId || !requirementId) throw new ResponseError('Missing project/requirement identifiers.', 'bad_input');
  const row = await findRow(deliveryProjectId, requirementId);
  if (!row) throw new ResponseError('No response for this requirement.', 'not_found');
  const plain = row.get({ plain: true }) as GovProposalResponseAttributes;
  const figures = cleanFigures(plain.figures).filter((f) => f.ref !== ref);
  await row.update({ figures, status: 'draft', updated_at: new Date() });
  return toView(row.get({ plain: true }) as GovProposalResponseAttributes);
}

/** All authored responses for a delivery project — to overlay onto the derived slots. */
export async function listProposalResponses(deliveryProjectId: string): Promise<ResponseView[]> {
  if (!deliveryProjectId) return [];
  const rows = await GovProposalResponse.findAll({ where: { delivery_project_id: deliveryProjectId } });
  return rows.map((r) => toView(r.get({ plain: true }) as GovProposalResponseAttributes));
}
