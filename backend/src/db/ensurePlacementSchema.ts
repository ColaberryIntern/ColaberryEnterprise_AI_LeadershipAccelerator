import { sequelize } from '../config/database';

/**
 * Career Prep v27, Releases 2 and 3 (the getting-hired pipeline): the placement tables. One module so the Career Prep
 * schema file stays small; later tasks append their tables here in order (CP6 inbox, CP8 interviews, CP9 room, CP10
 * offers and employers, CP11 desk).
 *
 * ADDITIVE ONLY. Every statement is CREATE ... IF NOT EXISTS, so this runs on every boot and a re-run is a no-op.
 * Nothing existing is altered. Run by hand to roll back: PLACEMENT_SCHEMA_ROLLBACK (never at boot).
 *
 *   job_search_inboxes   (CP6.1, kit F2) one row per learner: the Gmail address they made for their job search
 *                        (UNIQUE per learner) and its canonical Gmail mailbox (dots and +tag removed, UNIQUE across
 *                        learners, so two learners can never claim one inbox), when forwarding was
 *                        verified, the last mail and the last daily test (sent at, token, how long it took to arrive).
 *                        broken_since / broken_alerted_at / broken_alert_attempts (CP6.1c): the current "forwarding
 *                        broken" spell (the missed test that began it), and its one email alert (at most 3 tries).
 *                        Health (Healthy / Quiet / Forwarding broken / Not tested) is computed, never stored
 *                        (services/placement/inboxHealth.ts), so it can never go stale.
 *   inbox_received       (CP6.1) "Everything it received": one row per message, UNIQUE on the RFC 5322 Message-ID,
 *                        so a replayed event or a re-run test adds nothing.
 *   inbox_events         (CP6.2, kit F3) every signed event the inbox manager pushed, UNIQUE on (message_id, type), so
 *                        a replay is stored once. processed_at is set after it was dispatched; a stored event that was
 *                        never processed (a dispatch failed) is dispatched again when the sender retries. A stored
 *                        row whose payload can never be dispatched gets failed_at + error_class (terminal, for a person).
 *   inbox_backfill_state (CP6.2) ONE row: the next backfill pass's `since`, on the upstream's clock, moved only by a COMPLETED pass.
 *                        Kept apart from inbox_events because pushes write there too (a resumed push must never move
 *                        the backfill past events missed during an outage).
 *   placement_interviews (CP8.1, kit F4) one row per interview the inbox found for a learner; source_event_id UNIQUE
 *                        ("interview.detected:<Message-ID>"), so a replayed or concurrent event makes ONE interview.
 *                        state CHECK new/awaiting/review/booked/done/cancelled; moves only by interviewStates.ts.
 *                        booking_link_round / _sent_at / _attempts / _last_attempt_at (CP8.1b): the booking-link reply
 *                        owed for this interview, written in the SAME transaction that puts it in `new`, so a crash
 *                        before the send still leaves the sweep (bookingLinkSweep.ts) something to finish.
 *   placement_events     (CP8.1, the v22 event shape) one row per state change, written in the same transaction as the
 *                        change; source_event_id UNIQUE when set, so one inbox event changes an interview at most once.
 *   placement_review_items (CP8.1, F9 queue) what a human must look at: a low-confidence (< 0.70) interview email that
 *                        made no interview, an email for no known learner, an update matching no interview, or an
 *                        update matching more than one (ambiguous: nothing is changed until a person picks). UNIQUE
 *                        (kind, source_event_id).
 */
export const PLACEMENT_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS job_search_inboxes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
     address VARCHAR(254) NOT NULL,
     mailbox VARCHAR(254) NOT NULL,
     verified_at TIMESTAMPTZ,
     last_received_at TIMESTAMPTZ,
     forwarding_confirmed_at TIMESTAMPTZ,
     forwarding_code VARCHAR(32),
     forwarding_link TEXT,
     last_test_at TIMESTAMPTZ,
     last_test_token VARCHAR(64),
     last_test_ms INTEGER CHECK (last_test_ms IS NULL OR last_test_ms >= 0),
     broken_since TIMESTAMPTZ,
     broken_alerted_at TIMESTAMPTZ,
     broken_alert_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (broken_alert_attempts >= 0),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_job_search_inboxes_mailbox ON job_search_inboxes (mailbox)',
  `CREATE TABLE IF NOT EXISTS inbox_received (
     id BIGSERIAL PRIMARY KEY,
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     message_id VARCHAR(255) NOT NULL UNIQUE,
     received_at TIMESTAMPTZ NOT NULL,
     from_name VARCHAR(160),
     subject VARCHAR(300),
     category VARCHAR(40),
     confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
     outcome VARCHAR(160),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_inbox_received_enrollment ON inbox_received (enrollment_id, received_at DESC)',
  `CREATE TABLE IF NOT EXISTS inbox_events (
     id BIGSERIAL PRIMARY KEY,
     event_id VARCHAR(128) NOT NULL,
     message_id VARCHAR(255) NOT NULL,
     type VARCHAR(40) NOT NULL CHECK (type IN ('email.classified', 'interview.detected', 'interview.updated', 'forwarding.confirmation')),
     payload JSONB NOT NULL,
     received_at TIMESTAMPTZ NOT NULL,
     processed_at TIMESTAMPTZ,
     failed_at TIMESTAMPTZ,
     error_class VARCHAR(60),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT uq_inbox_events_message_type UNIQUE (message_id, type)
   )`,
  `CREATE TABLE IF NOT EXISTS inbox_backfill_state (
     id SMALLINT PRIMARY KEY CHECK (id = 1),
     next_since TIMESTAMPTZ NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS placement_interviews (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     source_event_id VARCHAR(300) NOT NULL UNIQUE,
     company VARCHAR(200),
     position VARCHAR(200),
     type VARCHAR(20) CHECK (type IS NULL OR type IN ('recruiter','hiring_manager','technical','behavioral')),
     sub_type VARCHAR(60),
     contact_name VARCHAR(160),
     contact_email VARCHAR(254),
     confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
     state VARCHAR(20) NOT NULL CHECK (state IN ('new','awaiting','review','booked','done','cancelled')),
     booking_token_hash VARCHAR(128),
     booking_link_round VARCHAR(300),
     booking_link_sent_at TIMESTAMPTZ,
     booking_link_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (booking_link_attempts >= 0),
     booking_link_last_attempt_at TIMESTAMPTZ,
     token_expires_at TIMESTAMPTZ,
     token_used_at TIMESTAMPTZ,
     starts_at TIMESTAMPTZ,
     minutes SMALLINT CHECK (minutes IS NULL OR (minutes > 0 AND minutes <= 480)),
     room_provider_id VARCHAR(128),
     room_url TEXT,
     recording_consent VARCHAR(20),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS idx_placement_interviews_enrollment ON placement_interviews (enrollment_id, created_at DESC)',
  // The booking-link sweep's scan (bookingLinkSweep.ts): only interviews still owed a reply.
  "CREATE INDEX IF NOT EXISTS idx_placement_interviews_owed_link ON placement_interviews (created_at) WHERE state = 'new' AND booking_link_sent_at IS NULL",
  `CREATE TABLE IF NOT EXISTS placement_events (
     id BIGSERIAL PRIMARY KEY,
     subject_type VARCHAR(40) NOT NULL,
     subject_id VARCHAR(64) NOT NULL,
     event VARCHAR(60) NOT NULL,
     from_state VARCHAR(20),
     to_state VARCHAR(20),
     actor VARCHAR(80) NOT NULL,
     payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     source_event_id VARCHAR(300),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_events_source ON placement_events (source_event_id) WHERE source_event_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS idx_placement_events_subject ON placement_events (subject_type, subject_id, created_at)',
  `CREATE TABLE IF NOT EXISTS placement_review_items (
     id BIGSERIAL PRIMARY KEY,
     kind VARCHAR(40) NOT NULL CHECK (kind IN ('low_confidence','unmatched_learner','unmatched_update','ambiguous_update')),
     source_event_id VARCHAR(300) NOT NULL,
     enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
     interview_id UUID REFERENCES placement_interviews(id) ON DELETE CASCADE,
     summary JSONB NOT NULL DEFAULT '{}'::jsonb,
     status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
     resolved_by VARCHAR(80),
     resolved_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT uq_placement_review_items_source UNIQUE (kind, source_event_id)
   )`,
];

/** Run by hand to roll the placement tables back. Never run at boot. Dependents first. */
export const PLACEMENT_SCHEMA_ROLLBACK: readonly string[] = [
  'DROP TABLE IF EXISTS placement_review_items',
  'DROP TABLE IF EXISTS placement_events',
  'DROP TABLE IF EXISTS placement_interviews',
  'DROP TABLE IF EXISTS inbox_backfill_state',
  'DROP TABLE IF EXISTS inbox_events',
  'DROP TABLE IF EXISTS inbox_received',
  'DROP TABLE IF EXISTS job_search_inboxes',
];

/** Boot: create what is missing. A statement that fails is logged and skipped; boot continues. */
export async function ensurePlacementSchema(): Promise<void> {
  for (const sql of PLACEMENT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'placement_schema_stmt_skipped', outcome: 'partial', error_class: e.name || 'Error',
        context: { message: e.message.slice(0, 200) },
      }));
    }
  }
  console.log('[DB] placement schema ensured');
}
