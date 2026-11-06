/**
 * hireListingSettings - the two hire-only settings on a portfolio page.
 *
 *   availability   the LEARNER's own words about whether they are looking (H1.2: self-
 *                  reported). The caller is always the learner; the enrollment comes from
 *                  their session, never from the request.
 *   spotlight      an ADMIN's endorsement (H1.1: admins only). The caller is an admin route.
 *
 * Both write exactly one row by its primary lookup and are idempotent: setting the same
 * value twice leaves the same row. Neither can list anybody - listing is the gate in
 * hireTalentIndex - so a learner setting availability on an unpublished page changes
 * nothing a stranger sees.
 */
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { AVAILABILITY_KINDS } from './hireTalentProjection';

export const availabilitySchema = z.union([
  z.object({
    status: z.enum(AVAILABILITY_KINDS as unknown as ['open', 'interviewing', 'placed']),
    label: z.string().trim().min(1).max(80),
  }).strict(),
  // Clearing it is an explicit null, not an empty object, so a typo cannot clear it.
  z.null(),
]);

export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export interface HireListingSettings {
  readonly availability: { readonly status: string; readonly label: string } | null;
  readonly spotlight: boolean;
}

class NotFoundError extends Error {
  status = 404;
  error_class = 'NotFound';
  constructor() { super('No portfolio page exists for this enrollment yet'); this.name = 'NotFoundError'; }
}

function toSettings(row: any): HireListingSettings {
  const status = row?.availability_status ?? null;
  const label = row?.availability_label ?? null;
  return { availability: status && label ? { status, label } : null, spotlight: row?.hire_spotlight === true };
}

export async function readHireListingSettings(enrollmentId: string): Promise<HireListingSettings> {
  const [rows] = await sequelize.query(
    `SELECT availability_status, availability_label, hire_spotlight
       FROM career_portfolio_pages WHERE enrollment_id = $1 LIMIT 1`,
    { bind: [enrollmentId] },
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new NotFoundError();
  return toSettings(row);
}

/** The learner sets or clears their own availability. Idempotent. */
export async function setHireAvailability(enrollmentId: string, input: AvailabilityInput): Promise<HireListingSettings> {
  const [rows] = await sequelize.query(
    `UPDATE career_portfolio_pages
        SET availability_status = $2, availability_label = $3, updated_at = NOW()
      WHERE enrollment_id = $1
      RETURNING availability_status, availability_label, hire_spotlight`,
    { bind: [enrollmentId, input ? input.status : null, input ? input.label : null] },
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new NotFoundError();
  return toSettings(row);
}

/** An admin spotlights a person, or stops. Idempotent. */
export async function setHireSpotlight(enrollmentId: string, on: boolean): Promise<HireListingSettings> {
  const [rows] = await sequelize.query(
    `UPDATE career_portfolio_pages SET hire_spotlight = $2, updated_at = NOW()
      WHERE enrollment_id = $1
      RETURNING availability_status, availability_label, hire_spotlight`,
    { bind: [enrollmentId, on] },
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new NotFoundError();
  return toSettings(row);
}
