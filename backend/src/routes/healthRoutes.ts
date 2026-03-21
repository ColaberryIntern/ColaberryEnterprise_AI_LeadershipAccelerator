import { Router, Request, Response } from 'express';

const router = Router();

// Lightweight ping for uptime monitors (UptimeRobot, Pingdom, etc.)
// Returns 200 if backend is running, 503 if DB is down
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const { sequelize } = require('../config/database');
    await sequelize.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), detail: 'database unreachable' });
  }
});

// Full system health report (for admin dashboard or detailed monitoring)
router.get('/health/full', async (_req: Request, res: Response) => {
  try {
    const { runFullSystemHealthCheck } = require('../services/systemHealthService');
    const report = await runFullSystemHealthCheck();
    const statusCode = report.overall_status === 'critical' ? 503 : 200;
    res.status(statusCode).json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
