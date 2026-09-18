/**
 * caseStudyGovTaxonomy - read the two Government-chapter facets off a snapshot's
 * taxonomy, defensively.
 *
 * WHY DEFENSIVE. Both fields reach a snapshot through a human override, and
 * `POST /api/admin/case-studies/:id/overrides` accepts `value: z.unknown()` at a
 * validated PATH. Nothing checks the value's shape on the way in, so every
 * reader has to. Same rule as `caseStudyFilterService`: an unrecognised value
 * fails to match rather than throwing, so one bad override hides one record
 * instead of taking down an index page.
 *
 * The chapter membership rule itself (`isGovernmentChapterCandidate`) lives in
 * the filter engine next to the other predicates, so there is one place that
 * decides what the chapter shows.
 *
 * PURE, LEAF. Types and the facet normaliser only.
 */
import {
  CASE_STUDY_DELIVERY_CONTEXTS,
  CASE_STUDY_GOV_CAPABILITIES,
} from '../../types/caseStudy';
import type {
  CaseStudyDeliveryContext,
  CaseStudyGovCapability,
} from '../../types/caseStudy';
import { normalizeFacetSlug } from './caseStudyFilterService';

const GOV_CAPABILITY_SET: ReadonlySet<string> = new Set(CASE_STUDY_GOV_CAPABILITIES);
const DELIVERY_CONTEXT_SET: ReadonlySet<string> = new Set(CASE_STUDY_DELIVERY_CONTEXTS);

/**
 * Known categories only, deduped, in the catalog's canonical order - so the
 * same tags written in any order or spelling ("AI Strategy Readiness",
 * `ai_strategy_readiness`) project to one stable list.
 */
export function readGovCapabilities(value: unknown): CaseStudyGovCapability[] {
  if (!Array.isArray(value)) return [];
  const held = new Set<string>();
  for (const item of value) {
    const slug = normalizeFacetSlug(item);
    if (GOV_CAPABILITY_SET.has(slug)) held.add(slug);
  }
  return CASE_STUDY_GOV_CAPABILITIES.filter((c) => held.has(c));
}

/**
 * Exact member or null. NOT routed through `normalizeFacetSlug`, which turns `_`
 * into `-` and would make `client_delivery` unmatchable. Case and surrounding
 * whitespace are forgiven; nothing else is guessed at.
 */
export function readDeliveryContext(value: unknown): CaseStudyDeliveryContext | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return DELIVERY_CONTEXT_SET.has(v) ? (v as CaseStudyDeliveryContext) : null;
}
