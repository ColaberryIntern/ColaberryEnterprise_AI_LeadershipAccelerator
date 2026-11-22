import { sequelize } from '../config/database';

/**
 * Career Prep v27, CP10.3 (kit F8 "Follow-ups"): the emails an employer schedules to a candidate from the portal.
 * Its own file because ensurePlacementSchema.ts is at its size limit (as ensureHireClientSchema.ts); run at boot right
 * after the employer tables (boot/placementBoot.ts). Additive and re-runnable: every statement is IF NOT EXISTS.
 *
 *   employer_follow_ups        one scheduled email. id IS the idempotency key (the page makes one per "Schedule it"),
 *                              so a retried request stores one row. client_id scopes every read. member_id is the person
 *                              it is sent as (and Reply-To); SET NULL when they lose access, and the scheduler then
 *                              cancels instead of sending in the name of someone who is gone. The body is stored as
 *                              typed, merge fields and all; it is merged at send time. status:
 *                                scheduled -> sending -> sent -> opened -> clicked   (engagement only moves it forward)
 *                                scheduled -> held       the send time came while employer email was switched off
 *                                scheduled -> cancelled  by the employer, or at send time (they replied, the candidate or
 *                                                        sender lost access); status_reason says which
 *                                sending   -> scheduled  a failed try with a retry left (next_attempt_at)
 *                                sending   -> failed     the last try failed, or the message can no longer be sent
 *                              ('replied' is in the CHECK for completeness; the portal shows "Replied" from the offers,
 *                              services/placement/followUpStore.ts, so it never goes stale.)
 *                              link = the one link in the message as sent (a click on it counts under "link").
 *   employer_follow_up_events  one row per Mandrill engagement event (sha256 of the message id, kind, time and url), so
 *                              a webhook delivered twice counts once. No IP, user agent or location is stored.
 */
export const EMPLOYER_FOLLOW_UP_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS employer_follow_ups (
     id UUID PRIMARY KEY,
     client_id UUID NOT NULL REFERENCES hire_clients(id) ON DELETE CASCADE,
     member_id UUID REFERENCES hire_client_members(id) ON DELETE SET NULL,
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     offer_id UUID REFERENCES placement_offers(id) ON DELETE SET NULL,
     to_email VARCHAR(254),
     subject VARCHAR(150) NOT NULL CHECK (length(btrim(subject)) > 0),
     body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
     booking_link VARCHAR(500),
     link VARCHAR(500),
     template VARCHAR(20) NOT NULL CHECK (template IN ('thank_you','next_steps','offer_reminder','custom')),
     send_on TIMESTAMPTZ NOT NULL,
     only_if VARCHAR(10) NOT NULL CHECK (only_if IN ('no_reply','always')),
     status VARCHAR(12) NOT NULL DEFAULT 'scheduled'
       CHECK (status IN ('scheduled','sending','sent','opened','clicked','replied','cancelled','failed','held')),
     status_reason VARCHAR(40),
     attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
     next_attempt_at TIMESTAMPTZ,
     last_attempt_at TIMESTAMPTZ,
     last_error_class VARCHAR(60),
     mandrill_id VARCHAR(250),
     sent_at TIMESTAMPTZ,
     opens INTEGER NOT NULL DEFAULT 0 CHECK (opens >= 0),
     clicks JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_by VARCHAR(120) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // The scheduler's scan: only rows that can still go.
  "CREATE INDEX IF NOT EXISTS idx_employer_follow_ups_due ON employer_follow_ups (send_on) WHERE status IN ('scheduled','sending')",
  'CREATE INDEX IF NOT EXISTS idx_employer_follow_ups_client ON employer_follow_ups (client_id, send_on DESC)',
  `CREATE TABLE IF NOT EXISTS employer_follow_up_events (
     event_key CHAR(64) PRIMARY KEY,
     follow_up_id UUID NOT NULL REFERENCES employer_follow_ups(id) ON DELETE CASCADE,
     kind VARCHAR(5) NOT NULL CHECK (kind IN ('open','click')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
];

/** Run by hand to roll the follow-up tables back. Never run at boot. Dependents first. */
export const EMPLOYER_FOLLOW_UP_SCHEMA_ROLLBACK: readonly string[] = [
  'DROP TABLE IF EXISTS employer_follow_up_events',
  'DROP TABLE IF EXISTS employer_follow_ups',
];

/** Boot: create what is missing. A statement that fails is logged and skipped; boot continues. */
export async function ensureEmployerFollowUpSchema(): Promise<void> {
  for (const sql of EMPLOYER_FOLLOW_UP_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'employer_follow_up_schema_stmt_skipped',
        outcome: 'partial', error_class: e.name || 'Error', context: { message: e.message.slice(0, 200) } }));
    }
  }
  console.log('[DB] employer follow-up schema ensured');
}
