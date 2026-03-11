import { Router, Request, Response } from 'express';
import {
  getDepartments,
  getDepartmentDetail,
  getInitiatives,
  getInitiativeDetail,
  getRoadmap,
  getDepartmentTimeline,
  getInnovationScores,
  getRevenueImpact,
} from '../../services/departmentIntelligenceService';

const router = Router();

// List all departments with scores
router.get('/api/admin/intelligence/departments', async (_req: Request, res: Response) => {
  try {
    const departments = await getDepartments();
    res.json({ departments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Department detail (all 7 sections)
router.get('/api/admin/intelligence/departments/:id', async (req: Request, res: Response) => {
  try {
    const detail = await getDepartmentDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Department not found' });
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// All initiatives (filterable)
router.get('/api/admin/intelligence/initiatives', async (req: Request, res: Response) => {
  try {
    const initiatives = await getInitiatives({
      department_id: req.query.department_id as string,
      status: req.query.status as string,
      priority: req.query.priority as string,
    });
    res.json({ initiatives });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Initiative detail
router.get('/api/admin/intelligence/initiatives/:id', async (req: Request, res: Response) => {
  try {
    const initiative = await getInitiativeDetail(req.params.id);
    if (!initiative) return res.status(404).json({ error: 'Initiative not found' });
    res.json(initiative);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Roadmap data (all depts, quarter-based)
router.get('/api/admin/intelligence/roadmap', async (_req: Request, res: Response) => {
  try {
    const roadmap = await getRoadmap();
    res.json({ roadmap });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cross-department event feed
router.get('/api/admin/intelligence/department-timeline', async (req: Request, res: Response) => {
  try {
    const events = await getDepartmentTimeline({
      department_id: req.query.department_id as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Innovation scores by department
router.get('/api/admin/intelligence/innovation-scores', async (_req: Request, res: Response) => {
  try {
    const scores = await getInnovationScores();
    res.json({ scores });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revenue impact by dept/initiative
router.get('/api/admin/intelligence/revenue-impact', async (req: Request, res: Response) => {
  try {
    const impact = await getRevenueImpact({
      department_id: req.query.department_id as string,
    });
    res.json(impact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
