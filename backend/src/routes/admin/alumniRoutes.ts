import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { seedAlumniCampaigns } from '../../services/alumniCampaignService';
import { importAlumniAsLeads } from '../../services/alumniDataService';
import {
  detectInactiveLeads,
  detectReengagementComplete,
  getLifecycleStats,
  updateActivitySignal,
} from '../../services/campaignLifecycleService';

const router = Router();

// ── Seed Alumni Campaigns ────────────────────────────────────────────────

router.post('/api/admin/alumni/seed-campaigns', requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin?.sub || 'system';
    const result = await seedAlumniCampaigns(adminId);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Import Alumni from MSSQL ─────────────────────────────────────────────

router.post('/api/admin/alumni/import-leads', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await importAlumniAsLeads();
    res.json({
      created: result.created.length,
      updated: result.updated.length,
      skipped: result.skipped,
      errors: result.errors.length,
      error_details: result.errors.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lifecycle Status ─────────────────────────────────────────────────────

router.get('/api/admin/alumni/lifecycle-status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await getLifecycleStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Manual Lifecycle Run ─────────────────────────────────────────────────

router.post('/api/admin/alumni/run-lifecycle', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const inactiveResult = await detectInactiveLeads();
    const reengageResult = await detectReengagementComplete();
    res.json({
      inactivity_scan: inactiveResult,
      reengagement_scan: reengageResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Activity Signal Webhook ──────────────────────────────────────────────

router.post('/api/admin/alumni/activity-signal', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { lead_id, signal, metadata } = req.body;
    if (!lead_id || !signal) {
      return res.status(400).json({ error: 'lead_id and signal are required' });
    }
    await updateActivitySignal(lead_id, signal, metadata);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
