import { sequelize } from '../config/database';

/**
 * The register of Zoom hosts this platform may create meetings as.
 *
 * WHY A TABLE AND NOT MORE ENV VARS. Capacity is currently a constant in code —
 * one `ZOOM_HOST_EMAIL`, therefore one concurrent meeting, therefore every class,
 * community room, internship room and student rehearsal queues behind the same
 * host. Numbered env vars would move that constant somewhere else and still need a
 * deploy to change. A row makes adding a host an insert.
 *
 * WHY `credential_ref` EXISTS. We do not yet know whether the business's other Zoom
 * logins are additional USERS inside one account or separate ACCOUNTS, and the
 * answer changes how a host authenticates:
 *
 *   - same account  -> `credential_ref` is NULL and the existing Server-to-Server
 *                      app acts for that user; the Zoom API already takes the user
 *                      in the path (`POST /users/{userId}/meetings`).
 *   - other account -> `credential_ref` NAMES a credential entry held elsewhere.
 *
 * Either way this table holds an identifier, never a secret. Nothing in this schema
 * is a place to put a client secret, and nothing reads one from here.
 *
 * WHY `verified_at` GATES ALLOCATION. A host nobody has proved reachable is a host
 * that fails at the moment a student presses the button. Rows start unverified and
 * must be proved by a real API call before the allocator may use one. Assuming a
 * host works is how you hand a learner a booking that cannot be created.
 *
 * NOTHING HERE TOUCHES AN EXISTING MEETING. Host selection applies only when a new
 * meeting is created. Every creation path already returns early when a link exists
 * (`roomOutboxHandlers.ensureBookingMeeting`, `roomService.joinVideoRoom`,
 * `meetingService.ensureSessionMeetLink`, `internshipMeetingRooms.ensureRoomLink`),
 * so scheduled classes and events keep the links they already have.
 */

export const ZOOM_HOST_TABLES = ['zoom_hosts'] as const;

export const ZOOM_HOST_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS zoom_hosts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     host_email VARCHAR(190) NOT NULL,
     label VARCHAR(120),
     purpose VARCHAR(30) NOT NULL DEFAULT 'any',
     enabled BOOLEAN NOT NULL DEFAULT TRUE,
     priority INTEGER NOT NULL DEFAULT 100,
     credential_ref VARCHAR(120),
     verified_at TIMESTAMPTZ,
     last_error TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so every column is
  // also added explicitly — the trap this directory exists to avoid.
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS host_email VARCHAR(190)`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS label VARCHAR(120)`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) DEFAULT 'any'`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS credential_ref VARCHAR(120)`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS last_error TEXT`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE zoom_hosts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

  // One row per host. The allocator reads this table on every reservation, so a
  // duplicated email would silently double a host's apparent capacity — which is
  // precisely the overbooking this whole exercise exists to prevent.
  `CREATE UNIQUE INDEX IF NOT EXISTS zoom_hosts_unique_email
     ON zoom_hosts (LOWER(host_email))`,
  `CREATE INDEX IF NOT EXISTS zoom_hosts_allocatable
     ON zoom_hosts (priority) WHERE enabled AND verified_at IS NOT NULL`,
];

export const ZOOM_HOST_REQUIRED_COLUMNS: string[] = [
  'zoom_hosts.host_email',
  'zoom_hosts.enabled',
  'zoom_hosts.priority',
  'zoom_hosts.credential_ref',
  'zoom_hosts.verified_at',
];

/** What a host may be used for. `any` is the default and the usual case. */
export const ZOOM_HOST_PURPOSES = ['any', 'classes', 'practice', 'rooms'] as const;

export async function ensureZoomHostSchema(): Promise<void> {
  for (const sql of ZOOM_HOST_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'ensure_zoom_host_schema_failed',
        outcome: 'failure',
        error_class: err?.constructor?.name ?? 'Error',
        context: { statement: String(sql).slice(0, 120) },
      }));
      throw err;
    }
  }
}
