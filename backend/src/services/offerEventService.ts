// Lightweight offer event logging - extends existing AiSystemEvent pattern
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

export type OfferEvent =
  | 'advisory.session.started'
  | 'advisory.session.completed'
  | 'advisory.lead.captured'
  | 'lead.offer.classified'
  | 'strategy_call.booked'
  | 'campaign.stage.updated';

export async function logOfferEvent(
  event: OfferEvent,
  entityType: string,
  entityId: string | number,
  details: Record<string, any>,
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO ai_system_events (id, source, event_type, entity_type, entity_id, details, created_at)
       VALUES (gen_random_uuid(), 'offer_engine', :event, :entityType, :entityId, :details::jsonb, NOW())`,
      {
        replacements: {
          event,
          entityType,
          entityId: String(entityId),
          details: JSON.stringify(details),
        },
        type: QueryTypes.RAW,
      }
    );
  } catch (err: any) {
    console.warn(`[OfferEvent] Failed to log ${event}: ${err.message}`);
  }
}
