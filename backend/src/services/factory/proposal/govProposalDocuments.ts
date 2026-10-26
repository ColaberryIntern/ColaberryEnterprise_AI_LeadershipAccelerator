/**
 * govProposalDocuments — DERIVE the solicitation-named documents a bid must submit, from the established
 * requirements. There is no stored list of required documents anywhere (the dossier tracks the solicitation's own
 * ingested files, not the bidder's submittals), so we derive it: each requirement that is a SUBMITTAL obligation is
 * routed to the named document it belongs to (Cover Letter, Technical Proposal, Price/Cost Proposal, Past
 * Performance, HUB Plan, Reps & Certs, …), and the requirements become the points that document must cover.
 *
 * This is the PROPOSAL half of the cockpit v2: one task per named DOCUMENT (the AI drafts each → PDF → reviewer
 * accepts), NOT one task per requirement and NOT the 8 generic FAR volumes. A `scope` requirement is NOT a
 * submittal — it is BUILD work — so it never becomes a proposal document. Pure + deterministic + total: same
 * requirements in, same documents out, which is what makes it unit-testable.
 *
 * TRUST BOUNDARY: a document may be `adminOnly` (pricing), which the student-safe projection drops — an intern
 * never sees or works the price document (pricing is the admin's decision), exactly as the per-requirement view
 * already drops pricing.
 */
import { classifyRequirementCategory } from './govRequirementItems';

export interface ProposalDocumentRule {
  key: string;
  title: string;
  order: number;
  /** A missing one is usually a non-responsive rejection — surfaced as a hard gate (advisory). */
  gate: boolean;
  /** Pricing is admin-only; the student-safe projection drops it. */
  adminOnly: boolean;
  pattern: RegExp;
}

// Specific documents first; the first matching rule wins. Titles are the names a proposal manager recognizes.
export const DOCUMENT_RULES: ProposalDocumentRule[] = [
  { key: 'cover_letter', title: 'Cover Letter / Transmittal', order: 1, gate: false, adminOnly: false, pattern: /\b(cover\s+letter|transmittal\s+letter|letter\s+of\s+transmittal)\b/i },
  { key: 'execution_offer', title: 'Execution of Offer & Signature Forms', order: 2, gate: true, adminOnly: false, pattern: /\b(execution\s+of\s+offer|SF[-\s]?33|SF[-\s]?1449|standard\s+form\s+33|signature\s+(?:page|of\s+(?:an?\s+)?authorized)|signed\s+(?:and\s+dated|offer|proposal))\b/i },
  { key: 'reps_certs', title: 'Representations & Certifications', order: 3, gate: true, adminOnly: false, pattern: /\b(representations?\s+and\s+certifications?|reps?\s+and\s+certs?|SAM\.gov|E-?Verify|section\s+889|conflict\s+of\s+interest|non[-\s]?collusion|debarment|suspension|W-?9|form\s+1295|lobbying|good\s+standing)\b/i },
  { key: 'pricing', title: 'Price / Cost Proposal', order: 4, gate: true, adminOnly: true, pattern: /\b(pricing\s+(?:sheet|schedule|form|proposal|page|table)|price\s+(?:proposal|schedule|sheet|form)|cost\s+proposal|fee\s+schedule|cost\s+(?:breakdown|element|sheet)|not[-\s]?to[-\s]?exceed|unit\s+price|hourly\s+rate|total\s+(?:bid|proposed)\s+price)\b/i },
  // Specific-signal documents are matched BEFORE the broader experience/management ones (a "HUB plan references"
  // line must file under the HUB plan, not Past Performance). `order` keeps the DISPLAY in proposal-volume order.
  { key: 'socioeconomic', title: 'HUB / Small Business Subcontracting Plan', order: 7, gate: true, adminOnly: false, pattern: /\b(hub\s+subcontract|subcontracting\s+plan|historically\s+underutilized|\bHUB\b|\bDBE\b|\bMBE\b|\bWBE\b|\bSBE\b|small\s+business\s+(?:plan|participation|subcontracting|goal)|minority[-\s]?owned|wom[ae]n[-\s]?owned)\b/i },
  { key: 'financial', title: 'Financial Responsibility & Insurance', order: 8, gate: false, adminOnly: false, pattern: /\b(financial\s+statement|audited\s+financial|certificate\s+of\s+insurance|proof\s+of\s+insurance|insurance\s+(?:coverage|requirement|certificate)|general\s+liability\s+insurance|bonding\s+capacity|performance\s+bond|payment\s+bond|surety|dun\s*&?\s*bradstreet|\bD&B\b)\b/i },
  { key: 'past_performance', title: 'Past Performance & References', order: 5, gate: false, adminOnly: false, pattern: /\b(past\s+performance|\breferences\b|corporate\s+experience|similar\s+(?:contracts?|projects?|scope|engagements?)|prior\s+(?:contracts?|experience|projects?)|\bCPARS\b)\b/i },
  { key: 'management', title: 'Management & Staffing Plan', order: 6, gate: false, adminOnly: false, pattern: /\b(key\s+personnel|r[eé]sum[eé]s?|staffing\s+(?:plan|profile)|project\s+manager|organization(?:al)?\s+chart|management\s+(?:plan|approach|structure)|transition\s+plan|implementation\s+plan|personnel\s+qualif)\b/i },
  { key: 'compliance_matrix', title: 'Compliance Matrix', order: 9, gate: false, adminOnly: false, pattern: /\b(compliance\s+matrix|requirements?\s+(?:traceability|compliance)\s+matrix|cross[-\s]?reference\s+matrix)\b/i },
  { key: 'terms', title: 'Terms & Conditions Response', order: 10, gate: false, adminOnly: false, pattern: /\b(terms\s+and\s+conditions|exceptions?\s+to\s+the\s+(?:terms|conditions|contract|clause))\b/i },
  // Default: the solution narrative. A submittal obligation that matches nothing specific is a technical response.
  { key: 'technical', title: 'Technical Proposal', order: 11, gate: false, adminOnly: false, pattern: /.*/ },
];

const ruleFor = (statement: string): ProposalDocumentRule => DOCUMENT_RULES.find((d) => d.pattern.test(statement)) ?? DOCUMENT_RULES[DOCUMENT_RULES.length - 1];

export interface ProposalDocumentReq { canonicalReqId: string; statement: string; }
export interface ProposalDocument {
  key: string;
  title: string;
  order: number;
  gate: boolean;
  adminOnly: boolean;
  /** The requirements this document must cover — the AI's grounding, and the reviewer's checklist. */
  requirements: ProposalDocumentReq[];
}

/**
 * Derive the named proposal documents from the established requirements. A `scope` requirement is build work, not a
 * submittal, so it is excluded. Every other requirement is routed to exactly one named document; a document with no
 * requirements is not created. Returned in proposal-volume order. Pure + total (garbage ⇒ []).
 */
export function deriveProposalDocuments(established: any[]): ProposalDocument[] {
  const byKey = new Map<string, ProposalDocument>();
  for (const r of Array.isArray(established) ? established : []) {
    if (!r) continue;
    const statement = String(r.statement ?? r.text ?? '').trim();
    const canonicalReqId = String(r.canonical_req_id ?? r.canonicalReqId ?? r.id ?? '').trim();
    if (!statement || !canonicalReqId) continue;
    const kind = String(r.kind ?? '').trim().toLowerCase();
    // A scope requirement is build work (solution_build), never a submittal document.
    if (kind !== 'pricing' && classifyRequirementCategory(statement) === 'scope') continue;
    // A pricing-kind requirement is always the price document, whatever its wording.
    const rule = kind === 'pricing' ? (DOCUMENT_RULES.find((d) => d.key === 'pricing') as ProposalDocumentRule) : ruleFor(statement);
    let doc = byKey.get(rule.key);
    if (!doc) { doc = { key: rule.key, title: rule.title, order: rule.order, gate: rule.gate, adminOnly: rule.adminOnly, requirements: [] }; byKey.set(rule.key, doc); }
    if (!doc.requirements.some((x) => x.canonicalReqId === canonicalReqId)) doc.requirements.push({ canonicalReqId, statement });
  }
  return [...byKey.values()].sort((a, b) => a.order - b.order);
}
