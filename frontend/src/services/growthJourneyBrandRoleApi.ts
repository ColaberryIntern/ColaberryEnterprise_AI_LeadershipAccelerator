import api from '../utils/api';
import { params } from './queryParams';

/**
 * The per-brand agent role: one read, one write.
 *
 * ─── ITS OWN FILE, AT THE SEAM THE BACKEND ALREADY DRAWS ────────────────────
 *
 * `growthJourneyExplorerApi.ts` holds the thirteen brand-scoped READS and
 * reached 325 lines, past this repo's ~300 soft target. The split is at a real
 * seam rather than an arbitrary halfway mark, and it is the same seam the server
 * draws between `growthJourneyExplorerController` and
 * `growthJourneyBrandRoleController`: those reads share one envelope, one
 * nullable `data` and an optional brand; this is configuration with a WRITE, a
 * MANDATORY brand and a different response shape.
 *
 * Keeping the one write in a file of its own has a second use. A scan can assert
 * that exactly one client module on this surface contains a mutating call, which
 * is a cheaper guarantee to check than reading for one.
 */

const BASE = '/api/admin/growth-journey/brand-role';

export interface BrandRole {
  title: string;
  description: string;
  /** `null` on a default nobody has set. That is how the UI tells the two apart. */
  updated_at: string | null;
}

export type BrandRoleStatus = 'set' | 'default' | 'no_programme' | 'ambiguous_programme';

export interface BrandRoleResponse {
  brand_id: string;
  status: BrandRoleStatus;
  /** `null` when the brand has no journey programme to store a role on. */
  role: BrandRole | null;
  source: 'stored' | 'kind_default' | null;
}

export interface BrandRoleWriteResponse {
  brand_id: string;
  status: 'saved';
  role: BrandRole;
}

/**
 * The brand is REQUIRED here, unlike the reads.
 *
 * Those have an honest unnarrowed answer; a role does not. "Set the role for
 * whichever brand you happen to be scoped to" is how an operator configures one
 * brand and discovers later that they renamed another. The server answers 400
 * without it, and this signature makes that unreachable from here.
 */
export function getBrandRole(brandId: string): Promise<BrandRoleResponse> {
  return api.get<BrandRoleResponse>(`${BASE}${params({ brand_id: brandId })}`).then((r) => r.data);
}

/**
 * THE ONLY WRITE ON THIS SURFACE, and it is configuration.
 *
 * It changes display copy. Nothing reads the stored value to decide what an
 * agent may do or say, and no prompt builder imports the service behind it - a
 * pattern-based scan over every Maya and agent file asserts that server-side.
 *
 * A 409 means the brand has no journey programme, so there is nowhere to store a
 * role. That is a state of the system, not a bad request, and the panel says so
 * rather than showing a failed save.
 */
export function putBrandRole(
  brandId: string,
  body: { title: string; description: string }
): Promise<BrandRoleWriteResponse> {
  return api
    .put<BrandRoleWriteResponse>(`${BASE}${params({ brand_id: brandId })}`, body)
    .then((r) => r.data);
}

/** Both functions, so a test can assert one per route. */
export const BRAND_ROLE_API = ['getBrandRole', 'putBrandRole'] as const;
