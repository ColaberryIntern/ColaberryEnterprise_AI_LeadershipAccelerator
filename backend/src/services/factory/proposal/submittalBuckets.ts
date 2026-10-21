/**
 * submittalBuckets — group the flat proposal response requirements into the <=10 SUBMITTAL categories a real
 * government proposal is physically organized into (the "volume / tab" model), so an operator sees a manageable
 * checklist instead of a wall of 80+ line-items.
 *
 * WHY THESE EIGHT. This taxonomy is NOT invented: it is the structure FAR 15.204-5 (Sections K/L/M) names and
 * that real solicitations impose (48 CFR 1352.215-70 Volumes I/II/III; the Texas Workforce Commission Response
 * Packages; the Mississippi ITS RFP submission checklist). Every requirement answers one question - "which volume
 * would a proposal manager file this under?" - which makes the routing deterministic and mutually exclusive.
 *
 * PURE + DETERMINISTIC + TOTAL: no LLM, no I/O, never throws. Same text in, same bucket out - which is what makes
 * it unit-testable. Nothing here GATES anything; the bucket is an advisory grouping over the response checklist.
 * The server's real gates still read the established requirements and the authored responses.
 */

export type SubmittalBucketKey =
  | 'admin'
  | 'certs'
  | 'technical'
  | 'management'
  | 'experience'
  | 'price'
  | 'financial'
  | 'socioeconomic';

export interface SubmittalBucket {
  key: SubmittalBucketKey;
  /** Full label for the group header. */
  label: string;
  /** Short label for a chip / audit tile. */
  short: string;
  /** Display order (the natural proposal-volume flow). */
  order: number;
  /**
   * A typical PASS/FAIL gate: in most solicitations a missing item in this category is a rejection
   * (non-responsive), not merely a low score - so the audit surfaces it as a hard gate. Advisory only.
   */
  gate: boolean;
}

/** The eight submittal categories, in proposal-volume order. Keep in sync with the frontend mirror in
 *  frontend/src/pages/admin/govWorkspace/proposalSubmittal.tsx (no shared module across the two builds). */
export const SUBMITTAL_BUCKETS: SubmittalBucket[] = [
  { key: 'admin',         label: 'Administrative & Offer Forms',                 short: 'Admin & Forms',    order: 1, gate: true },
  { key: 'certs',         label: 'Representations, Certifications & Compliance',  short: 'Reps & Certs',     order: 2, gate: true },
  { key: 'technical',     label: 'Technical / Solution Approach',                short: 'Technical',        order: 3, gate: false },
  { key: 'management',    label: 'Management, Staffing & Key Personnel',         short: 'Management',       order: 4, gate: false },
  { key: 'experience',    label: 'Experience & Past Performance',                short: 'Past Performance', order: 5, gate: false },
  { key: 'price',         label: 'Price / Cost Proposal',                        short: 'Price / Cost',     order: 6, gate: true },
  { key: 'financial',     label: 'Financial Responsibility & Insurance',         short: 'Financial',        order: 7, gate: false },
  { key: 'socioeconomic', label: 'Small Business / Socioeconomic',               short: 'Socioeconomic',    order: 8, gate: true },
];

const BUCKET_BY_KEY: Record<SubmittalBucketKey, SubmittalBucket> =
  SUBMITTAL_BUCKETS.reduce((m, b) => { m[b.key] = b; return m; }, {} as Record<SubmittalBucketKey, SubmittalBucket>);

export function submittalBucket(key: SubmittalBucketKey): SubmittalBucket {
  return BUCKET_BY_KEY[key];
}

// Word-boundary-anchored, specific signals per category. Deliberately NOT bare words ("cost", "bond", "comply")
// that bleed across categories - each phrase is one a proposal manager would recognize as filing-defining.
const SIGNALS: Record<SubmittalBucketKey, RegExp> = {
  // Mandated small-business / socioeconomic participation plans (often pass/fail by statute).
  socioeconomic: /\b(hub\s+subcontract|subcontracting\s+plan|historically\s+underutilized|\bHUB\b|\bDBE\b|\bMBE\b|\bWBE\b|\bSBE\b|minority[-\s]?owned|wom[ae]n[-\s]?owned|disadvantaged\s+business|small\s+business\s+(?:plan|participation|subcontracting|goal)|socioeconomic)\b/i,
  // The money - a physically separate volume so it cannot bias the technical score.
  price: /\b(cost\s+proposal|price\s+proposal|pricing\s+(?:schedule|sheet|form|page|table)|price\s+(?:schedule|sheet|form)|fee\s+schedule|cost\s+(?:breakdown|information|element|sheet|form)|not[-\s]?to[-\s]?exceed|hourly\s+rate|unit\s+price|total\s+(?:bid|proposed)\s+price|cost\/price)\b/i,
  // Can the firm afford to perform and carry the required risk coverage.
  financial: /\b(financial\s+statement|audited\s+financial|balance\s+sheet|certificate\s+of\s+insurance|proof\s+of\s+insurance|insurance\s+(?:coverage|requirement|certificate)|general\s+liability\s+insurance|bonding\s+capacity|performance\s+bond|payment\s+bond|surety|dun\s*&?\s*bradstreet|\bD&B\b|credit\s+(?:report|rating))\b/i,
  // WHO does the work and how it is run (people + org). Tested before experience so a RESUME files here.
  management: /\b(key\s+personnel|r[eé]sum[eé]s?|staffing\s+(?:plan|profile)|project\s+manager|organization(?:al)?\s+chart|management\s+(?:plan|approach|structure)|transition\s+plan|implementation\s+plan|personnel\s+qualif|percent(?:age)?\s+of\s+time|%\s+of\s+time|staff\s+assigned)\b/i,
  // Evidence the FIRM has done similar work before.
  experience: /\b(past\s+performance|\breferences\b|similar\s+(?:contracts?|projects?|scope|engagements?|work)|corporate\s+experience|prior\s+(?:contracts?|experience|projects?)|relevant\s+(?:experience|projects?|contracts?)|years?\s+of\s+experience|\bCPARS\b|previous(?:ly)?\s+(?:performed|completed))\b/i,
  // Statutory / regulatory attestations about the firm's legal status and eligibility.
  certs: /\b(representations?\s+and\s+certifications?|reps?\s+and\s+certs?|SAM\.gov|System\s+for\s+Award\s+Management|E-?Verify|section\s+889|\bNDAA\b|conflict\s+of\s+interest|non[-\s]?collusion|debarment|suspension|certif(?:y|ication|icate)\s+(?:of|that)|W-?9|good\s+standing|authority\s+to\s+(?:do\s+business|sell)|terms\s+and\s+conditions|exceptions?\s+to\s+the\s+(?:terms|conditions|contract|clause)|lobbying|ethics\s+commission|form\s+1295)\b/i,
  // The paperwork that makes the bid a valid, signed, processable offer.
  admin: /\b(cover\s+letter|transmittal\s+letter|letter\s+of\s+transmittal|execution\s+of\s+offer|signed\s+(?:offer|proposal|and\s+dated)|signature\s+(?:page|of\s+(?:an?\s+)?authorized)|SF[-\s]?33|SF[-\s]?1449|standard\s+form\s+33|table\s+of\s+contents|number\s+of\s+copies|(?:one|two|three|\d+)\s+(?:original|cop(?:y|ies))|acknowledge(?:ment)?\s+(?:of\s+)?(?:all\s+)?(?:amendments?|addenda)|validity\s+period|valid\s+for\s+\d+\s+(?:days|calendar)|bid\s+bond|proposal\s+bond|proposal\s+format|submission\s+format)\b/i,
  // The solution narrative. Broadest, and the default when nothing more specific matches.
  technical: /\b(technical\s+(?:proposal|approach|narrative|response|volume)|methodolog|work\s+plan|scope\s+of\s+work|\bSOW\b|specifications?|deliverable|understanding\s+of|project\s+approach|sample\s+(?:deliverable|work|report)|approach\s+to|solution\s+(?:design|architecture|approach))\b/i,
};

// First match wins. Most SPECIFIC categories first so a strong socioeconomic/price/financial/personnel signal
// beats the broad default. This ordering is the set of tie-break rules the research named:
//   - a resume files under Management (tested before Experience),
//   - a certificate of insurance files under Financial (tested before Certs: "insurance" is the stronger signal),
//   - a proposal/bid bond files under Admin (Financial matches only bonding-capacity/performance-bond phrases),
//   - "exceptions to the terms/contract" files under Certs; "technical" wording falls through to Technical.
const PRECEDENCE: SubmittalBucketKey[] = ['socioeconomic', 'price', 'financial', 'management', 'experience', 'certs', 'admin', 'technical'];

/**
 * Classify one proposal requirement into exactly one submittal bucket by precedence (first match wins). An
 * unsignalled requirement defaults to `technical` - a requirement with no admin/price/cert/etc. marker is a
 * solution/narrative response, which is where a proposal manager would file it. Total: garbage in -> 'technical'.
 */
export function classifySubmittalBucket(input: { text?: string | null; section?: string | null }): SubmittalBucketKey {
  const hay = `${input?.section ?? ''}\n${input?.text ?? ''}`;
  for (const key of PRECEDENCE) {
    if (SIGNALS[key].test(hay)) return key;
  }
  return 'technical';
}
