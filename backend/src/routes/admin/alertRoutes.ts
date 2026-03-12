import { Router, Request, Response } from 'express';
import * as alertService from '../../services/alertService';

const router = Router();

// ─── List alerts with filters ───────────────────────────────────────────────

router.get('/api/admin/alerts', async (req: Request, res: Response) => {
  try {
    const { status, type, severity, department, impact_area, limit, offset } = req.query;
    const result = await alertService.getAlerts({
      status: status as string,
      type: type as string,
      severity: severity ? parseInt(severity as string, 10) : undefined,
      department: department as string,
      impactArea: impact_area as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Alert stats ────────────────────────────────────────────────────────────

router.get('/api/admin/alerts/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await alertService.getAlertStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Alert trends ───────────────────────────────────────────────────────────

router.get('/api/admin/alerts/trends', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d';
    const trends = await alertService.getAlertTrends(period as '24h' | '7d' | '30d');
    res.json(trends);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Subscriptions ──────────────────────────────────────────────────────────

router.get('/api/admin/alerts/subscriptions', async (_req: Request, res: Response) => {
  try {
    const subs = await alertService.getSubscriptions();
    res.json(subs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/alerts/subscriptions', async (req: Request, res: Response) => {
  try {
    const sub = await alertService.upsertSubscription({
      id: req.body.id,
      alertType: req.body.alert_type || '*',
      impactArea: req.body.impact_area || '*',
      minSeverity: req.body.min_severity || 1,
      channels: req.body.channels || ['dashboard'],
      enabled: req.body.enabled !== false,
    });
    res.json(sub);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/alerts/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await alertService.deleteSubscription(req.params.id as string);
    res.json({ deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Alert detail ───────────────────────────────────────────────────────────

router.get('/api/admin/alerts/:id', async (req: Request, res: Response) => {
  try {
    const result = await alertService.getAlertById(req.params.id as string);
    if (!result) return res.status(404).json({ error: 'Alert not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Alert actions ──────────────────────────────────────────────────────────

router.post('/api/admin/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const alert = await alertService.acknowledgeAlert(
      req.params.id as string,
      req.body.actor_type || 'human',
      req.body.actor_id || 'admin',
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found or already resolved' });
    res.json(alert);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/alerts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const alert = await alertService.resolveAlert(req.params.id as string, {
      resolutionType: req.body.resolution_type || 'manual',
      resolutionNotes: req.body.resolution_notes,
      actionsTaken: req.body.actions_taken,
      resolvedByType: req.body.resolved_by_type || 'human',
      resolvedById: req.body.resolved_by_id || 'admin',
    });
    if (!alert) return res.status(404).json({ error: 'Alert not found or already resolved' });
    res.json(alert);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/alerts/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const alert = await alertService.dismissAlert(
      req.params.id as string,
      req.body.reason || 'No reason provided',
      req.body.actor_type || 'human',
      req.body.actor_id || 'admin',
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found or already resolved' });
    res.json(alert);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
