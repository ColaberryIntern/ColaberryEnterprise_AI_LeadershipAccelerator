/**
 * responseSlots — the proposal's response CHECKLIST, derived DETERMINISTICALLY from the established
 * requirements. Every requirement the bid must answer gets exactly one slot that CITES the requirement it
 * addresses (its id + the source document reference the requirement was established from). This is the
 * "response-slots with citations" structure: it makes explicit, per requirement, that a response is owed.
 *
 * HONESTY RAIL: a slot is `unanswered` and never fabricated into a done/answered state — no response-authoring
 * exists yet (that, plus the manual add-a-slot path, is the follow-on that ships with the workspace UI). The
 * citation is whatever the established requirement actually carries (its `evidenceRef` doc reference); it is
 * never invented, and is null when the requirement records no source reference.
 *
 * PURE + TOTAL: no I/O, never throws; a non-array / garbage input yields [].
 */
import { classifySubmittalBucket, type SubmittalBucketKey } from './submittalBuckets';
import { isEliminationRisk } from './eliminationRisk';
/**
 * A slot is `unanswered` until a response is authored; then it carries the response's review lifecycle. The agent
 * never fabricates a reviewed/approved state — `reviewed`/`approved` are set only by explicit human review, and a
 * material amendment flips an affected answer to `revision_required`.
 */
export type ProposalResponseStatus = 'unanswered' | 'draft' | 'reviewed' | 'approved' | 'revision_required' | 'filler';

/** A figure attached to a response, bound to the git commit it was captured at (the provenance). */
export interface ResponseFigure {
  commit: string;
  ref: string;
  caption: string;
}

/**
 * P5 Draft-with-AI: a typed GAP the draft could not answer from grounded facts. The AI never invents the fact - it
 * inserts a question. `resolution` is how the human closed it: `answered` with a real answer, or `filler` with a
 * placeholder that is visibly red and BLOCKS export/submission server-side until it is replaced. `open` is unanswered.
 */
export interface ResponseGap {
  id: string;
  question: string;
  suggestions: string[];
  resolution: 'open' | 'answered' | 'filler';
  answer?: string;
}

export interface ResponseSlot {
  /** The established requirement this slot answers — the join key to the requirement and a stored response. */
  requirementId: string;
  /** The requirement text, for display. */
  statement: string;
  /** The source document reference the requirement was established from (its citation anchor); null if none. */
  sourceRef: string | null;
  /** `unanswered` when no response is authored; otherwise the authored response's lifecycle status. */
  status: ProposalResponseStatus;
  /** Which of the 8 SUBMITTAL categories this response belongs to (the proposal volume/tab model), so the flat
   *  checklist groups into a manageable <=10 set. Derived deterministically from the requirement text + section.
   *  Optional at the type level (resilience for externally-built slot literals); deriveResponseSlots always sets it. */
  bucket?: SubmittalBucketKey;
  /** True when the requirement's own text says missing it REJECTS the bid (non-responsive / disqualified /
   *  material failure / pass-fail). Advisory flag so the checklist shows what CANNOT be missed; it never gates
   *  export. Derived deterministically; optional at the type level like `bucket`. */
  eliminationRisk?: boolean;
  /** The authored response content (only when a response exists). */
  content?: string;
  /** Commit-bound figures on the response. */
  figures?: ResponseFigure[];
  /** Draft-with-AI gaps the author must resolve; a `filler` gap blocks submission (see evaluateSubmissionReadiness). */
  gaps?: ResponseGap[];
  authoredByIdentityId?: string | null;
  reviewedByIdentityId?: string | null;
  updatedAt?: string | null;
}

/** The minimal structural shape of a persisted response — kept local so this pure module never imports the DB layer. */
export interface ResponseOverlay {
  requirementId: string;
  status: Exclude<ProposalResponseStatus, 'unanswered'>;
  content: string;
  figures: ResponseFigure[];
  gaps: ResponseGap[];
  authoredByIdentityId: string | null;
  reviewedByIdentityId: string | null;
  updatedAt: string | null;
}

/** Derive one cited response slot per established requirement, in order, de-duplicated by requirement id. */
export function deriveResponseSlots(established: any[]): ResponseSlot[] {
  const rows = Array.isArray(established) ? established : [];
  const slots: ResponseSlot[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    const requirementId = String(r.id ?? r.canonicalReqId ?? r.canonical_req_id ?? '').trim();
    if (!requirementId || seen.has(requirementId)) continue; // a slot must anchor to a real requirement id
    seen.add(requirementId);
    const ref = r.evidenceRef ?? r.evidence_ref ?? null;
    const docId = ref && (ref.docId ?? ref.doc_id);
    const sourceRef = docId ? String(docId) : null;
    const statement = String(r.text ?? r.statement ?? '');
    slots.push({
      requirementId,
      statement,
      sourceRef,
      status: 'unanswered',
      bucket: classifySubmittalBucket({ text: statement, section: r.section ?? r.sectionRef ?? null }),
      eliminationRisk: isEliminationRisk({ text: statement, section: r.section ?? r.sectionRef ?? null }),
    });
  }
  return slots;
}

/**
 * Overlay persisted responses onto the derived slots — PURE. A slot with a matching response carries that
 * response's lifecycle status + content + figures; a slot with none stays `unanswered` (the honesty rail: no
 * response ⇒ unanswered, never a fabricated draft/approved). Order + identity are the derived slots'; a response
 * for a requirement no longer in the slot set is simply dropped (the requirement left the established set).
 */
export function applyResponsesToSlots(slots: ResponseSlot[], responses: ResponseOverlay[]): ResponseSlot[] {
  const byReq = new Map<string, ResponseOverlay>();
  for (const r of Array.isArray(responses) ? responses : []) if (r && r.requirementId) byReq.set(r.requirementId, r);
  return (Array.isArray(slots) ? slots : []).map((s) => {
    const r = byReq.get(s.requirementId);
    if (!r) return { ...s, status: 'unanswered' as const, content: '', figures: [], gaps: [], authoredByIdentityId: null, reviewedByIdentityId: null, updatedAt: null };
    return {
      ...s,
      status: r.status,
      content: r.content ?? '',
      figures: Array.isArray(r.figures) ? r.figures : [],
      gaps: Array.isArray(r.gaps) ? r.gaps : [],
      authoredByIdentityId: r.authoredByIdentityId ?? null,
      reviewedByIdentityId: r.reviewedByIdentityId ?? null,
      updatedAt: r.updatedAt ?? null,
    };
  });
}
