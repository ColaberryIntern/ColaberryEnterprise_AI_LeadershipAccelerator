import type { Express, Router } from 'express';
import { ensurePlacementSchema } from '../db/ensurePlacementSchema';
import careerPrepInboxRoutes from '../routes/careerPrepInboxRoutes';
import integrationsInboxRoutes from '../routes/integrationsInboxRoutes';
import { bookingRouters } from '../routes/publicBookingRoutes';
import { startInboxTestCron } from '../services/placement/inboxTestJob';
import { startInboxBackfill } from '../services/placement/inboxBackfill';
import { startInboxReplay } from '../services/placement/inboxEvents';
import { startBookingLinkSweep } from '../services/placement/bookingLinkSweep';
import { startBookingConfirmSweep } from '../services/placement/bookingConfirmSweep';

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
];
export const PUBLIC_ROUTERS: Router[] = [
  careerPrepInboxRoutes, // CP6.1: the student's job-search inbox (participant + Career Prep gated per route)
  bookingRouters.view, // CP8.2: the public booking page's data (the token is the key; no login; 60/min per link)
];
export const SCHEDULERS: Array<{ name: string; start: () => void }> = [
  { name: 'inbox-tests', start: startInboxTestCron }, // CP6.1c: daily forwarding test + broken alerts (switch-gated per pass)
  { name: 'inbox-backfill', start: startInboxBackfill }, // CP6.2: hourly; registers nothing while INBOX_MANAGER_API_BASE is unset
  { name: 'inbox-replay', start: startInboxReplay }, // CP8.1: one boot pass over stored events left unprocessed (idempotent)
  { name: 'booking-link-sweep', start: startBookingLinkSweep }, // CP8.1b: retries owed booking-link replies (switch-gated, capped)
  { name: 'booking-confirm-sweep', start: startBookingConfirmSweep }, // CP8.2b: finishes a booking's room + invites (capped)
];

export function mountPlacementIntegrations(app: Express): void {
  for (const r of INTEGRATION_ROUTERS) app.use(r);
}

export function mountPlacementPublic(app: Express): void {
  for (const r of PUBLIC_ROUTERS) app.use(r);
}

export async function startPlacement(): Promise<void> {
  await ensurePlacementSchema();
  for (const s of SCHEDULERS) {
    try { s.start(); } catch (err) {
      console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'placement_scheduler_start_failed',
        outcome: 'failure', error_class: (err as Error)?.name ?? 'Error', context: { scheduler: s.name } }));
    }
  }
}
