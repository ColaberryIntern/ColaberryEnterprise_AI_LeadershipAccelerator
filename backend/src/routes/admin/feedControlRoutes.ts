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
import { listPresets, savePreset, deletePreset } from '../../services/timeline/feedPresetsService';

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
    // Sandbox / what-if: when sandbox=1, treat ONLY the `include` slugs as active
    // (empty list = empty feed) instead of the live routing. Read-only either way.
    const sandbox = req.query.sandbox === '1' || req.query.sandbox === 'true';
    const includeTypes = sandbox
      ? String(req.query.include || '').split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    // CAPE Phase 6 (T014, design doc §12 "Explanation simulator"): `simulate()`
    // has always accepted `opts.useCapeRanker` (Phase 4, T009) to force the
    // CAPE pipeline in preview even when `env.capeLearningValueRankerEnabled`
    // is off — but nothing here ever forwarded a caller's request for it until
    // now. Default `false` is EXACTLY equivalent to the pre-existing
    // 3-argument call this route always made (omitted === false, both fail
    // the `opts.useCapeRanker === true` check the same way) — no behavior
    // change for any existing caller that doesn't pass this param.
    const useCapeRanker = req.query.use_cape_ranker === '1' || req.query.use_cape_ranker === 'true';
    res.json({ ok: true, ...(await simulate(enrollmentId, limit, includeTypes, { useCapeRanker })) });
  } catch (e) { fail(res, e); }
});

// Named, reusable feed configurations (the sandbox selection saved by name).
router.get('/api/admin/feed-control/presets', requireAdmin, async (_req, res) => {
  try { res.json({ ok: true, presets: await listPresets() }); } catch (e) { fail(res, e); }
});
router.post('/api/admin/feed-control/presets', requireAdmin, async (req, res) => {
  try {
    const { name, includes } = req.body || {};
    const preset = await savePreset(String(name || ''), Array.isArray(includes) ? includes : [], adminId(req));
    res.json({ ok: true, preset });
  } catch (e) { fail(res, e); }
});
router.delete('/api/admin/feed-control/presets/:id', requireAdmin, async (req, res) => {
  try { await deletePreset(String(req.params.id), adminId(req)); res.json({ ok: true }); } catch (e) { fail(res, e); }
});

export default router;
