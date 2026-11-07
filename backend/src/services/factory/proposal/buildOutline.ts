/**
 * buildOutline — the PURE, deterministic skeleton an AI draft is written against (v3 §V2, T07). From a document's
 * sections (one per covered requirement, already in coverage order) and the solicitation's page limit, it produces
 * the ordered outline every drafter and judge shares: each section with its requirement ids and a page budget, the
 * document-level suggested artifacts, and the coverage judgment the Pink gate reads (every required requirement has
 * a section). No I/O and no AI, so ordering / budget / coverage are fully table-testable; the AI section-plan
 * (`suggested`) and the actual drafting are layered on top of this skeleton, never under it.
 *
 * Page budget: each section gets `pageLimit × share`, where `share` is the section's Section-M evaluation weight
 * when the caller can map it (`factorShare`, 0..1), else an equal split. Rounded to the nearest half page and
 * floored at 0.5 so no section budgets to zero. With no page limit the budget is null (an unbounded volume).
 */

export interface OutlineSectionInput {
  sectionKey: string;
  heading: string;
  requirementIds: string[];
  order: number;
  /** The section's share of the Section-M score (0..1), when the caller can map it; else an equal split is used. */
  factorShare?: number;
}

export interface BuildOutlineInput {
  docKey: string;
  pageLimit?: number | null;
  sections: OutlineSectionInput[];
  /** The full set this document must cover, for the coverage judge. Defaults to the union of the sections' ids. */
  requiredReqIds?: string[];
}

export interface OutlineSection {
  sectionKey: string;
  heading: string;
  requirementIds: string[];
  order: number;
  /** Suggested pages for this section; null when the solicitation sets no page limit. */
  pageBudget: number | null;
}

export interface Outline {
  docKey: string;
  pageLimit: number | null;
  sections: OutlineSection[];
  suggestedArtifacts: string[];
  coverage: { required: number; covered: number; missingReqIds: string[]; ok: boolean };
}

/** Deterministic artifacts worth gathering for each canonical document, so the outline names them up front. */
const SUGGESTED_ARTIFACTS: Record<string, string[]> = {
  cover_letter: ['transmittal letter'],
  execution_offer: ['signed signature form'],
  reps_certs: ['SAM.gov registration', 'W-9'],
  socioeconomic: ['HUB subcontracting plan'],
  financial: ['certificate of insurance', 'audited financials'],
  past_performance: ['reference project sheet'],
  management: ['key-personnel resume', 'org chart'],
  compliance_matrix: ['requirements compliance matrix'],
  terms: ['exceptions list'],
  technical: ['technical narrative', 'implementation timeline'],
  pricing: ['price schedule'],
};

const roundHalf = (x: number): number => Math.round(x * 2) / 2;

export function buildOutline(input: BuildOutlineInput): Outline {
  const docKey = input?.docKey || '';
  const pageLimit = typeof input?.pageLimit === 'number' && input.pageLimit > 0 ? input.pageLimit : null;
  const raw = Array.isArray(input?.sections) ? input.sections : [];
  const sorted = [...raw].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
  const n = sorted.length || 1;

  const sections: OutlineSection[] = sorted.map((s) => {
    const share = typeof s.factorShare === 'number' && s.factorShare > 0 ? s.factorShare : 1 / n;
    const pageBudget = pageLimit == null ? null : Math.max(0.5, roundHalf(pageLimit * share));
    return {
      sectionKey: s.sectionKey,
      heading: s.heading,
      requirementIds: Array.isArray(s.requirementIds) ? s.requirementIds : [],
      order: s.order,
      pageBudget,
    };
  });

  const coveredSet = new Set<string>();
  for (const s of sections) for (const id of s.requirementIds) coveredSet.add(id);
  const required = Array.isArray(input?.requiredReqIds) && input.requiredReqIds.length
    ? [...new Set(input.requiredReqIds)]
    : [...coveredSet];
  const missingReqIds = required.filter((id) => !coveredSet.has(id));

  return {
    docKey,
    pageLimit,
    sections,
    suggestedArtifacts: SUGGESTED_ARTIFACTS[docKey] ?? [],
    coverage: { required: required.length, covered: coveredSet.size, missingReqIds, ok: missingReqIds.length === 0 },
  };
}
