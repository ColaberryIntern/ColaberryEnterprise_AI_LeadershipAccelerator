import portalApi from '../utils/portalApi';

/**
 * The learner's hire.refactored.ai settings. Availability is self-reported (Ali, H1.2):
 * the learner's own words, null until they set it, and never inferred. Spotlight is an
 * admin's endorsement and is read here, never written.
 */

export type HireAvailabilityKind = 'open' | 'interviewing' | 'placed';

export interface HireListingSettings {
  readonly availability: { readonly status: HireAvailabilityKind; readonly label: string } | null;
  readonly spotlight: boolean;
}

export async function fetchHireListingSettings(): Promise<HireListingSettings> {
  const res = await portalApi.get('/api/portal/career/portfolio-page/availability');
  return res.data.settings;
}

/** Set, or clear with `null`. The server validates; this only sends the learner's words. */
export async function setHireAvailability(
  availability: { status: HireAvailabilityKind; label: string } | null,
): Promise<HireListingSettings> {
  const res = await portalApi.put('/api/portal/career/portfolio-page/availability', { availability });
  return res.data.settings;
}
