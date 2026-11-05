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
}

export interface ProposalReadiness {
  pct: number;
  passing: number;
  total: number;
}

/** Count the scored, in-scope documents that pass, and the readiness percentage. Pure + total. */
export function proposalReadiness(docs: ReadinessDoc[]): ProposalReadiness {
  const eligible = (Array.isArray(docs) ? docs : []).filter(
    (d) => d && !d.adminOnly && !d.superseded && d.docType !== 'form',
  );
  const total = eligible.length;
  const passing = eligible.filter((d) => d.passes === true).length;
  const pct = total === 0 ? 0 : Math.round((passing / total) * 100);
  return { pct, passing, total };
}
