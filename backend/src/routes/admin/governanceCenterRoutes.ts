/**
 * Governance Command Center API Routes
 *
 * Unified CRUD surface for the centralized governance tables:
 * - GovernanceConfig (global system limits)
 * - CronScheduleConfig (agent schedules)
 * - CampaignGovernanceConfig (per-campaign overrides)
 * - RiskScoringConfig (risk scoring weights)
 */

import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { GovernanceConfig, CronScheduleConfig, CampaignGovernanceConfig, RiskScoringConfig } from '../../models';
import {
  resolveGlobalConfig,
  resolveAllCronSchedules,
  resolveCampaignGovernance,
  resolveRiskConfig,
  invalidateGovernanceCache,
  HARDCODED_DEFAULTS,
} from '../../services/governanceResolutionService';

const router = Router();
const BASE = '/api/admin/governance-center';

// ─── Global Governance Config ────────────────────────────────────────────────

router.get(`${BASE}/config`, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const resolved = await resolveGlobalConfig();
    res.json(resolved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(`${BASE}/config`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin?.sub || 'unknown';
    const allowedFields = [
      'autonomy_mode',
      'max_dynamic_agents',
      'max_agents_total',
      'max_auto_executions_per_hour',
      'max_risk_budget_per_hour',
      'max_proposed_pending',
      'max_concurrent_monitoring',
      'auto_execute_risk_threshold',
      'auto_execute_confidence_threshold',
      'max_experiments_per_agent',
      'max_system_experiments',
      'approval_required_for_critical',
      'autonomy_rules',
    ];

    const updates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.updated_by = adminId;
    updates.updated_at = new Date();

    let row = await GovernanceConfig.findOne({ where: { scope: 'global' } });
    if (!row) {
      row = await GovernanceConfig.create({
        scope: 'global',
        version: 1,
        ...HARDCODED_DEFAULTS,
        ...updates,
      } as any);
    } else {
      // Optimistic concurrency: bump version
      updates.version = (row.version || 1) + 1;
      await row.update(updates);
    }

    invalidateGovernanceCache();
    const resolved = await resolveGlobalConfig();
    res.json(resolved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cron Schedule Configs ───────────────────────────────────────────────────

router.get(`${BASE}/schedules`, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await CronScheduleConfig.findAll({ order: [['agent_name', 'ASC']] });
    res.json({ schedules: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(`${BASE}/schedules/resolved`, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const map = await resolveAllCronSchedules();
    const schedules = Array.from(map.values());
    res.json({ schedules });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(`${BASE}/schedules/:agentName`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agentName } = req.params;
    const adminId = (req as any).admin?.sub || 'unknown';
    const { active_schedule, enabled } = req.body;

    const row = await CronScheduleConfig.findOne({ where: { agent_name: agentName } });
    if (!row) {
      return res.status(404).json({ error: `Schedule for "${agentName}" not found` });
    }

    const updates: Record<string, any> = { updated_by: adminId, updated_at: new Date() };
    if (active_schedule !== undefined) updates.active_schedule = active_schedule;
    if (enabled !== undefined) updates.enabled = enabled;

    await row.update(updates);
    invalidateGovernanceCache();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post(`${BASE}/schedules/:agentName/reset`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agentName } = req.params;
    const adminId = (req as any).admin?.sub || 'unknown';

    const row = await CronScheduleConfig.findOne({ where: { agent_name: agentName } });
    if (!row) {
      return res.status(404).json({ error: `Schedule for "${agentName}" not found` });
    }

    await row.update({
      active_schedule: row.default_schedule,
      enabled: true,
      updated_by: adminId,
      updated_at: new Date(),
    } as any);

    invalidateGovernanceCache();
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Campaign Governance Configs ─────────────────────────────────────────────

router.get(`${BASE}/campaigns/:campaignId`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const resolved = await resolveCampaignGovernance(campaignId);
    res.json(resolved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put(`${BASE}/campaigns/:campaignId`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const adminId = (req as any).admin?.sub || 'unknown';
    const allowedFields = [
      'max_unsubscribe_rate', 'max_bounce_rate', 'max_sms_failure_rate',
      'min_open_rate', 'min_reply_rate', 'ramp_profile',
    ];

    const data: Record<string, any> = { campaign_id: campaignId, updated_by: adminId, updated_at: new Date() };
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }

    const [row, created] = await CampaignGovernanceConfig.findOrCreate({
      where: { campaign_id: campaignId },
      defaults: data as any,
    });

    if (!created) {
      await row.update(data);
    }

    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Risk Scoring Config ─────────────────────────────────────────────────────

router.get(`${BASE}/risk-scoring`, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const resolved = await resolveRiskConfig();
    res.json(resolved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(`${BASE}/risk-scoring`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin?.sub || 'unknown';
    const { blast_radius_weights, reversibility_weights, intent_thresholds } = req.body;

    let row = await RiskScoringConfig.findOne();
    const updates: Record<string, any> = { updated_by: adminId, updated_at: new Date() };
    if (blast_radius_weights !== undefined) updates.blast_radius_weights = blast_radius_weights;
    if (reversibility_weights !== undefined) updates.reversibility_weights = reversibility_weights;
    if (intent_thresholds !== undefined) updates.intent_thresholds = intent_thresholds;

    if (!row) {
      row = await RiskScoringConfig.create(updates as any);
    } else {
      await row.update(updates);
    }

    invalidateGovernanceCache();
    const resolved = await resolveRiskConfig();
    res.json(resolved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
