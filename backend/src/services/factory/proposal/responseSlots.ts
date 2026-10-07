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
export interface ResponseSlot {
  /** The established requirement this slot answers — the join key to the requirement and (later) a stored response. */
  requirementId: string;
  /** The requirement text, for display. */
  statement: string;
  /** The source document reference the requirement was established from (its citation anchor); null if none. */
  sourceRef: string | null;
  /** First-pass: authoring is not built yet, so every slot is honestly unanswered — never a fabricated "done". */
  status: 'unanswered';
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
    slots.push({
      requirementId,
      statement: String(r.text ?? r.statement ?? ''),
      sourceRef,
      status: 'unanswered',
    });
  }
  return slots;
}
