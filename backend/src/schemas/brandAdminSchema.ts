import { z } from 'zod';
import { BRAND_STATUSES } from '../models/Brand';

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Request contracts for the brand administration API.
 *
 * Every one of these runs BEFORE the service is called, which is the point. `brandRoutes`
 * reaches services that take bare strings — `brandSendReadiness(brandId)` accepts any string
 * and happily queries with it — so if validation happened inside or after the service, a
 * malformed id would already have hit the database.
 */

/**
 * Brand ids are UUIDs. Rejecting a non-UUID here rather than passing it through matters more
 * than it looks: `Brand.findByPk('not-a-uuid')` against Postgres raises a type error at the
 * driver, which surfaces as a 500 — an invalid request reported as a server fault, and one
 * that reveals the column type. A 400 is both true and quieter.
 */
export const BrandIdParamSchema = z.object({
  brandId: z.string().uuid(),
});

/**
 * List filters.
 *
 * `tenant_id` is accepted so an operator with several tenants can NARROW to one. It can only
 * ever narrow: the route intersects it with the caller's authorised scope and never unions.
 * See the note in brandRoutes on why the scope is applied last.
 */
export const BrandListQuerySchema = z.object({
  status: z.enum(BRAND_STATUSES).optional(),
  tenant_id: z.string().uuid().optional(),
  /** Case-insensitive substring match on name or slug. */
  q: z.string().trim().min(1).max(200).optional(),
});

/**
 * Brand patch.
 *
 * Deliberately NOT patchable: `tenant_id` and `slug`.
 *
 * Moving a brand between tenants would silently re-home every lead context, campaign, sender
 * profile and tracked link that hangs off it, and none of that is reversible from the row
 * itself. Changing `slug` breaks every URL already printed, shared or embedded in a QR code.
 * Both are legitimate operations and neither is a PATCH — they need their own deliberate flow
 * with a migration path, which is why they are absent rather than merely unvalidated.
 *
 * `.strict()` rejects unknown keys instead of ignoring them, so a request that tried to send
 * `tenant_id` gets a 400 telling it so, rather than a 200 that quietly did not do it. Silent
 * partial success is the worse of the two failures.
 */
export const BrandPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(BRAND_STATUSES).optional(),
    support_email: z.string().email().nullable().optional(),
    default_public_url: z.string().url().nullable().optional(),
    default_theme_key: z.string().trim().min(1).max(100).nullable().optional(),
    // IANA Area/Location or UTC. Abbreviations like "CST" are refused: ICU would accept them,
    // and "CST" is Central Standard in one place and China Standard in another.
    timezone: z
      .string()
      .trim()
      .refine((tz) => tz === 'UTC' || (tz.includes('/') && isValidTimeZone(tz)), {
        message: 'timezone must be an IANA zone such as America/Chicago',
      })
      .nullable()
      .optional(),
  })
  .strict()
  // An empty patch is a caller bug, not a no-op to absorb quietly. Returning 200 for a request
  // that changed nothing teaches the caller their payload worked.
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Patch must change at least one field',
  });

export type BrandPatch = z.infer<typeof BrandPatchSchema>;
export type BrandListQuery = z.infer<typeof BrandListQuerySchema>;
