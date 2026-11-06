/**
 * hireListingController - the two hire-only portfolio settings.
 *
 *   LEARNER  GET/PUT /api/portal/career/portfolio-page/availability   their own availability.
 *            The enrollment is ALWAYS the caller's, from the token. No id is accepted.
 *   ADMIN    PUT /api/admin/career/portfolio-page/:enrollmentId/spotlight   behind requireAdmin.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  availabilitySchema, readHireListingSettings, setHireAvailability, setHireSpotlight,
} from '../services/hire/hireListingSettings';

const eid = (req: Request) => req.participant!.sub;

function fail(res: Response, e: any, next: NextFunction): void {
  if (e?.status) {
    res.status(e.status).json({ error: e.message || 'error', error_class: e.error_class });
    return;
  }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'hire_listing_controller_error', outcome: 'failure',
    error_class: e?.error_class || e?.name || 'Error', context: { message: e?.message },
  }));
  next(e);
}

/** GET /api/portal/career/portfolio-page/availability */
export async function handleGetMyHireSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ ok: true, settings: await readHireListingSettings(eid(req)) });
  } catch (e) { fail(res, e, next); }
}

/** PUT /api/portal/career/portfolio-page/availability   body: { availability: {status,label} | null } */
export async function handleSetMyAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!Object.prototype.hasOwnProperty.call(body, 'availability') || Object.keys(body).length !== 1) {
    res.status(400).json({ error: 'body must be exactly { availability: { status, label } | null }' });
    return;
  }
  const parsed = availabilitySchema.safeParse(body.availability);
  if (!parsed.success) {
    res.status(400).json({ error: 'availability.status must be open, interviewing or placed, with a label of 1-80 characters' });
    return;
  }
  try {
    res.json({ ok: true, settings: await setHireAvailability(eid(req), parsed.data) });
  } catch (e) { fail(res, e, next); }
}

const spotlightSchema = z.object({ spotlight: z.boolean() }).strict();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PUT /api/admin/career/portfolio-page/:enrollmentId/spotlight   body: { spotlight: boolean } */
export async function handleSetHireSpotlight(req: Request, res: Response, next: NextFunction): Promise<void> {
  const enrollmentId = String(req.params.enrollmentId || '');
  if (!UUID.test(enrollmentId)) {
    res.status(400).json({ error: 'enrollmentId must be a uuid' });
    return;
  }
  const parsed = spotlightSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'body must be exactly { spotlight: boolean }' });
    return;
  }
  try {
    res.json({ ok: true, settings: await setHireSpotlight(enrollmentId, parsed.data.spotlight) });
  } catch (e) { fail(res, e, next); }
}
