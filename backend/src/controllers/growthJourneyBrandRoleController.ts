import { Request, Response } from 'express';
import { badRequest, logReadFailure, scopedContext } from './growthJourneyController';
import {
  brandRoleBodySchema,
  brandRoleQuerySchema,
} from '../schemas/growthJourneyBrandRoleSchema';
import { getBrandRole, setBrandRole } from '../services/growthJourney/brandRoleService';

/**
 * What the growth agent is called on a brand: read it, and set it.
 *
 * ─── THE ONLY WRITE IN THIS BUILD, AND IT IS CONFIGURATION ──────────────────
 *
 * Nothing here can cause an outbound message. The stored value is display copy;
 * no prompt builder imports the service, and a pattern-based scan over every
 * Maya and agent file asserts that.
 *
 * ─── THE BRAND COMES FROM THE QUERY, AND IT IS MANDATORY ────────────────────
 *
 * Unlike the thirteen Explorer reads, `brand_id` is REQUIRED here. Those reads
 * have an honest unnarrowed answer - "all brands" - because Explorer's
 * population is one brand's. A role does not: "set the role for whichever brand
 * you happen to be scoped to" is how an operator configures Colaberry
 * Enterprise and discovers later that they renamed Colaberry Training. So the
 * absent case is a 400, not a default.
 *
 * ─── AUTHORIZATION IS `scopedContext`, NOT A CHECK OF OUR OWN ───────────────
 *
 * `scopedContext` compares the requested brand to the one the caller's
 * memberships grant and answers 403 rather than widening. Passing the SAME
 * `brand_id` to it and to the service is what makes the write unable to touch a
 * brand the caller does not hold - there is no second path to the service.
 *
 * In production today `tenant_memberships` is empty, so `ctx.brandId` is null
 * and every request naming a brand is 403. The write is unreachable until an
 * operator populates memberships. That is fail-closed and it is the correct
 * posture for the one write here.
 */

/** `no_programme` and `ambiguous_programme` are the service's refusals, rendered as 409. */
function refusal(res: Response, status: 'no_programme' | 'ambiguous_programme', brandId: string): void {
  // 409, not 404: the BRAND exists and the caller is allowed to ask about it.
  // What is missing is the journey programme the role would be stored on, which
  // is a state of the system rather than a bad request or a missing resource.
  res.status(409).json({
    error:
      status === 'no_programme'
        ? 'This brand has no journey programme, so a role cannot be stored on it yet'
        : 'This brand has more than one journey programme and no default, so the role is ambiguous',
    error_class: 'ContractViolation',
    reason: status,
    brand_id: brandId,
  });
}

/** `GET /api/admin/growth-journey/brand-role?brand_id=…` */
export async function getBrandRoleHandler(req: Request, res: Response): Promise<void> {
  const params = brandRoleQuerySchema.safeParse(req.query);
  if (!params.success) return badRequest(res, params.error);

  try {
    const ctx = await scopedContext(req, res, { brand_id: params.data.brand_id });
    if (!ctx) return; // scopedContext has already answered 403/404.

    const result = await getBrandRole(params.data.brand_id);

    // A READ of a programme-less brand is NOT a refusal: "nobody has set this"
    // is the honest answer and the UI renders it as unset. Only the write needs
    // somewhere to put the value.
    res.json({
      brand_id: result.brand_id,
      status: result.status,
      role: result.role,
      source: result.status === 'set' ? 'stored' : result.status === 'default' ? 'kind_default' : null,
    });
  } catch (err) {
    const errorClass = logReadFailure(req, err, 'brand_role_read_failed');
    res.status(500).json({ error: 'Brand role read failed', error_class: errorClass });
  }
}

/** `PUT /api/admin/growth-journey/brand-role?brand_id=…` */
export async function putBrandRoleHandler(req: Request, res: Response): Promise<void> {
  const params = brandRoleQuerySchema.safeParse(req.query);
  if (!params.success) return badRequest(res, params.error);

  // The body is parsed BEFORE authorization is resolved, which is deliberate:
  // a malformed body is a 400 regardless of who is asking, and it costs no
  // lookup to say so. The parse is also the only way to obtain the branded type
  // `setBrandRole` accepts, so a handler that skipped it would not compile.
  const body = brandRoleBodySchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  try {
    const ctx = await scopedContext(req, res, { brand_id: params.data.brand_id });
    if (!ctx) return;

    const result = await setBrandRole(params.data.brand_id, body.data);
    if (result.status !== 'saved') return refusal(res, result.status, params.data.brand_id);

    res.json({ brand_id: result.brand_id, status: result.status, role: result.role });
  } catch (err) {
    const errorClass = logReadFailure(req, err, 'brand_role_write_failed');
    res.status(500).json({ error: 'Brand role write failed', error_class: errorClass });
  }
}
