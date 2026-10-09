import { sequelize } from '../config/database';

/**
 * Idempotency ledger for Zoom meeting creation.
 *
 * THE FAILURE THIS EXISTS FOR. Zoom's API has no idempotency key. `CreateMeetingInput`
 * has carried a `requestId` since the provider abstraction was written, the Google Meet
 * adapter uses it as the conference `createRequest.id`, and the Zoom adapter silently
 * dropped it — so the only thing standing between a retry and a duplicate meeting was
 * `if (booking.meeting_link) return` in roomOutboxHandlers, which is a read-then-write
 * and therefore not a guarantee at all.
 *
 * The dangerous case is not a double click. It is **Zoom succeeding and the response
 * never arriving**: the outbox worker sees a timeout, retries, and creates a SECOND
 * real meeting with a second join link, on an account with one host. A student then has
 * two links for one booking and no way to know which one anyone else is on.
 *
 * HOW THE LEDGER CLOSES IT. The request id is written here BEFORE Zoom is called, under
 * a unique index. A retry therefore cannot insert, and finds the prior attempt instead:
 *
 *   - state 'created' -> the meeting id is right here; return it, call nothing.
 *   - state 'pending' -> the previous attempt reached Zoom and we never learned the
 *     outcome. Reconcile by listing the host's meetings and looking for the request
 *     marker the create call embeds in the agenda. Adopt it if found; only create if
 *     genuinely absent.
 *
 * Writing BEFORE the call is the whole point. A ledger written after a successful
 * response records only the attempts that already worked, which are precisely the ones
 * that never needed recording.
 */

export const ZOOM_REQUEST_LEDGER_TABLES = ['zoom_meeting_requests'] as const;

export const ZOOM_REQUEST_LEDGER_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS zoom_meeting_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_id VARCHAR(160) NOT NULL,
     state VARCHAR(20) NOT NULL DEFAULT 'pending',
     meeting_id VARCHAR(60),
     join_url TEXT,
     topic TEXT,
     host_email VARCHAR(190) NOT NULL DEFAULT '',
     attempts INTEGER NOT NULL DEFAULT 1,
     last_error TEXT,
     reconciled_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS request_id VARCHAR(160)`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'pending'`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(60)`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS join_url TEXT`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS topic TEXT`,
  // WHICH HOST THE MEETING WAS CREATED AS. Reconciling a lost response means
  // listing that host's meetings and looking for the request marker. List the
  // WRONG host and Zoom truthfully answers "no such meeting" about a meeting that
  // exists — and that answer is precisely what licenses a duplicate. Empty means
  // the default `ZOOM_HOST_EMAIL`, which is every row written before multi-host.
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS host_email VARCHAR(190) NOT NULL DEFAULT ''`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 1`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS last_error TEXT`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE zoom_meeting_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // THE CONSTRAINT THAT MAKES THIS WORK. Two workers racing the same booking both try
  // to insert; exactly one wins and calls Zoom, the loser reads the winner's row.
  // A read-then-write check cannot give that — both would read "absent".
  `CREATE UNIQUE INDEX IF NOT EXISTS zoom_meeting_requests_unique_request
     ON zoom_meeting_requests (request_id)`,
  // The reconciliation sweep reads this: attempts that reached Zoom and never resolved.
  `CREATE INDEX IF NOT EXISTS zoom_meeting_requests_pending
     ON zoom_meeting_requests (created_at) WHERE state = 'pending'`,
];

export const ZOOM_REQUEST_LEDGER_REQUIRED_COLUMNS: string[] = [
  'zoom_meeting_requests.id',
  'zoom_meeting_requests.request_id',
  'zoom_meeting_requests.state',
  'zoom_meeting_requests.meeting_id',
  'zoom_meeting_requests.join_url',
  'zoom_meeting_requests.attempts',
];

export const ZOOM_REQUEST_LEDGER_REQUIRED_INDEXES: string[] = [
  'zoom_meeting_requests_unique_request',
];

/** 'pending' means Zoom may or may not have created it — never assume either way. */
export const ZOOM_REQUEST_STATES = ['pending', 'created', 'failed'] as const;

export async function ensureZoomRequestLedgerSchema(): Promise<void> {
  for (const sql of ZOOM_REQUEST_LEDGER_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] zoom request ledger stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Zoom meeting request ledger ensured (1 table)');
}
