import { Request, Response, NextFunction } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import WebsiteIssue from '../models/WebsiteIssue';
import { runAllWebsiteIntelligence } from '../services/aiOrchestrator';

/**
 * GET /api/admin/website-intelligence/issues
 * List issues with optional filters: type, status, severity, page
 */
export async function handleGetIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, status, severity, page, limit = '50', offset = '0' } = req.query;
    const where: any = {};
    if (type) where.issue_type = type;
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (page) where.page_url = page;

    const { rows, count } = await WebsiteIssue.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(limit as string, 10), 200),
      offset: parseInt(offset as string, 10),
    });

    res.json({ issues: rows, total: count });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/website-intelligence/issues/:id
 * Single issue detail
 */
export async function handleGetIssueDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const issue = await WebsiteIssue.findByPk(req.params.id as string);
    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }
    res.json(issue);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/website-intelligence/issues/:id
 * Update issue status (approve, reject, resolve)
 */
export async function handleUpdateIssue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const issue = await WebsiteIssue.findByPk(req.params.id as string);
    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const { status } = req.body;
    const validStatuses = ['open', 'approved', 'rejected', 'resolved'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const updates: any = { status, updated_at: new Date() };
    if (status === 'resolved') {
      updates.repaired_at = new Date();
      updates.repaired_by = 'admin';
    }

    await issue.update(updates);
    res.json(issue);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/website-intelligence/summary
 * Aggregated stats
 */
export async function handleGetSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const byType = await WebsiteIssue.findAll({
      attributes: ['issue_type', [fn('COUNT', col('id')), 'count']],
      group: ['issue_type'],
      raw: true,
    }) as any[];

    const byStatus = await WebsiteIssue.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    }) as any[];

    const bySeverity = await WebsiteIssue.findAll({
      attributes: ['severity', [fn('COUNT', col('id')), 'count']],
      group: ['severity'],
      raw: true,
    }) as any[];

    const total = await WebsiteIssue.count();
    const openCount = await WebsiteIssue.count({ where: { status: 'open' } });
    const autoRepaired = await WebsiteIssue.count({ where: { status: 'auto_repaired' } });

    // Recent issues (last 24h)
    const recent = await WebsiteIssue.count({
      where: { created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    res.json({
      total,
      open: openCount,
      auto_repaired: autoRepaired,
      recent_24h: recent,
      by_type: byType.reduce((acc: any, r: any) => ({ ...acc, [r.issue_type]: parseInt(r.count, 10) }), {}),
      by_status: byStatus.reduce((acc: any, r: any) => ({ ...acc, [r.status]: parseInt(r.count, 10) }), {}),
      by_severity: bySeverity.reduce((acc: any, r: any) => ({ ...acc, [r.severity]: parseInt(r.count, 10) }), {}),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/website-intelligence/scan
 * Trigger manual scan — runs all website intelligence agents
 */
export async function handleTriggerScan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Fire and forget — return immediately
    res.json({ message: 'Website intelligence scan started', status: 'running' });

    // Run in background
    runAllWebsiteIntelligence().catch((err) => {
      console.error('[Website Intelligence] Scan failed:', err.message);
    });
  } catch (err) {
    next(err);
  }
}
