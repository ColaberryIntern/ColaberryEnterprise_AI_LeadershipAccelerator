import { sequelize } from '../config/database';

/**
 * Weekly Live recap (Basecamp WL1.1, Ali 2026-11-24): after class, everyone who checked in gets a
 * recap email with a visual overview, a personal link back to the class page and its chat, and the
 * next event's Eventbrite link.
 *
 * Three tables, created at startup like every other ensure*Schema (prod never alter-syncs):
 *  - weekly_live_recaps: one row per session holding the editable overview and the next-event link.
 *  - weekly_live_recap_sends: one row per (session, email). The UNIQUE key is the idempotency
 *    guarantee: a recap can never reach the same address twice for the same class, whatever reruns.
 *  - weekly_live_recap_optouts: email-keyed opt-out. Guests from the livestream often have no lead
 *    record, so the lead-keyed unsubscribe_events table cannot hold their choice on its own.
 */
export const WEEKLY_LIVE_RECAP_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS weekly_live_recaps (
     session_id UUID PRIMARY KEY REFERENCES live_sessions(id),
     summary JSONB,
     next_event_url VARCHAR(500),
     test_sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS weekly_live_recap_sends (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     session_id UUID NOT NULL REFERENCES live_sessions(id),
     guest_id UUID REFERENCES session_guests(id),
     email_lower VARCHAR(254) NOT NULL,
     status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
     skip_reason VARCHAR(64),
     message_id VARCHAR(255),
     error_class VARCHAR(64),
     attempts INTEGER NOT NULL DEFAULT 0,
     sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_live_recap_sends ON weekly_live_recap_sends (session_id, email_lower)`,
  `CREATE TABLE IF NOT EXISTS weekly_live_recap_optouts (
     email_lower VARCHAR(254) PRIMARY KEY,
     source VARCHAR(32) NOT NULL DEFAULT 'recap_link',
     created_at TIMESTAMPTZ DEFAULT NOW()
   )`,
];

export async function ensureWeeklyLiveRecapSchema(): Promise<void> {
  for (const ddl of WEEKLY_LIVE_RECAP_DDL) await sequelize.query(ddl);
}
