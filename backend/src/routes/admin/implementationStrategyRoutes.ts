import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

// List implementation strategies (with search, pagination, filters)
router.get('/api/admin/implementation-strategies', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getImplementationStrategies } = await import('../../services/implementationStrategyService');
    const params = {
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      project_id: req.query.project_id as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };
    res.json(await getImplementationStrategies(params));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Get single implementation strategy
router.get('/api/admin/implementation-strategies/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getImplementationStrategyById } = await import('../../services/implementationStrategyService');
    const strategy = await getImplementationStrategyById(req.params.id as string);
    if (!strategy) { res.status(404).json({ error: 'Implementation strategy not found' }); return; }
    res.json(strategy);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Create implementation strategy
router.post('/api/admin/implementation-strategies', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { createImplementationStrategy } = await import('../../services/implementationStrategyService');
    const strategy = await createImplementationStrategy(req.body);
    res.status(201).json(strategy);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Update implementation strategy
router.put('/api/admin/implementation-strategies/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { updateImplementationStrategy } = await import('../../services/implementationStrategyService');
    res.json(await updateImplementationStrategy(req.params.id as string, req.body));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
