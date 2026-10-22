/**
 * mergeCandidates — union the deterministic requirements with the quote-VERIFIED AI candidates into one list. The
 * deterministic rows are kept EXACTLY as-is (same ids, same order), and AI candidates are APPENDED after them,
 * continuing the REQ-NNN sequence. An AI candidate whose verbatim quote duplicates an already-captured sentence is
 * dropped (no double-count). This ordering is what guarantees the flag-off path is byte-identical: with no AI
 * candidates, the output IS the deterministic list unchanged.
 *
 * PURE + TOTAL: no I/O, never throws. The merged requirement's `extractedText` is the VERIFIED verbatim quote, so
 * the honesty rail holds — every row still cites text that literally exists in the source.
 */
import type { ExtractedRequirement } from './proposalExtractor';
import type { VerifiedCandidate } from './verifyQuotes';

const normDedup = (s: string): string => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function mergeCandidates(
  deterministic: ExtractedRequirement[],
  verified: VerifiedCandidate[],
  cap = 200,
): ExtractedRequirement[] {
  const det = Array.isArray(deterministic) ? deterministic : [];
  const out: ExtractedRequirement[] = [...det];
  // Dedup against every verbatim sentence already captured, so an AI quote equal to a deterministic one is skipped.
  const seen = new Set(det.map((r) => normDedup(r.extractedText)));
  let n = det.length; // REQ-NNN continues from the count of deterministic rows (ids are contiguous REQ-001..REQ-N)

  for (const v of Array.isArray(verified) ? verified : []) {
    if (out.length >= cap) break;
    if (!v || typeof v.quote !== 'string') continue;
    const norm = normDedup(v.quote);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    n += 1;
    out.push({
      canonicalReqId: `REQ-${String(n).padStart(3, '0')}`,
      statement: String(v.statement || v.quote).slice(0, 500),
      kind: 'compliance',
      priority: 'must',
      tracks: ['proposal', 'solution_build'],
      sourceDocument: v.document,
      section: v.document,
      extractedText: v.quote, // the VERIFIED verbatim source quote — the honesty rail
      interpretation: null,
      humanConfirmed: false,
      evidenceState: 'unassessed',
      sourceEvidence: [],
    });
  }
  return out;
}
