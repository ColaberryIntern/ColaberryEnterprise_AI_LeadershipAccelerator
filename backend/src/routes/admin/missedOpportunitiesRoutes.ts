// Missed Opportunities Report API. Executive visibility into the emails the
// Inbox COS routed away from the Inbox (hidden states), plus the feedback
// endpoints that drive the learning loop. All read endpoints are admin-only.

import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { InboxEmail } from '../../models';
import {
  getReport,
  getTopicDrilldown,
  recordFeedback,
  addSurfacePreference,
} from '../../services/inbox/missedOpportunitiesReportService';
import { runMissedOpportunitiesReport } from '../../services/inbox/missedOpportunitiesEmailService';
import type { FalseNegativeAction } from '../../models/InboxFalseNegativeFeedback';
import type { SurfacePatternType } from '../../models/InboxSurfacePreference';

const router = Router();
const BASE = '/api/admin/inbox/missed-opportunities';

const VALID_ACTIONS: FalseNegativeAction[] = ['restored', 'reopened', 'marked_important', 'moved_to_inbox'];
const VALID_PATTERNS: SurfacePatternType[] = ['sender', 'domain', 'topic'];

// Full report for a CT date (defaults to today). Recomputes scores first.
router.get(`${BASE}/report`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const report = await getReport(date);
    return res.json(report);
  } catch (err: any) {
    console.error('[MissedOpportunities] report failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Topic drilldown.
router.get(`${BASE}/topic/:topic`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const drill = await getTopicDrilldown(String(req.params.topic), date);
    return res.json(drill);
  } catch (err: any) {
    console.error('[MissedOpportunities] drilldown failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Open the original email (for "Open Email").
router.get(`${BASE}/email/:emailId`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const email = await InboxEmail.findByPk(String(req.params.emailId));
    if (!email) return res.status(404).json({ error: 'email not found' });
    return res.json({
      id: email.id,
      provider: email.provider,
      from_address: email.from_address,
      from_name: email.from_name,
      to_addresses: email.to_addresses,
      cc_addresses: email.cc_addresses,
      subject: email.subject,
      body_html: email.body_html,
      body_text: email.body_text,
      received_at: email.received_at,
      has_attachments: email.has_attachments,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Record learning feedback (restored / reopened / marked_important / moved_to_inbox).
router.post(`${BASE}/feedback`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { emailId, action } = req.body || {};
    if (!emailId || typeof emailId !== 'string') return res.status(400).json({ error: 'emailId required' });
    if (!VALID_ACTIONS.includes(action)) return res.status(400).json({ error: `action must be one of ${VALID_ACTIONS.join(', ')}` });
    await recordFeedback(emailId, action, 'report', (req as any).user?.email);
    return res.json({ ok: true });
  } catch (err: any) {
    const code = err.message === 'email not found' ? 404 : 500;
    return res.status(code).json({ error: err.message });
  }
});

// "Always show emails like this" — persist a surface preference.
router.post(`${BASE}/restore-preference`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { emailId, patternType } = req.body || {};
    if (!emailId || typeof emailId !== 'string') return res.status(400).json({ error: 'emailId required' });
    const pattern: SurfacePatternType = VALID_PATTERNS.includes(patternType) ? patternType : 'sender';
    const result = await addSurfacePreference(emailId, pattern, (req as any).user?.email);
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    const code = err.message === 'email not found' ? 404 : 500;
    return res.status(code).json({ error: err.message });
  }
});

// Send the report email on demand (forces a send regardless of the daily
// idempotency guard). Used for verification and ad-hoc executive requests.
router.post(`${BASE}/send`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : undefined;
    const result = await runMissedOpportunitiesReport({ force: true, recipients });
    return res.json(result);
  } catch (err: any) {
    console.error('[MissedOpportunities] manual send failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
