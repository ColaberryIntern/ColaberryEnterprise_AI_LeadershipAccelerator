/**
 * caseStudyServiceLinkApi — which case study evidences which service. Thin typed wrappers over the shared axios
 * `api` instance, matching factoryApi's shape.
 *
 * `state` is the whole point of these calls. A `suggested` link is a proposal the system made from keyword and
 * capability overlap; a `confirmed` link is one a person stood behind, and only those are quotable as past
 * performance. The UI must never present the two the same way, which is why every DTO carries the state and the
 * rationale that produced it.
 */
import api from '../utils/api';

export type ServiceLinkState = 'suggested' | 'confirmed' | 'rejected';

export interface ServiceLink {
  id: string;
  caseStudyId: string;
  /** The record's own identity. A service's evidence list is read title-first; the uuid is not a label. */
  caseStudyTitle: string;
  caseStudySlug: string | null;
  /** `approved` / `draft` / `archived`. An archived record is not evidence a bid should lean on. */
  caseStudyStatus: string | null;
  serviceOfferingId: string;
  serviceName: string;
  serviceCategory: string | null;
  state: ServiceLinkState;
  /** Names the exact overlap that produced the suggestion, so a reviewer can check it rather than trust it. */
  rationale: string | null;
  matchScore: number | null;
  suggestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestResult {
  caseStudyId: string;
  /** Rows this run actually added. Zero on a re-run, which is how the caller sees the pass was idempotent. */
  inserted: number;
  alreadyPresent: number;
  links: ServiceLink[];
}

/** The services linked to one case study. */
export async function listLinksForCaseStudy(caseStudyId: string, state?: ServiceLinkState): Promise<ServiceLink[]> {
  const qs = state ? `?state=${state}` : '';
  const { data } = await api.get<{ links: ServiceLink[] }>(
    `/api/admin/factory/case-studies/${caseStudyId}/service-links${qs}`,
  );
  return data.links;
}

/** The case studies offered as evidence for one service. */
export async function listCaseStudiesForService(serviceId: string, state?: ServiceLinkState): Promise<ServiceLink[]> {
  const qs = state ? `?state=${state}` : '';
  const { data } = await api.get<{ links: ServiceLink[] }>(
    `/api/admin/factory/services/${serviceId}/case-studies${qs}`,
  );
  return data.links;
}

/**
 * Run the advisory pass for one case study. Safe to call twice: it only adds rows for pairs that have none and
 * never touches a row someone has already decided.
 */
export async function suggestServiceLinks(caseStudyId: string): Promise<SuggestResult> {
  const { data } = await api.post<SuggestResult>(
    `/api/admin/factory/case-studies/${caseStudyId}/service-links/suggest`,
  );
  return data;
}

/** Confirm or reject one suggestion. There is no way back to `suggested`. */
export async function decideServiceLink(id: string, state: 'confirmed' | 'rejected'): Promise<ServiceLink> {
  const { data } = await api.post<{ link: ServiceLink }>(
    `/api/admin/factory/service-links/${id}/decide`,
    { state },
  );
  return data.link;
}
