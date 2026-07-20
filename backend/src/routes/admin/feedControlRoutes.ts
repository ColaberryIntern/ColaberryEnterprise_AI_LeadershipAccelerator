/**
 * Feed Control admin routes — the control plane for routing curriculum types/cards
 * to surfaces and tuning cadence/frequency/pin/priority/scheduling. Admin-only.
 *
 * GET  /api/admin/feed-control/board                 — surfaces × types + policy
 * GET  /api/admin/feed-control/policy                — the global feed policy
 * PUT  /api/admin/feed-control/policy                — update the policy
 * POST /api/admin/feed-control/route-type            — route ONE type {slug, patch}
 * POST /api/admin/feed-control/bulk-route-types      — route MANY types {slugs, patch}
 * POST /api/admin/feed-control/route-card            — route ONE card {card_id, patch}
 * GET  /api/admin/feed-control/simulate?enrollment_id=&limit=  — dry-run "sees next + why"
 */
import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  getBoard, getFeedPolicy, setFeedPolicy, routeType, bulkRouteTypes, routeCard, simulate, listEnrollments,
} from '../../services/timeline/feedControlService';

const router = Router();
const adminId = (req: Request): string | undefined => (req as any).admin?.id || (req as any).user?.id;
const fail = (res: Response, e: any) => res.status(e?.status || 500).json({ ok: false, error: e?.message || 'error' });

router.get('/api/admin/feed-control/board', requireAdmin, async (_req, res) => {
  try { res.json({ ok: true, ...(await getBoard()) }); } catch (e) { fail(res, e); }
});

router.get('/api/admin/feed-control/policy', requireAdmin, async (_req, res) => {
  try { res.json({ ok: true, policy: await getFeedPolicy() }); } catch (e) { fail(res, e); }
});

router.put('/api/admin/feed-control/policy', requireAdmin, async (req, res) => {
  try { res.json({ ok: true, policy: await setFeedPolicy(req.body || {}, adminId(req)) }); } catch (e) { fail(res, e); }
});

router.post('/api/admin/feed-control/route-type', requireAdmin, async (req, res) => {
  try {
    const { slug, patch } = req.body || {};
    if (!slug) return res.status(400).json({ ok: false, error: 'slug required' });
    res.json({ ok: true, ...(await routeType(slug, patch || {}, adminId(req))) });
  } catch (e) { fail(res, e); }
});

router.post('/api/admin/feed-control/bulk-route-types', requireAdmin, async (req, res) => {
  try {
    const { slugs, patch } = req.body || {};
    if (!Array.isArray(slugs) || !slugs.length) return res.status(400).json({ ok: false, error: 'slugs[] required' });
    res.json({ ok: true, ...(await bulkRouteTypes(slugs, patch || {}, adminId(req))) });
  } catch (e) { fail(res, e); }
});

router.post('/api/admin/feed-control/route-card', requireAdmin, async (req, res) => {
  try {
    const { card_id, patch } = req.body || {};
    if (!card_id) return res.status(400).json({ ok: false, error: 'card_id required' });
    res.json({ ok: true, ...(await routeCard(card_id, patch || {}, adminId(req))) });
  } catch (e) { fail(res, e); }
});

router.get('/api/admin/feed-control/enrollments', requireAdmin, async (_req, res) => {
  try { res.json({ ok: true, enrollments: await listEnrollments(60) }); } catch (e) { fail(res, e); }
});

router.get('/api/admin/feed-control/simulate', requireAdmin, async (req, res) => {
  try {
    const enrollmentId = String(req.query.enrollment_id || '');
    if (!enrollmentId) return res.status(400).json({ ok: false, error: 'enrollment_id required' });
    const limit = Math.max(1, Math.min(30, parseInt(String(req.query.limit || '12'), 10) || 12));
    res.json({ ok: true, ...(await simulate(enrollmentId, limit)) });
  } catch (e) { fail(res, e); }
});

export default router;
