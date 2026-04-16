import { Request, Response } from 'express';
import { Op, literal } from 'sequelize';
import { sequelize } from '../config/database';
import InboxEmail from '../models/InboxEmail';
import InboxClassification from '../models/InboxClassification';
import InboxReplyDraft from '../models/InboxReplyDraft';
import InboxRule from '../models/InboxRule';
import InboxVip from '../models/InboxVip';
import InboxAuditLog from '../models/InboxAuditLog';
import InboxLearningEvent from '../models/InboxLearningEvent';
import InboxStyleProfile from '../models/InboxStyleProfile';
import { logAuditEvent } from '../services/inbox/inboxAuditService';

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function handleGetStats(req: Request, res: Response) {
  try {
    const [stateBreakdown] = await sequelize.query(`
      SELECT state, COUNT(*)::int as count
      FROM inbox_classifications
      GROUP BY state
    `) as [any[], unknown];

    const pendingDrafts = await InboxReplyDraft.count({ where: { status: 'pending_approval' } });
    const silentHoldCount = await InboxClassification.count({ where: { state: 'SILENT_HOLD' } });
    const totalEmails = await InboxEmail.count();

    res.json({
      total_emails: totalEmails,
      silent_hold_count: silentHoldCount,
      pending_drafts: pendingDrafts,
      state_breakdown: stateBreakdown,
    });
  } catch (err: any) {
    console.error('[InboxCOS] Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── Decisions Queue ──────────────────────────────────────────────────────────

export async function handleGetDecisions(req: Request, res: Response) {
  try {
    const { state, provider, confidence_min, confidence_max, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = {};
    if (state) where.state = state;
    if (confidence_min || confidence_max) {
      where.confidence = {};
      if (confidence_min) where.confidence[Op.gte] = parseInt(confidence_min as string, 10);
      if (confidence_max) where.confidence[Op.lte] = parseInt(confidence_max as string, 10);
    }

    const emailWhere: any = {};
    if (provider) emailWhere.provider = provider;

    const { count, rows } = await InboxClassification.findAndCountAll({
      where,
      order: [['classified_at', 'DESC']],
      limit: parseInt(limit as string, 10),
      offset,
    });

    const emailIds = rows.map((r: any) => r.email_id);
    const emails = await InboxEmail.findAll({ where: { id: emailIds, ...emailWhere } });
    const emailMap = new Map(emails.map((e: any) => [e.id, e]));

    const results = rows.map((c: any) => ({
      classification: c.toJSON(),
      email: emailMap.get(c.email_id)?.toJSON() || null,
    }));

    res.json({ total: count, page: parseInt(page as string, 10), results });
  } catch (err: any) {
    console.error('[InboxCOS] GetDecisions error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetDecisionDetail(req: Request, res: Response) {
  try {
    const emailId = req.params.emailId as string;
    const email = await InboxEmail.findByPk(emailId);
    if (!email) return res.status(404).json({ error: 'Email not found' });

    const classification = await InboxClassification.findOne({ where: { email_id: emailId } });
    const drafts = await InboxReplyDraft.findAll({ where: { email_id: emailId } });
    const auditTrail = await InboxAuditLog.findAll({
      where: { email_id: emailId },
      order: [['created_at', 'ASC']],
    });

    res.json({
      email: email.toJSON(),
      classification: classification?.toJSON() || null,
      drafts: drafts.map((d: any) => d.toJSON()),
      audit_trail: auditTrail.map((a: any) => a.toJSON()),
    });
  } catch (err: any) {
    console.error('[InboxCOS] GetDecisionDetail error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function handleReclassify(req: Request, res: Response) {
  try {
    const emailId = req.params.emailId as string;
    const new_state = req.body.new_state as string;
    if (!['INBOX', 'AUTOMATION', 'SILENT_HOLD', 'ASK_USER'].includes(new_state)) {
      return res.status(400).json({ error: 'Invalid state' });
    }

    const classification = await InboxClassification.findOne({ where: { email_id: emailId } });
    if (!classification) return res.status(404).json({ error: 'Classification not found' });

    const oldState = (classification as any).state;
    await classification.update({
      previous_state: oldState,
      state: new_state as any,
      overridden_at: new Date(),
      classified_by: 'user_override' as any,
    });

    await logAuditEvent({
      email_id: emailId,
      action: 'reclassified',
      old_state: oldState,
      new_state,
      actor: 'user',
      reasoning: `User override: ${oldState} → ${new_state}`,
    });

    // Generate a reply draft when promoting to INBOX
    if (new_state === 'INBOX') {
      try {
        const { generateDraft } = await import('../services/inbox/replyDraftService');
        await generateDraft(emailId);
      } catch (draftErr: any) {
        console.log(`[InboxCOS] Draft generation after promote: ${draftErr.message}`);
      }
    }

    res.json({ success: true, classification: classification.toJSON() });
  } catch (err: any) {
    console.error('[InboxCOS] Reclassify error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function handleBatchReclassify(req: Request, res: Response) {
  try {
    const { email_ids, new_state } = req.body;
    if (!Array.isArray(email_ids) || !new_state) {
      return res.status(400).json({ error: 'email_ids (array) and new_state required' });
    }

    let updated = 0;
    for (const emailId of email_ids) {
      const classification = await InboxClassification.findOne({ where: { email_id: emailId } });
      if (!classification) continue;
      const oldState = (classification as any).state;
      await classification.update({
        previous_state: oldState,
        state: new_state as any,
        overridden_at: new Date(),
        classified_by: 'user_override' as any,
      });
      await logAuditEvent({
        email_id: emailId,
        action: 'reclassified',
        old_state: oldState,
        new_state,
        actor: 'user',
        reasoning: `Batch override: ${oldState} → ${new_state}`,
      });
      updated++;
    }

    res.json({ success: true, updated });
  } catch (err: any) {
    console.error('[InboxCOS] BatchReclassify error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── Draft Approval Queue ─────────────────────────────────────────────────────

export async function handleGetDrafts(req: Request, res: Response) {
  try {
    const status = (req.query.status as string) || 'pending_approval';
    const page = (req.query.page as string) || '1';
    const limit = (req.query.limit as string) || '50';
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { count, rows } = await InboxReplyDraft.findAndCountAll({
      where: { status: status as any },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit as string, 10),
      offset,
    });

    const emailIds = rows.map((r: any) => r.email_id);
    const emails = await InboxEmail.findAll({ where: { id: emailIds } });
    const emailMap = new Map(emails.map((e: any) => [e.id, e]));

    const results = rows.map((d: any) => ({
      draft: d.toJSON(),
      email: emailMap.get(d.email_id)?.toJSON() || null,
    }));

    res.json({ total: count, page: parseInt(page as string, 10), results });
  } catch (err: any) {
    console.error('[InboxCOS] GetDrafts error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function handleApproveDraft(req: Request, res: Response) {
  try {
    const draftId = req.params.draftId as string;
    const { edited_body } = req.body;

    const { approveDraft } = await import('../services/inbox/replyDraftService');
    const draft = await approveDraft(draftId, edited_body || undefined);
    res.json({ success: true, draft });
  } catch (err: any) {
    console.error('[InboxCOS] ApproveDraft error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function handleRejectDraft(req: Request, res: Response) {
  try {
    const draftId = req.params.draftId as string;
    const { reason } = req.body;

    const { rejectDraft } = await import('../services/inbox/replyDraftService');
    await rejectDraft(draftId, reason);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[InboxCOS] RejectDraft error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── Rule Builder ─────────────────────────────────────────────────────────────

export async function handleGetRules(req: Request, res: Response) {
  try {
    const rules = await InboxRule.findAll({ order: [['priority', 'ASC']] });
    res.json({ rules: rules.map((r: any) => r.toJSON()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreateRule(req: Request, res: Response) {
  try {
    const { name, rule_type, conditions, target_state, priority, enabled } = req.body;
    if (!name || !rule_type || !conditions || !target_state) {
      return res.status(400).json({ error: 'name, rule_type, conditions, target_state required' });
    }
    const rule = await InboxRule.create({
      name, rule_type, conditions, target_state,
      priority: priority ?? 100,
      enabled: enabled ?? true,
      created_by: 'admin',
    });
    await logAuditEvent({ action: 'rule_created', metadata: { rule_id: (rule as any).id, name } });
    res.status(201).json({ rule: rule.toJSON() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateRule(req: Request, res: Response) {
  try {
    const ruleId = req.params.ruleId as string;
    const rule = await InboxRule.findByPk(ruleId);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    await rule.update(req.body);
    res.json({ rule: rule.toJSON() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeleteRule(req: Request, res: Response) {
  try {
    const ruleId = req.params.ruleId as string;
    const deleted = await InboxRule.destroy({ where: { id: ruleId } });
    if (!deleted) return res.status(404).json({ error: 'Rule not found' });
    await logAuditEvent({ action: 'rule_deleted', metadata: { rule_id: ruleId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── VIP Manager ──────────────────────────────────────────────────────────────

export async function handleGetVips(req: Request, res: Response) {
  try {
    const vips = await InboxVip.findAll({ order: [['priority', 'ASC'], ['name', 'ASC']] });
    res.json({ vips: vips.map((v: any) => v.toJSON()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreateVip(req: Request, res: Response) {
  try {
    const { email_address, name, relationship, priority } = req.body;
    if (!email_address || !name) {
      return res.status(400).json({ error: 'email_address and name required' });
    }
    const vip = await InboxVip.create({
      email_address: email_address.toLowerCase().trim(),
      name, relationship: relationship || 'business',
      priority: priority ?? 100, added_by: 'user',
    });
    await logAuditEvent({ action: 'vip_added', metadata: { email: email_address, name } });
    res.status(201).json({ vip: vip.toJSON() });
  } catch (err: any) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'VIP with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateVip(req: Request, res: Response) {
  try {
    const vipId = req.params.vipId as string;
    const vip = await InboxVip.findByPk(vipId);
    if (!vip) return res.status(404).json({ error: 'VIP not found' });
    await vip.update(req.body);
    res.json({ vip: vip.toJSON() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeleteVip(req: Request, res: Response) {
  try {
    const vipId = req.params.vipId as string;
    const deleted = await InboxVip.destroy({ where: { id: vipId } });
    if (!deleted) return res.status(404).json({ error: 'VIP not found' });
    await logAuditEvent({ action: 'vip_removed', metadata: { vip_id: vipId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Learning Insights ────────────────────────────────────────────────────────

export async function handleGetLearningInsights(req: Request, res: Response) {
  try {
    const profiles = await InboxStyleProfile.findAll();
    const totalDrafts = await InboxReplyDraft.count();
    const approvedDrafts = await InboxReplyDraft.count({ where: { status: ['approved', 'sent'] } });
    const editedDrafts = await InboxReplyDraft.count({ where: { status: 'edited' } });
    const rejectedDrafts = await InboxReplyDraft.count({ where: { status: 'rejected' } });
    const recentEvents = await InboxLearningEvent.findAll({
      order: [['processed_at', 'DESC']],
      limit: 20,
    });

    res.json({
      total_drafts: totalDrafts,
      approval_rate: totalDrafts > 0 ? Math.round(((approvedDrafts + editedDrafts) / totalDrafts) * 100) : 0,
      edited_count: editedDrafts,
      rejected_count: rejectedDrafts,
      style_profiles: profiles.map((p: any) => p.toJSON()),
      recent_events: recentEvents.map((e: any) => e.toJSON()),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function handleGetAuditLogs(req: Request, res: Response) {
  try {
    const { action, actor, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

    const where: any = {};
    if (action) where.action = action;
    if (actor) where.actor = actor;

    const { count, rows } = await InboxAuditLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit as string, 10),
      offset,
    });

    const emailIds = rows.map((r: any) => r.email_id).filter(Boolean);
    const emails = emailIds.length > 0
      ? await InboxEmail.findAll({ where: { id: emailIds }, attributes: ['id', 'subject'] })
      : [];
    const subjectMap = new Map(emails.map((e: any) => [e.id, e.subject]));

    const results = rows.map((r: any) => {
      const json = r.toJSON();
      json.email_subject = subjectMap.get(json.email_id) || null;
      return json;
    });

    res.json({ total: count, page: parseInt(page as string, 10), results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Digest Action (stateless JWT — no admin auth) ────────────────────────────

export async function handleDigestAction(req: Request, res: Response) {
  try {
    const { token, emailId, action } = req.query;
    if (!token || !emailId || !action) {
      return res.status(400).send('<h2>Missing parameters</h2>');
    }

    const jwt = await import('jsonwebtoken');
    try {
      jwt.verify(token as string, process.env.JWT_SECRET || 'inbox-cos-secret');
    } catch {
      return res.status(401).send('<h2>Link expired or invalid</h2><p>Please use the admin console instead.</p>');
    }

    const stateMap: Record<string, string> = {
      inbox: 'INBOX',
      automation: 'AUTOMATION',
      hold: 'SILENT_HOLD',
    };
    const newState = stateMap[action as string];
    if (!newState) return res.status(400).send('<h2>Invalid action</h2>');

    const classification = await InboxClassification.findOne({ where: { email_id: emailId as string } });
    if (!classification) return res.status(404).send('<h2>Email not found</h2>');

    const oldState = (classification as any).state;
    await classification.update({
      previous_state: oldState,
      state: newState as any,
      overridden_at: new Date(),
      classified_by: 'digest_action' as any,
    });

    await logAuditEvent({
      email_id: emailId as string,
      action: 'digest_action',
      old_state: oldState,
      new_state: newState,
      actor: 'digest',
      reasoning: `User chose "${action}" from digest email`,
    });

    const stateLabels: Record<string, string> = {
      INBOX: 'moved to your Inbox',
      AUTOMATION: 'dismissed',
      SILENT_HOLD: 'kept on hold',
    };

    res.send(`
      <!DOCTYPE html>
      <html><head><title>Inbox COS</title></head>
      <body style="font-family: Arial, sans-serif; max-width: 500px; margin: 80px auto; text-align: center;">
        <h2 style="color: #38a169;">Done!</h2>
        <p>Email has been <strong>${stateLabels[newState]}</strong>.</p>
        <a href="${process.env.APP_BASE_URL || 'https://enterprise.colaberry.ai'}/admin/inbox/decisions"
           style="color: #2b6cb0;">Open Admin Console</a>
      </body></html>
    `);
  } catch (err: any) {
    console.error('[InboxCOS] DigestAction error:', err.message);
    res.status(500).send('<h2>Something went wrong</h2>');
  }
}
