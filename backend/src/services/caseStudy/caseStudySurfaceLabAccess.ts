/**
 * caseStudySurfaceLabAccess — who may preview a Case Study on a surface other
 * than `enterprise`.
 *
 * WHAT THIS PROTECTS. `GET /api/admin/case-studies/:id/preview` has accepted all
 * four surface keys since it was written, and it renders the projection even
 * when the publish gate refuses the surface — which is the point of a preview.
 * Three of the four surfaces are `publishable: false` and their framing copy has
 * never been reviewed by the product owner. Two of them carry truthfulness
 * constraints that no predicate can enforce (SURFACE_LENS_MODEL §3.3, §3.4). So
 * the lens lab is a review tool for named accounts, not an admin-wide feature,
 * until that review happens.
 *
 * WHY A PURE PREDICATE IN A LEAF MODULE. The middleware that uses it is three
 * lines of Express plumbing; the RULE is this function, and a rule inside a
 * middleware can only be tested by standing up a router. Every boundary case
 * that matters here — an empty string, whitespace, a list with a blank entry, a
 * caller with no id — is a one-line assertion against this instead.
 *
 * DEFAULT CLOSED. `undefined`, `''`, `'off'` and anything unrecognised all mean
 * no. There is no configuration mistake that opens this by accident; the only
 * way in is an explicit `all` or an explicit id.
 *
 * NO HARDCODED IDENTIFIER. The allowlist is data from the environment, never a
 * literal in a branch. An email or a user id compiled into a conditional is a
 * permission that cannot be granted, revoked or audited without a deploy — see
 * `requireCoryAuthorized` in this repo for the shape being avoided.
 *
 * LEAF MODULE: no imports, no I/O, nothing that can fail.
 */

import type { CaseStudySurfaceKey } from '../../types/caseStudy';

/**
 * The one surface every admin may always preview.
 *
 * It is the only `publishable: true` profile and the only surface the public
 * route resolves to, so previewing it shows an admin exactly what is already
 * live. Gating it would break the existing review desk for every admin to
 * protect nothing.
 */
export const UNRESTRICTED_PREVIEW_SURFACE: CaseStudySurfaceKey = 'enterprise';

/**
 * Does this request need the lab allowlist at all?
 *
 * Split from the allowlist check on purpose: "which requests are restricted" and
 * "who is allowed" are two decisions, and folding them into one predicate makes
 * it impossible to test either without the other. It also keeps the blast radius
 * legible — the answer is `false` for every Case Study admin request that is not
 * a non-enterprise preview, which is all of them today.
 */
export function isRestrictedSurfacePreview(surfaceKey: unknown): boolean {
  if (surfaceKey === undefined || surfaceKey === null) return false;
  if (typeof surfaceKey !== 'string') return true;
  const key = surfaceKey.trim();
  if (key === '') return false;
  return key !== UNRESTRICTED_PREVIEW_SURFACE;
}

/**
 * Is the surface lab open to this admin?
 *
 * `setting` is `'off'` (default), `'all'`, or a comma-separated list of admin
 * user ids — the `sub` claim on the admin JWT, which is the only stable,
 * grantable, revocable handle the token carries. `email` is a display value that
 * changes; `role` is already checked by `requireAdmin` and does not distinguish
 * one admin from another, which is exactly what this needs to do.
 */
export function surfaceLabEnabledFor(
  userId: string | null | undefined,
  setting: string | null | undefined,
): boolean {
  const value = (setting ?? 'off').trim();
  if (value === '' || value === 'off') return false;
  if (value === 'all') return true;
  if (!userId) return false;
  return value.split(',').map((s) => s.trim()).filter(Boolean).includes(userId);
}
