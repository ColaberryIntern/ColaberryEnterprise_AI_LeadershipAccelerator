import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  orgListQuerySchema,
  orgStatusSchema,
  orgAddCohortSchema,
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

/**
 * Admin business-account endpoints.
 *
 * Route-level auth is `requireAdmin` (see routes/admin/organizationRoutes.ts).
 * These handlers assume that has already run and never re-derive authorization.
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
    const result = await listOrganizations({
      ...params,
      status: params.status as OrganizationStatus | undefined,
    });
    res.json(result);
  } catch (error) {
    handleZod(error, res, next);
  }
}

export async function handleAdminGetOrganizationStats(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ stats: await getOrganizationStats() });
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
    const detail = await getOrganizationDetail(routeParam(req, 'id'));
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
    const removed = await removeCohortFromOrganization(routeParam(req, 'id'), routeParam(req, 'cohortId'));
    if (!removed) {
      res.status(404).json({ error: 'That cohort is not linked to this business account' });
      return;
    }
    res.json({ removed: true });
  } catch (error) {
    next(error as Error);
  }
}
