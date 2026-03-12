import { Router, Request, Response } from 'express';
import {
  emitExecutiveEvent,
  getExecutiveEvents,
  getUnreadBadge,
  acknowledgeExecutiveEvent,
  acknowledgeAllExecutiveEvents,
  getPolicy,
  updatePolicy,
} from '../../services/executiveAwarenessService';

const router = Router();

// ─── List executive events ──────────────────────────────────────────────────

router.get('/api/admin/executive-awareness/events', async (req: Request, res: Response) => {
  try {
    const { severity, category, status, limit, offset } = req.query;
    const result = await getExecutiveEvents({
      severity: severity as string,
      category: category as string,
      status: status as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Badge (unread count + max severity) ────────────────────────────────────

router.get('/api/admin/executive-awareness/badge', async (_req: Request, res: Response) => {
  try {
    const badge = await getUnreadBadge();
    res.json(badge);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Acknowledge single event ───────────────────────────────────────────────

router.post('/api/admin/executive-awareness/acknowledge/:id', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).adminUser?.id || 'unknown';
    const alert = await acknowledgeExecutiveEvent(req.params.id, adminId);
    if (!alert) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json({ success: true, alert });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Acknowledge all events ─────────────────────────────────────────────────

router.post('/api/admin/executive-awareness/acknowledge-all', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).adminUser?.id || 'unknown';
    const count = await acknowledgeAllExecutiveEvents(adminId);
    res.json({ success: true, acknowledged: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get notification policy ────────────────────────────────────────────────

router.get('/api/admin/executive-awareness/policy', async (_req: Request, res: Response) => {
  try {
    const policy = await getPolicy();
    res.json({ policy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Update notification policy ─────────────────────────────────────────────

router.patch('/api/admin/executive-awareness/policy', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).adminUser?.id || 'unknown';
    const policy = await updatePolicy(req.body, adminId);
    if (!policy) {
      res.status(404).json({ error: 'Policy not found. Run seed first.' });
      return;
    }
    res.json({ success: true, policy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Test escalation ────────────────────────────────────────────────────────

router.post('/api/admin/executive-awareness/test-escalation', async (req: Request, res: Response) => {
  try {
    const { severity = 'important' } = req.body;
    const alert = await emitExecutiveEvent({
      category: 'system',
      severity,
      title: `Test escalation (${severity})`,
      description: 'This is a test event triggered from the Governance Command Center.',
      clusterKey: `test:escalation:${Date.now()}`,
      metadata: { test: true },
    });
    res.json({ success: true, alert, message: alert ? 'Test event emitted' : 'Event suppressed (check policy)' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
