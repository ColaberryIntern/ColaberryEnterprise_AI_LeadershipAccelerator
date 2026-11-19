import api from '../utils/api';

/**
 * AF11.9 — the builder's front door, as a client.
 *
 * Two reads and no writes, matching the API: this answers "can the product already do this?" and
 * files nothing. The AF11.7 field it informs is written by the request the builder goes on to
 * file, so there is deliberately no `record` call here to give that field a second source.
 */

/** One thing the product can already do, with the evidence for the claim. */
export interface ProductFeature {
  feature_key: string;
  domain_key: string;
  label: string;
  what_it_does: string;
  state: 'in_app' | 'partly';
  /** Where to go and use it. */
  product_route: string;
  /** The route file that backs the claim, so it can be checked rather than trusted. */
  backed_by: string;
  /** When a human last checked. A claim with no date goes stale invisibly. */
  verified_on: string;
  /**
   * Why a ruling is needed, on a `partly` feature; what the screen has to do, on an `api_only`
   * one. Null otherwise.
   */
  ruling_needed: string | null;
  /** Which tab to click, or what is missing. Null when the route lands you in the right place. */
  product_route_note: string | null;
  matches: string[];
}

export interface FrontDoorAnswer {
  state: 'in_app' | 'partly' | 'api_only' | 'not_built';
  feature: ProductFeature | null;
  route_to:
    | 'use_it_then_ask_for_a_grant'
    | 'ask_for_a_ruling'
    | 'ask_for_a_screen'
    | 'write_a_scope_sheet';
  /**
   * The AF11.7 value this implies, or null when the builder still has to answer.
   *
   * `not_built` on a candidate nothing matches, and `exists_unused` on an `api_only` one, where
   * there is no screen so the builder could not have used it. Null on `in_app` and `partly`,
   * because there the product having a feature is not the builder having used it, and "go and
   * use it first" only means something if trying it is what produces the answer.
   */
  implies_tried_in_product: 'used_by_hand' | 'exists_unused' | 'not_built' | null;
  /** False means nobody has curated this domain, which is NOT the same as "nothing exists". */
  domain_is_mapped: boolean;
}

export interface CatalogCoverage {
  features: number;
  domains: string[];
}

export async function askProductFeatures(
  candidate: string,
  domainKey: string,
): Promise<{ answer: FrontDoorAnswer; coverage: CatalogCoverage }> {
  const { data } = await api.get<{ answer: FrontDoorAnswer; coverage: CatalogCoverage }>(
    '/api/admin/agent-domain-product-features/ask',
    { params: { candidate, domain_key: domainKey } },
  );
  return data;
}

export async function listProductFeatures(domainKey: string): Promise<{
  domain_key: string;
  features: ProductFeature[];
  domain_is_mapped: boolean;
  coverage: CatalogCoverage;
}> {
  const { data } = await api.get<{
    domain_key: string;
    features: ProductFeature[];
    domain_is_mapped: boolean;
    coverage: CatalogCoverage;
  }>('/api/admin/agent-domain-product-features', { params: { domain_key: domainKey } });
  return data;
}
