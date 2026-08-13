import { sequelize } from '../config/database';

// D1 FIX — page_events.lead_id.
//
// contextGraphService.ts:135-139 has always queried:
//   SELECT COUNT(*) FROM page_events WHERE lead_id = :leadId AND event_type IN (...)
// but page_events has never had a lead_id column. Verified against
// accelerator_prod on 2026-08-12: the columns are id, session_id, visitor_id,
// event_type, page_url, page_path, page_title, page_category, event_data,
// timestamp, created_at.
//
// The consequence is silent and total: that query throws inside the Promise.all
// at contextGraphService.ts:72-140, so buildCompositeContext() throws, so the
// try/catch at schedulerService.ts:311 swallows it and leaves compositeContext
// undefined — which makes aiMessageService.buildUserPrompt fall through to its
// LEGACY branch (:209-303) instead of the grounded branch (:152-207) for EVERY
// campaign email the system has ever sent. No error surfaces; the copy just
// quietly loses engagement history, recent clicked URLs, cohort facts, and
// allowed-URL grounding.
//
// Additive and reversible: one nullable column plus two indexes. Deliberately NO
// foreign-key constraint — adding one would make Postgres validate every
// existing row against leads, taking a lock on a table that receives continuous
// tracking writes. visitor_sessions.lead_id, the column this one mirrors, has no
// FK either, so this matches the established shape rather than inventing a
// stricter one for a hot path.
export async function ensurePageEventLeadId(): Promise<void> {
  const statements: string[] = [
    `ALTER TABLE page_events ADD COLUMN IF NOT EXISTS lead_id INTEGER`,
    `CREATE INDEX IF NOT EXISTS idx_page_events_lead_id ON page_events (lead_id)`,
    // Serves the exact contextGraphService booking-attempt query shape. Partial,
    // because rows with a null lead_id are the majority and are never selected
    // by it — indexing them would cost write throughput for no read benefit.
    `CREATE INDEX IF NOT EXISTS idx_page_events_lead_event ON page_events (lead_id, event_type) WHERE lead_id IS NOT NULL`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] page_events.lead_id stmt skipped:', err?.message);
    }
  }
  console.log('[DB] page_events.lead_id ensured');
}
