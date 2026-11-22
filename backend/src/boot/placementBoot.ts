import type { Express, Router } from 'express';
import { ensurePlacementSchema } from '../db/ensurePlacementSchema';
import careerPrepInboxRoutes from '../routes/careerPrepInboxRoutes';
import careerPrepPlacementInterviewsRoutes from '../routes/careerPrepPlacementInterviewsRoutes';
import integrationsInboxRoutes from '../routes/integrationsInboxRoutes';
import { bookingRouters } from '../routes/publicBookingRoutes';
import { roomRouters } from '../routes/placementRoomRoutes';
import { roomGuideRouter } from '../routes/placementRoomGuideRoutes';
import { replayRouters } from '../routes/placementReplayRoutes';
import hireClientRoutes from '../routes/hireClientRoutes';
import { ensureHireClientSchema } from '../db/ensureHireClientSchema';
import hireClientFollowUpRoutes from '../routes/hireClientFollowUpRoutes';
import careerPrepOfferRoutes from '../routes/careerPrepOfferRoutes';
import { ensureEmployerFollowUpSchema } from '../db/ensureEmployerFollowUpSchema';
import { startFollowUpScheduler } from '../services/placement/followUpScheduler';
import { startReplayJob } from '../services/placement/replayJob';
import { startInboxTestCron } from '../services/placement/inboxTestJob';
import { startInboxBackfill } from '../services/placement/inboxBackfill';
import { startInboxReplay } from '../services/placement/inboxEvents';
import { startBookingLinkSweep } from '../services/placement/bookingLinkSweep';
import { startBookingConfirmSweep } from '../services/placement/bookingConfirmSweep';
import { startBookingScheduler } from '../services/placement/bookingScheduler';
import { runScopePreflight } from '../services/placement/zoomScopePreflight';

/**
 * Career Prep v27, Releases 2 and 3: everything the getting-hired pipeline mounts and starts, in ONE place, so
 * server.ts (4,000+ lines) is touched by exactly three calls and never again (plan.md "File ceilings").
 *
 *   mountPlacementIntegrations(app)  BEFORE server.ts's global express.json(): routes that verify an HMAC over the
 *                                    exact request bytes (the inbox integration, CP6.2) need the raw body, and a route
 *                                    with a tighter body cap than the global 5mb (the booking confirm, 10kb) must parse
 *                                    first. server.ts calls it beside the other signature-checked webhooks.
 *   mountPlacementPublic(app)        with the other public and participant routes, before adminRoutes and the broad
 *                                    auth guard (each route carries its own guard).
 *   startPlacement()                 at boot, after the Career Prep schema: the placement tables, then every scheduler.
 *
 * Each later task adds its router to one of the lists below and its scheduler to SCHEDULERS; the order of a list is
 * the mount order.
 */
export const INTEGRATION_ROUTERS: Router[] = [
  integrationsInboxRoutes, // CP6.2: signed inbox-manager events (own express.raw; 503 until INBOX_INTEGRATION_SECRET is set)
  bookingRouters.confirm, // CP8.2: the booking confirm, with its OWN 10kb JSON parser (so before the global 5mb one); 5/15 min per link
  roomGuideRouter, // CP9.1: the employer room's guide + private notes (signed link first; the notes POST has its OWN 16kb JSON parser)
];
export const PUBLIC_ROUTERS: Router[] = [
  careerPrepInboxRoutes, // CP6.1: the student's job-search inbox (participant + Career Prep gated per route)
  bookingRouters.view, // CP8.2: the public booking page's data (the token is the key; no login; 60/min per link)
  careerPrepPlacementInterviewsRoutes, // CP8.3: the learner's own placement interviews for the Interviews sheet (participant + Career Prep gated)
  roomRouters.candidate, // CP9.1: the candidate's interview room (participant + Career Prep gated; own only)
  roomRouters.employer, // CP9.1: the employer's interview room (the signed link from the booking email; per-link limits)
  replayRouters.candidate, // CP9.2: the candidate's replay and feedback (participant + Career Prep gated; own only)
  replayRouters.public, // CP9.2: the employer's replay (signed room link) and the one-hour signed recording stream
  hireClientRoutes, // CP10.2: the employer portal API (switch hire_client_portal_enabled; magic-link session, scoped to its client)
  hireClientFollowUpRoutes, // CP10.3: the employer's follow-ups (the same guard; scoped to its client)
  careerPrepOfferRoutes, // CP10.4: the learner's own offers and answers (participant + Career Prep gated; never a fee)
];
export const SCHEDULERS: Array<{ name: string; start: () => void }> = [
  { name: 'inbox-tests', start: startInboxTestCron }, // CP6.1c: daily forwarding test + broken alerts (switch-gated per pass)
  { name: 'inbox-backfill', start: startInboxBackfill }, // CP6.2: hourly; registers nothing while INBOX_MANAGER_API_BASE is unset
  { name: 'inbox-replay', start: startInboxReplay }, // CP8.1: one boot pass over stored events left unprocessed (idempotent)
  { name: 'booking-link-sweep', start: startBookingLinkSweep }, // CP8.1b: retries owed booking-link replies (switch-gated, capped)
  { name: 'booking-confirm-sweep', start: startBookingConfirmSweep }, // CP8.2b: finishes a booking's room + invites (capped)
  { name: 'booking-scheduler', start: startBookingScheduler }, // CP8.2c: 24 h and 1 h reminders, the 24 h unbooked nudge (capped)
  // CP9.1 (E6): once at boot, read the Zoom token's granted scopes and log whether recording can be turned on (changes nothing)
  { name: 'zoom-scope-preflight', start: () => { runScopePreflight().catch((err: unknown) => console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
    event: 'placement_zoom_scope_preflight_failed', outcome: 'failure', error_class: (err as Error)?.name ?? 'UpstreamUnavailable', context: {} }))); } },
  { name: 'replay-job', start: startReplayJob }, // CP9.2: every 15 min, held + fully consented interviews get one replay (capped retries)
  { name: 'follow-up-scheduler', start: startFollowUpScheduler }, // CP10.3: every 5 min, employers' follow-ups when due (switch-gated per pass and per send)
];

export function mountPlacementIntegrations(app: Express): void {
  for (const r of INTEGRATION_ROUTERS) app.use(r);
}

export function mountPlacementPublic(app: Express): void {
  for (const r of PUBLIC_ROUTERS) app.use(r);
}

export async function startPlacement(): Promise<void> {
  await ensurePlacementSchema();
  await ensureHireClientSchema(); // CP10.2: employer accounts (its own file: ensurePlacementSchema.ts is at its size limit)
  await ensureEmployerFollowUpSchema(); // CP10.3: employer follow-ups (after the employer tables they reference)
  for (const s of SCHEDULERS) {
    try { s.start(); } catch (err) {
      console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'placement_scheduler_start_failed',
        outcome: 'failure', error_class: (err as Error)?.name ?? 'Error', context: { scheduler: s.name } }));
    }
  }
}
