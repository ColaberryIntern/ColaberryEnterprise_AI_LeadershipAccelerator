import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

const router = Router();

// List communications with filters (paginated)
router.get('/api/admin/communications', requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '25', 10), 100);
    const offset = (page - 1) * limit;
    const channel = req.query.channel as string || '';
    const status = req.query.status as string || '';
    const campaignId = req.query.campaign_id as string || '';
    const dateFrom = req.query.dateFrom as string || '';
    const dateTo = req.query.dateTo as string || '';
    const search = req.query.search as string || '';

    const conditions: string[] = ["cl.direction = 'outbound'"];
    const replacements: Record<string, any> = { limit, offset };

    if (channel) {
      conditions.push('cl.channel = :channel');
      replacements.channel = channel;
    }
    if (status) {
      conditions.push('cl.status = :status');
      replacements.status = status;
    }
    if (campaignId) {
      conditions.push('cl.campaign_id = :campaignId');
      replacements.campaignId = campaignId;
    }
    if (dateFrom) {
      conditions.push('cl.created_at >= :dateFrom');
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      conditions.push("cl.created_at <= :dateTo::timestamp + interval '1 day'");
      replacements.dateTo = dateTo;
    }
    if (search) {
      conditions.push("(l.name ILIKE :search OR l.email ILIKE :search)");
      replacements.search = `%${search}%`;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count total
    const countResult = (await sequelize.query(
      `SELECT COUNT(*) as cnt FROM communication_logs cl LEFT JOIN leads l ON l.id = cl.lead_id ${whereClause}`,
      { replacements, type: QueryTypes.SELECT },
    )) as any[];
    const total = parseInt(countResult[0]?.cnt || '0', 10);

    // Fetch rows with lead + campaign context
    const rows = await sequelize.query(`
      SELECT cl.id, cl.lead_id, cl.campaign_id, cl.channel, cl.direction, cl.status,
        cl.to_address, cl.from_address, cl.subject, LEFT(cl.body, 200) as body_preview,
        cl.provider, cl.provider_message_id, cl.error_message,
        cl.metadata, cl.created_at,
        cl.provider_response->>'duration' as call_duration,
        cl.provider_response->>'end_call_reason' as call_disposition,
        cl.provider_response->>'transcript' IS NOT NULL as has_transcript,
        l.name as lead_name, l.email as lead_email, l.company as lead_company,
        l.lead_temperature, l.pipeline_stage,
        c.name as campaign_name,
        (SELECT json_agg(json_build_object('outcome', io.outcome, 'at', io.created_at) ORDER BY io.created_at)
         FROM interaction_outcomes io
         WHERE io.lead_id = cl.lead_id AND io.channel = cl.channel
         AND io.created_at BETWEEN cl.created_at - interval '1 minute' AND cl.created_at + interval '24 hours'
         LIMIT 5
        ) as outcomes
      FROM communication_logs cl
      LEFT JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN campaigns c ON c.id = cl.campaign_id
      ${whereClause}
      ORDER BY cl.created_at DESC
      LIMIT :limit OFFSET :offset
    `, { replacements, type: QueryTypes.SELECT });

    res.json({
      rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('[Communications] List error:', err.message);
    res.status(500).json({ error: 'Failed to load communications' });
  }
});

// Get full detail for one communication
router.get('/api/admin/communications/:id/detail', requireAdmin, async (req: Request, res: Response) => {
  try {
    const commId = req.params.id as string;

    // The communication log record
    const commRows = await sequelize.query(`
      SELECT cl.*,
        cl.provider_response->>'transcript' as transcript,
        cl.provider_response->>'duration' as call_duration,
        cl.provider_response->>'end_call_reason' as call_disposition,
        cl.provider_response->>'recording_url' as recording_url,
        l.name as lead_name, l.email as lead_email, l.company as lead_company,
        l.phone as lead_phone, l.lead_temperature, l.pipeline_stage, l.lead_score,
        c.name as campaign_name, c.status as campaign_status
      FROM communication_logs cl
      LEFT JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN campaigns c ON c.id = cl.campaign_id
      WHERE cl.id = :commId
    `, { replacements: { commId }, type: QueryTypes.SELECT });

    if (!(commRows as any[]).length) {
      res.status(404).json({ error: 'Communication not found' });
      return;
    }
    const comm = (commRows as any[])[0];

    // Fire the 4 context queries in parallel — they only depend on
    // comm (from query 1), not on each other. Cuts detail load ~2-4x.
    const seId = comm.metadata?.scheduled_email_id;
    const [outcomes, tempHistory, enrollmentRows, scheduledRows] = await Promise.all([
      sequelize.query(`
        SELECT outcome, channel, step_index, metadata, created_at
        FROM interaction_outcomes
        WHERE lead_id = :leadId
        AND created_at BETWEEN :from::timestamp - interval '1 hour' AND :from::timestamp + interval '48 hours'
        ORDER BY created_at ASC
      `, {
        replacements: { leadId: comm.lead_id, from: comm.created_at },
        type: QueryTypes.SELECT,
      }),
      sequelize.query(`
        SELECT previous_temperature, new_temperature, trigger_type, trigger_detail, created_at
        FROM lead_temperature_history
        WHERE lead_id = :leadId
        AND created_at BETWEEN :from::timestamp - interval '1 day' AND :from::timestamp + interval '2 days'
        ORDER BY created_at ASC
      `, {
        replacements: { leadId: comm.lead_id, from: comm.created_at },
        type: QueryTypes.SELECT,
      }),
      comm.campaign_id
        ? sequelize.query(`
            SELECT cl.status as enrollment_status, cl.enrolled_at,
              (SELECT COUNT(*) FROM scheduled_emails se WHERE se.lead_id = :leadId AND se.campaign_id = cl.campaign_id AND se.status = 'sent') as steps_completed,
              (SELECT jsonb_array_length(fs.steps) FROM follow_up_sequences fs WHERE fs.id = c.sequence_id) as total_steps
            FROM campaign_leads cl
            JOIN campaigns c ON c.id = cl.campaign_id
            WHERE cl.lead_id = :leadId AND cl.campaign_id = :campaignId
            LIMIT 1
          `, {
            replacements: { leadId: comm.lead_id, campaignId: comm.campaign_id },
            type: QueryTypes.SELECT,
          })
        : Promise.resolve([] as any[]),
      seId
        ? sequelize.query(`
            SELECT id, step_index, channel, subject, body, ai_generated, ai_instructions,
              scheduled_for, sent_at, status
            FROM scheduled_emails WHERE id = :seId
          `, { replacements: { seId }, type: QueryTypes.SELECT })
        : Promise.resolve([] as any[]),
    ]);

    const enrollment = enrollmentRows as any[];
    const scheduledAction = (scheduledRows as any[])[0] || null;

    res.json({
      communication: comm,
      outcomes,
      temperature_changes: tempHistory,
      enrollment: (enrollment as any)[0] || null,
      scheduled_action: scheduledAction,
    });
  } catch (err: any) {
    console.error('[Communications] Detail error:', err.message);
    res.status(500).json({ error: 'Failed to load communication detail' });
  }
});

// Campaign list for filter dropdown
router.get('/api/admin/communications/campaigns', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const campaigns = await sequelize.query(`
      SELECT id, name FROM campaigns WHERE status = 'active' ORDER BY name
    `, { type: QueryTypes.SELECT });
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
