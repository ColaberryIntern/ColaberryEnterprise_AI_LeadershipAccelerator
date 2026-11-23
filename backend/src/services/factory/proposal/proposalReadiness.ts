/**
 * proposalReadiness — the PURE readiness meter behind the Proposal Studio header ("Proposal ready x% / 95%") and the
 * Where-we-are card ("N of M documents pass"). It counts how many SCORED proposal documents pass the six-check rule,
 * over the documents that must actually reach 95%:
 *   - pricing / admin-only documents are excluded (an intern never sees them; they are not part of the score meter);
 *   - `superseded` ("No longer required") documents are excluded (C.1);
 *   - FORM documents (signature forms) are excluded — a form is SIGNED, not scored to 95%, so counting it would make
 *     the meter structurally unreachable. (Form readiness is tracked by the signature gate, not this meter.)
 * `passing` = eligible docs whose latest version passes; `pct` = round(passing / total * 100), 0 when there are no
 * scored documents. Pure + total: same input ⇒ same output, garbage ⇒ an empty-but-valid readiness.
 *
 * NOTE (U1): the exact scored-doc set is reconciled against the approved design in U2 when the Document-set/header UI
 * is built; this backend meter is the single source the header + Where-we-are read, replacing the old build-stories +
 * accepted-docs "Overall completion" tile (spec §C.2).
 */

/** The minimal document shape the readiness meter reads (a down-projection of the projection's per-doc summary). */
export interface ReadinessDoc {
  /** Pricing / admin-only — excluded from the meter. */
  adminOnly: boolean;
  /** "No longer required" (C.1) — excluded from the meter. */
  superseded?: boolean;
  /** Document provenance; FORM docs are signed, not scored, so they are excluded. */
  docType?: string;
  /** Whether this document's latest version passes the six-check rule. */
  passes: boolean;
  /** The document's weighted check score (0-100), from its latest version. When provided, the meter is the GRADUATED
   *  average of these (so it moves with quality, like the per-document bars). A document with no scored version yet
   *  contributes 0. Optional so a caller that only knows pass/fail still gets the old pass-fraction meter. */
  score?: number;
}

export interface ProposalReadiness {
  pct: number;
  passing: number;
  total: number;
}

/**
 * The readiness percentage + the pass count over the scored, in-scope documents. Pure + total.
 *
 * `pct` is the GRADUATED average of the documents' weighted scores when any score is provided — so a substantive draft
 * (every document near its target) reads as nearly ready instead of 0% until the last check flips a binary pass. This
 * fixes the gauge sitting at 0% on a proposal that is clearly most of the way there: the pass gate is all-or-nothing
 * (a single open gap or a sub-85 check fails the whole document), but the meter should reflect how close each document
 * is. A document with no scored version yet contributes 0, so un-drafted work honestly pulls the number down. When no
 * caller supplies scores, `pct` falls back to the old pass fraction. `passing`/`total` are always the pass count.
 */
export function proposalReadiness(docs: ReadinessDoc[]): ProposalReadiness {
  const eligible = (Array.isArray(docs) ? docs : []).filter(
    (d) => d && !d.adminOnly && !d.superseded && d.docType !== 'form',
  );
  const total = eligible.length;
  const passing = eligible.filter((d) => d.passes === true).length;
  if (total === 0) return { pct: 0, passing, total };
  const anyScore = eligible.some((d) => typeof d.score === 'number');
  const pct = anyScore
    ? Math.round(eligible.reduce((a, d) => a + (typeof d.score === 'number' ? Math.max(0, Math.min(100, d.score)) : 0), 0) / total)
    : Math.round((passing / total) * 100);
  return { pct, passing, total };
}
