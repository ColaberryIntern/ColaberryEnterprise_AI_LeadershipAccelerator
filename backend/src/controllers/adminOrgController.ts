import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  orgListQuerySchema,
  orgStatusSchema,
  orgAddCohortSchema,
  orgLinkArtifactSchema,
} from '../schemas/adminOrgSchema';
import {
  listOrganizations,
  getOrganizationDetail,
  setOrganizationStatus,
  addCohortToOrganization,
  removeCohortFromOrganization,
  getOrganizationStats,
} from '../services/adminOrgService';
import type { OrganizationStatus } from '../models/Organization';
import {
  listAccountArtifacts,
  linkArtifactToAccount,
  unlinkArtifactFromAccount,
  ArtifactLinkRejected,
} from '../services/commercialization/accountArtifactLinkService';
// Shared with the Memory Graph on purpose: one admin, one scope. If the account list and
// the graph derived tenancy separately they would eventually disagree, and the looser of
// the two would quietly become the real boundary.
import { intelligenceScopeForAdmin as adminReadScope } from '../modules/tenancy/adminScopeBridge';

/**
 * Admin business-account endpoints.
 *
 * Route-level auth is `requireAdmin` (see routes/admin/organizationRoutes.ts).
 * These handlers assume that has already run and never re-derive authentication.
 *
 * TENANCY, which `requireAdmin` knows nothing about. An admin token proves *who* is
 * calling, not *which tenants* they may read. Every handler here resolves a scope through
 * `adminReadScope` and passes it down; the service signatures make that mandatory, so a
 * handler cannot forget. While `tenant_memberships` is empty the bridge grants
 * cross-tenant read and logs it — a self-closing ramp that ends for everyone the moment
 * the first membership row exists.
 *
 * Zod v4 in this repo: parse failures carry `err.issues`, not `err.errors`.
 */

/** The acting admin, for audit stamps. Never used for authorization. */
function actingAdmin(req: Request): string {
  return req.admin?.email ?? 'unknown-admin';
}

/**
 * Express types `req.params[k]` as `string | string[]` under this project's
 * configuration (a repeated `?id=` can produce an array). Every route here
 * declares a single path segment, so the array form is not reachable — but it is
 * narrowed rather than cast, so a malformed request yields a clean 404 from the
 * lookup instead of a UUID comparison against an array.
 */
function routeParam(req: Request, key: string): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
}

function handleZod(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  next(error as Error);
}

export async function handleAdminListOrganizations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = orgListQuerySchema.parse(req.query);
    const result = await listOrganizations(
      { ...params, status: params.status as OrganizationStatus | undefined },
      await adminReadScope(req.admin),
    );
    res.json(result);
  } catch (error) {
    handleZod(error, res, next);
  }
}

export async function handleAdminGetOrganizationStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ stats: await getOrganizationStats(await adminReadScope(req.admin)) });
  } catch (error) {
    next(error as Error);
  }
}

export async function handleAdminGetOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const detail = await getOrganizationDetail(routeParam(req, 'id'), await adminReadScope(req.admin));
    if (!detail) {
      res.status(404).json({ error: 'Business account not found' });
      return;
    }
    res.json(detail);
  } catch (error) {
    next(error as Error);
  }
}

export async function handleAdminSetOrganizationStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { status } = orgStatusSchema.parse(req.body);
    const result = await setOrganizationStatus(
      routeParam(req, 'id'),
      status as OrganizationStatus,
      actingAdmin(req),
      await adminReadScope(req.admin),
    );
    if (!result) {
      res.status(404).json({ error: 'Business account not found' });
      return;
    }
    // 200 either way: re-sending the status a row already has is a successful
    // no-op, not a conflict. `changed` tells the caller which happened.
    res.json(result);
  } catch (error) {
    handleZod(error, res, next);
  }
}

export async function handleAdminAddCohort(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = orgAddCohortSchema.parse(req.body);
    const result = await addCohortToOrganization(
      routeParam(req, 'id'),
      body.cohort_id,
      body.seats_sponsored ?? null,
      actingAdmin(req),
      await adminReadScope(req.admin),
    );

    if ('error' in result) {
      res.status(404).json({
        error: result.error === 'org_not_found' ? 'Business account not found' : 'Cohort not found',
      });
      return;
    }

    // 201 for a new link, 200 when it already existed — repeating the call is
    // idempotent by the (org_id, cohort_id) unique index, so a double-click is a
    // no-op rather than an error or a duplicate row.
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    handleZod(error, res, next);
  }
}

export async function handleAdminRemoveCohort(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const removed = await removeCohortFromOrganization(
      routeParam(req, 'id'),
      routeParam(req, 'cohortId'),
      await adminReadScope(req.admin),
    );
    if (!removed) {
      res.status(404).json({ error: 'That cohort is not linked to this business account' });
      return;
    }
    res.json({ removed: true });
  } catch (error) {
    next(error as Error);
  }
}

/**
 * C8.5 - the canonical artifacts linked to this account.
 *
 * Returns POINTERS. Nothing is fetched, cached or proxied: the artifact stays in the one
 * canonical place C0.3 put it, and this endpoint says where that is. Each link carries a
 * C0.3 naming verdict so a link filed under a dated or versioned name is visible as a
 * problem rather than silently normal.
 */
export async function handleAdminListAccountArtifacts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const links = await listAccountArtifacts(routeParam(req, 'id'));
    res.json({ links });
  } catch (error) {
    next(error as Error);
  }
}

export async function handleAdminLinkAccountArtifact(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = orgLinkArtifactSchema.parse(req.body);
    const result = await linkArtifactToAccount({
      organizationId: routeParam(req, 'id'),
      artifactKind: body.artifact_kind,
      title: body.title,
      canonicalUrl: body.canonical_url,
      sourceType: body.source_type,
      sourceId: body.source_id ?? null,
      linkedBy: actingAdmin(req),
      notes: body.notes ?? null,
    });

    // 201 for a new link, 200 when it already existed - the (organization_id,
    // canonical_url) unique index makes a repeat call a no-op rather than a duplicate,
    // which is this ticket's metric ("nobody re-sends a document an account already has")
    // expressed as behaviour rather than as a warning.
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof ArtifactLinkRejected) {
      // 422, not 400: the request is well formed and the content is the problem. The
      // commonest case is a filename carrying a date or REV marker, which C0.3 forbids.
      res.status(422).json({ error: error.message, reason: error.reason });
      return;
    }
    handleZod(error, res, next);
  }
}

export async function handleAdminUnlinkAccountArtifact(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { removed } = await unlinkArtifactFromAccount(
      routeParam(req, 'id'),
      routeParam(req, 'linkId'),
    );
    if (!removed) {
      res.status(404).json({ error: 'That artifact is not linked to this business account' });
      return;
    }
    // The artifact itself is untouched. We never held it, which is why removing the
    // pointer is safe.
    res.json({ removed: true });
  } catch (error) {
    next(error as Error);
  }
}
