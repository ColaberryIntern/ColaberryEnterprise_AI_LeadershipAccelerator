import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

// Aggregate journey overview
router.get('/api/admin/user-journey-maps/overview', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getJourneyOverview } = await import('../../services/UserJourneyMapsService');
    res.json(await getJourneyOverview());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Platform-wide journey funnel
router.get('/api/admin/user-journey-maps/funnel', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getJourneyFunnel } = await import('../../services/UserJourneyMapsService');
    res.json(await getJourneyFunnel());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Stalled journeys
router.get('/api/admin/user-journey-maps/stalled', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getStalledJourneys } = await import('../../services/UserJourneyMapsService');
    res.json(await getStalledJourneys());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Leads at a specific stage
router.get('/api/admin/user-journey-maps/stage/:stage', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getStageBreakdown } = await import('../../services/UserJourneyMapsService');
    res.json(await getStageBreakdown(req.params.stage as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// List journey map templates (with search, pagination, filters)
router.get('/api/admin/user-journey-maps', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getJourneyMaps } = await import('../../services/UserJourneyMapsService');
    const params = {
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      project_id: req.query.project_id as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };
    res.json(await getJourneyMaps(params));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Get single journey map template
router.get('/api/admin/user-journey-maps/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getJourneyMapById } = await import('../../services/UserJourneyMapsService');
    const map = await getJourneyMapById(req.params.id as string);
    if (!map) { res.status(404).json({ error: 'Journey map not found' }); return; }
    res.json(map);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Create journey map template
router.post('/api/admin/user-journey-maps', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { createJourneyMap } = await import('../../services/UserJourneyMapsService');
    const map = await createJourneyMap(req.body);
    res.status(201).json(map);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Seed persona journey map templates
router.post('/api/admin/user-journey-maps/seed', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { seedPersonaJourneyMaps } = await import('../../services/UserJourneyMapsService');
    res.json(await seedPersonaJourneyMaps());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Update journey map template
router.put('/api/admin/user-journey-maps/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { updateJourneyMap } = await import('../../services/UserJourneyMapsService');
    res.json(await updateJourneyMap(req.params.id as string, req.body));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
