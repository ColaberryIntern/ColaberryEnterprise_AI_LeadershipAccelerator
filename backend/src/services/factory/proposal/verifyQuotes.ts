/**
 * verifyQuotes — THE trust rail for AI-proposed requirements. An AI candidate survives ONLY if its `quote`
 * LITERALLY appears in the cited document's source text (after light, meaning-preserving normalization). This is
 * how "never fabricate" is enforced by CODE, not by trusting the model: the model can point, only the source text
 * can confirm. A quote found in a DIFFERENT provided document is kept with the document corrected. A quote found
 * nowhere is dropped and counted.
 *
 * PURE + TOTAL: no I/O, never throws; garbage in -> everything dropped. Mirrors the drop-on-fail `sanitize*`
 * convention of govProposalDraftAI / govCapabilityFit (a pure guardrail, unit-tested directly).
 */

export interface AiRequirementCandidate {
  /** The model's plain-language restatement of the obligation (display). */
  statement: string;
  /** The VERBATIM source snippet the model cites — the thing this rail verifies. */
  quote: string;
  /** The file the model says the quote came from. */
  document: string;
  /** Optional model hints (advisory; never trusted for the citation itself). */
  category?: string;
  eliminationRisk?: boolean;
}

export interface VerifiedCandidate extends AiRequirementCandidate {
  /** The document the quote was ACTUALLY found in (may differ from the model's cited `document`). */
  document: string;
  documentCorrected: boolean;
}

export type DropReason = 'too_short' | 'not_found' | 'no_source' | 'malformed';

/** A quote shorter than this is rejected: too easy to match a few words by accident, which would let a paraphrase
 *  smuggle through. The rail's value is that a KEPT quote is a real, substantial span of the source. */
export const MIN_QUOTE_LEN = 25;

/** Normalize for matching WITHOUT changing meaning: unify curly/straight quotes, drop soft hyphens, undo
 *  line-wrap hyphenation ("manage-\nment" -> "management"), collapse whitespace, lowercase. */
export function normalizeForMatch(s: string): string {
  return String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/­/g, '')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function verifyQuotes(
  candidates: AiRequirementCandidate[],
  perFile: { name: string; text: string }[],
): { kept: VerifiedCandidate[]; dropped: Array<{ candidate: AiRequirementCandidate; reason: DropReason }> } {
  const files = (Array.isArray(perFile) ? perFile : [])
    .filter((f) => f && typeof f.name === 'string')
    .map((f) => ({ name: f.name, norm: normalizeForMatch(f.text) }));
  const kept: VerifiedCandidate[] = [];
  const dropped: Array<{ candidate: AiRequirementCandidate; reason: DropReason }> = [];

  for (const c of Array.isArray(candidates) ? candidates : []) {
    if (!c || typeof c.quote !== 'string' || typeof c.statement !== 'string') {
      dropped.push({ candidate: c, reason: 'malformed' });
      continue;
    }
    const q = normalizeForMatch(c.quote);
    if (q.length < MIN_QUOTE_LEN) { dropped.push({ candidate: c, reason: 'too_short' }); continue; }
    if (files.length === 0) { dropped.push({ candidate: c, reason: 'no_source' }); continue; }

    // Prefer the cited document; fall back to ANY provided document (the model may mis-cite the file, but the
    // quote must still exist SOMEWHERE in the source). Found nowhere -> dropped.
    const cited = files.find((f) => f.name === c.document);
    let foundIn: string | null = cited && cited.norm.includes(q) ? cited.name : null;
    if (!foundIn) { const any = files.find((f) => f.norm.includes(q)); foundIn = any ? any.name : null; }
    if (!foundIn) { dropped.push({ candidate: c, reason: 'not_found' }); continue; }

    kept.push({ ...c, document: foundIn, documentCorrected: foundIn !== c.document });
  }
  return { kept, dropped };
}
