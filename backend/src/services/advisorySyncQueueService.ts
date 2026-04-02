import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

/**
 * Simple DB-backed sync queue for advisory events.
 * Stores failed webhook deliveries for retry.
 */
export async function enqueueSyncItem(
  eventType: string,
  payload: Record<string, any>,
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO ai_system_events (id, source, event_type, entity_type, entity_id, details, created_at)
       VALUES (gen_random_uuid(), 'advisory_sync_queue', :eventType, 'sync_item', 'pending', :payload::jsonb, NOW())`,
      {
        replacements: {
          eventType,
          payload: JSON.stringify({ ...payload, sync_status: 'pending', attempts: 0 }),
        },
        type: QueryTypes.RAW,
      }
    );
  } catch (err: any) {
    console.warn(`[SyncQueue] Failed to enqueue: ${err.message}`);
  }
}

export async function processPendingSyncItems(): Promise<number> {
  try {
    const pending = await sequelize.query(
      `SELECT id, event_type, details FROM ai_system_events
       WHERE source = 'advisory_sync_queue' AND (details->>'sync_status') = 'pending'
       AND (COALESCE((details->>'attempts')::int, 0)) < 3
       ORDER BY created_at LIMIT 10`,
      { type: QueryTypes.SELECT }
    ) as any[];

    let processed = 0;
    for (const item of pending) {
      try {
        // Mark as processing
        await sequelize.query(
          `UPDATE ai_system_events SET details = jsonb_set(details, '{sync_status}', '"processing"') WHERE id = :id`,
          { replacements: { id: item.id }, type: QueryTypes.RAW }
        );

        // Re-process the event through the advisory sync controller
        const { mapAdvisoryToLead } = require('./advisoryLeadMapperService');
        const { classifyAndRouteLead } = require('./offerRouterService');
        const payload = typeof item.details === 'string' ? JSON.parse(item.details) : item.details;

        if (payload.data) {
          const { lead } = await mapAdvisoryToLead(payload.data);
          await classifyAndRouteLead(lead.id);
        }

        // Mark as completed
        await sequelize.query(
          `UPDATE ai_system_events SET details = jsonb_set(details, '{sync_status}', '"completed"') WHERE id = :id`,
          { replacements: { id: item.id }, type: QueryTypes.RAW }
        );
        processed++;
      } catch (err: any) {
        const attempts = (item.details?.attempts || 0) + 1;
        const status = attempts >= 3 ? 'failed' : 'pending';
        await sequelize.query(
          `UPDATE ai_system_events SET details = jsonb_set(jsonb_set(details, '{sync_status}', :status::jsonb), '{attempts}', :attempts::jsonb) WHERE id = :id`,
          { replacements: { id: item.id, status: JSON.stringify(status), attempts: JSON.stringify(attempts) }, type: QueryTypes.RAW }
        );
      }
    }
    return processed;
  } catch (err: any) {
    console.warn(`[SyncQueue] Process failed: ${err.message}`);
    return 0;
  }
}
