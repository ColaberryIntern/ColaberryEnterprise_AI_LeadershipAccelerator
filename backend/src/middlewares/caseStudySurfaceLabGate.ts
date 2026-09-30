import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import {
  isRestrictedSurfacePreview, surfaceLabEnabledFor,
} from '../services/caseStudy/caseStudySurfaceLabAccess';

/**
 * caseStudySurfaceLabGate — the server-side gate on the admin four-lens surface
 * lab.
 *
 * WHERE IT IS MOUNTED, AND WHY NOT SOMEWHERE EASIER. It is mounted PATH-SCOPED
 * in `adminRoutes.ts`, on `/api/admin/case-studies/:id/preview`, immediately
 * above `router.use(caseStudyAdminRoutes)`.
 *
 * NOT `router.use(gate)` inside the Case Study router. Admin sub-routers are
 * mounted with `router.use(child)` and NO path prefix, so an unscoped
 * `router.use` guard inside one of them applies to every request that reaches
 * `adminRoutes` afterwards — including other routers' paths. That has caused a
 * production outage in this repo, and the comment at
 * `caseStudyAdminRoutes.ts:35-39` records it.
 *
 * NOT A CLIENT-SIDE CHECK, AND EMPHATICALLY NOT CSS. The lab is four buttons; a
 * control the client declines to draw is still one `curl` away. If the control
 * leaks into the DOM, pressing it must produce a 403 — which is what this does.
 *
 * IT REFUSES A REQUEST, NOT A ROUTE. Everything else under
 * `/api/admin/case-studies` is untouched, and so is an `enterprise` preview: the
 * existing review desk works for every admin exactly as it did. The only thing
 * that changes for a non-allowlisted admin is that asking for a non-enterprise
 * surface answers 403 instead of a projection.
 *
 * `requireAdmin` RUNS FIRST, on the same scoped mount, so `req.admin` is
 * populated by the time this reads it. Re-verifying the JWT here would be a
 * second auth implementation; the guard that already exists is the one that
 * decides whether there is an identity at all, and this only decides what that
 * identity may see.
 *
 * FAILURE-FIRST. (1) A missing/blank/unparseable setting denies — the failure
 * mode is a closed door, never an open one. (2) No retry: a 403 is a
 * configuration answer, not a transient one. (3) Recovery is the message, which
 * names the environment variable so an operator knows what to ask for.
 * (4) Not handled: nothing. There is no input to this that can throw.
 */
export function caseStudySurfaceLabGate(
  req: Request, res: Response, next: NextFunction,
): void {
  if (!isRestrictedSurfacePreview(req.query?.surfaceKey)) {
    next();
    return;
  }

  if (surfaceLabEnabledFor(req.admin?.sub, env.caseStudySurfaceLabUserIds)) {
    next();
    return;
  }

  // No projection, no surface profile, no gate decision — a refusal that leaked
  // any of those would be the preview it is refusing to serve. The message names
  // the variable and nothing about who is or is not on the list.
  res.status(403).json({
    error: 'The Case Study surface lens lab is not enabled for this admin account. '
      + 'Previewing a surface other than "enterprise" requires an entry in '
      + 'CASE_STUDY_SURFACE_LAB_USER_IDS.',
    error_class: 'SurfaceLabNotAuthorized',
  });
}

export default caseStudySurfaceLabGate;
