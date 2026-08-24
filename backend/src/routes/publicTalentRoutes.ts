import { Router } from 'express';
import { handleGetPublicTalent } from '../controllers/careerPublicationController';

const router = Router();

/**
 * GET /api/public/talent/:slug — UNAUTHENTICATED, by design.
 *
 * Serves only an approved, frozen snapshot. It never reads the live Career Studio, so
 * a learner's ongoing work cannot leak here and cannot retroactively change what an
 * employer already saw (build plan §23).
 *
 * Deliberately NOT mounted after any auth-bearing router: a public route registered
 * downstream of an authenticated sub-router inherits its guard and starts 401ing.
 * That has bitten this repo before (calendar booking, 2026-07).
 */
router.get('/api/public/talent/:slug', handleGetPublicTalent);

export default router;
