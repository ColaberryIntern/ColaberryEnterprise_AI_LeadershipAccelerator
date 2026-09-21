import type { Express } from 'express';
import participantRoutes from './participantRoutes';
import capePortalRoutes from './capePortalRoutes';
import careerPortfolioRoutes from './careerPortfolioRoutes';
import explorerSignalRoutes from './explorerSignalRoutes';
import consentPromptRoutes from './consentPromptRoutes';

/**
 * The learner-portal mounts, out of `server.ts` (Phase 5 T514).
 *
 * `server.ts` is over the ceiling (3,371 lines), so the next change to it
 * splits before it adds: the five contiguous learner-portal `app.use` lines
 * below - the participant routes, the CAPE portal, the career portfolio, the
 * Explorer signal ingest and the consent prompt, with their comments - are
 * that file's block moved as they were (indented by two spaces inside this
 * function; their imports one directory shorter), and `server.ts` calls this
 * function at the position the block held: after the enrolment routes, before
 * the CAPE admin routes, and above `adminRoutes`, whose auth guard would
 * otherwise turn every learner endpoint into a 401.
 *
 * The order inside is the order the block had; a router added here goes in
 * its slot, and the mount-order test says which slot that is.
 */
export function mountLearnerPortalRoutes(app: Express): void {
  app.use(participantRoutes);
  app.use(capePortalRoutes);
  app.use(careerPortfolioRoutes);
  // Explorer Growth OS learner signal ingest (EPIC 2). Dark until
  // EXPLORER_SIGNAL_INGEST_ENABLED + the master flag are both on.
  app.use(explorerSignalRoutes);
  // In-app consent prompt (participant-authed). A PROMPT, not a gate: the portal
  // stays fully usable whether a learner accepts, declines or ignores it.
  app.use(consentPromptRoutes);
}
