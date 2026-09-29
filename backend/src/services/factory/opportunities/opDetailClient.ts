/**
 * opDetailClient — fetch a single gov-opportunity.v1 DETAIL by canonical id, for the Enterprise server-side
 * approval binding. Opportunity Pulse's authenticated, scoped `GET /api/v2/gov-opportunities/:canonicalId`
 * (returning a gov-opportunity.v1 envelope with `sourceSnapshotVersion`) is NOT yet live, so this reads the
 * pinned, clearly-labeled fixtures for now. When the live endpoint ships, this is the ONLY place to switch to
 * the real HTTP call — degrade-dark and fail-closed on any error, exactly like oppPulseClient.
 *
 * FAIL-CLOSED CONTRACT: returns null whenever the detail cannot be established (unknown/unavailable). The
 * approval path treats null as SourceUnavailableError and BLOCKS the approval — a decision is never bound to a
 * source we could not read.
 */
import { GOV_OPPORTUNITY_FIXTURES, GovOpportunityV1 } from './govOpportunityFixtures';

export async function fetchGovOpportunityDetail(canonicalOpportunityId: string): Promise<GovOpportunityV1 | null> {
  // TODO(live): when OP ships /api/v2/gov-opportunities/:id, replace this block with an authenticated,
  // timeout-bounded, fail-closed HTTP fetch (mirror oppPulseClient's X-API-Key + AbortController + null-on-error).
  const fixture = GOV_OPPORTUNITY_FIXTURES[canonicalOpportunityId];
  if (!fixture) return null;                                   // unknown -> unavailable -> approval blocked
  if (fixture.sourceAvailability && fixture.sourceAvailability.status === 'unavailable') return null; // outage
  return fixture;
}

/** True when a live v2 endpoint is configured. False today (fixtures only) — used to label the workspace source. */
export function isLiveOpDetailConfigured(): boolean {
  return process.env.OPPORTUNITY_PULSE_V2_BASE ? true : false;
}
