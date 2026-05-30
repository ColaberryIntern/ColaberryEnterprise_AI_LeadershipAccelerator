// Admin UI backend for /admin/reports — list automated reports, view recent runs,
// toggle enabled, edit prompts, see schedules.
// Tables exist in DB but no Sequelize model yet; read via raw SQL through sequelize.
import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';

const router = Router();

interface AutomatedReportRow {
  id: string;
  name: string;
  description: string | null;
  script_path: string | null;
  cron_schedule: string | null;
  recipients: string[] | null;
  subject_prefix: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_message_id: string | null;
  prompt: string | null;
  frequency: string | null;
  notes: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

interface AutomatedReportRunRow {
  id: string;
  report_id: string;
  started_at: string;
  ended_at: string | null;
  status: string | null;
  message_ids: string[] | null;
  recipients_sent: string[] | null;
  error: string | null;
  triggered_by: string | null;
}

router.get('/api/admin/automated-reports', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await sequelize.query<AutomatedReportRow>(
      `SELECT id, name, description, script_path, cron_schedule, recipients, subject_prefix,
              enabled, last_run_at, last_status, last_message_id, prompt, frequency, notes,
              owner, created_at, updated_at
       FROM automated_reports
       ORDER BY name`,
      { type: QueryTypes.SELECT }
    );
    res.json({ reports: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/automated-reports/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [report] = await sequelize.query<AutomatedReportRow>(
      `SELECT * FROM automated_reports WHERE id = :id`,
      { type: QueryTypes.SELECT, replacements: { id: req.params.id } }
    );
    if (!report) return res.status(404).json({ error: 'Not found' });
    const runs = await sequelize.query<AutomatedReportRunRow>(
      `SELECT id, report_id, started_at, ended_at, status, message_ids, recipients_sent,
              error, triggered_by
       FROM automated_report_runs
       WHERE report_id = :id
       ORDER BY started_at DESC
       LIMIT 25`,
      { type: QueryTypes.SELECT, replacements: { id: req.params.id } }
    );
    return res.json({ report, runs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/api/admin/automated-reports/:id', requireAdmin, async (req: Request, res: Response) => {
  const allowed: Array<keyof AutomatedReportRow> = ['enabled', 'prompt', 'notes', 'cron_schedule', 'recipients', 'subject_prefix'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in req.body) updates[k] = (req.body as Record<string, unknown>)[k];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No allowed fields in body' });
  const setClause = Object.keys(updates).map((k) => `${k} = :${k}`).join(', ');
  try {
    await sequelize.query(
      `UPDATE automated_reports SET ${setClause}, updated_at = NOW() WHERE id = :id`,
      { replacements: { ...updates, id: req.params.id } }
    );
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/automated-reports/:id/runs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const runs = await sequelize.query<AutomatedReportRunRow>(
      `SELECT * FROM automated_report_runs WHERE report_id = :id ORDER BY started_at DESC LIMIT 100`,
      { type: QueryTypes.SELECT, replacements: { id: req.params.id } }
    );
    return res.json({ runs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
