import { sequelize } from '../config/database';

/**
 * project_discovery_call_requests - every time a student asked to be called
 * about their project, what they agreed to, and what happened. Additive only:
 * one new table and two indexes, nothing existing altered.
 *
 * WHY THIS IS NOT A ROW IN consent_records.
 *
 * `consent_records` is the ledger the marketing voice gate reads: a `granted`
 * row for a phone on channel `voice` is read by `evaluateConsent` as permission
 * to call that number about anything. A student agreeing to one AI call about
 * their own project has agreed to exactly that, and the brief is explicit that
 * this consent is separate from marketing consent. Writing it into the shared
 * ledger would turn a project question into a sales permission the moment the
 * next campaign ran. So it lives here, scoped to the project, and no consumer
 * of the marketing ledger can see it.
 *
 * EVERY REQUEST IS A ROW, refused ones included.
 *
 * A request refused for `no_agent_configured` is still a student who consented
 * and a number they gave. Recording it is what makes "how many students wanted
 * a call before we switched it on" a query rather than a guess, and it is the
 * cooldown source: the newest row for a project is the last time a call was
 * attempted, whatever came of it.
 *
 * The phone number is stored normalised and is never logged.
 */
export async function ensureProjectDiscoveryCallSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS project_discovery_call_requests (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL REFERENCES projects(id),
       enrollment_id UUID REFERENCES enrollments(id),
       phone_e164 VARCHAR(32) NOT NULL,
       consent_version VARCHAR(20) NOT NULL,
       consent_text TEXT NOT NULL,
       consented_at TIMESTAMPTZ NOT NULL,
       ip VARCHAR(64),
       user_agent VARCHAR(512),
       decision VARCHAR(40) NOT NULL,
       angles JSONB NOT NULL DEFAULT '[]'::jsonb,
       prompt_sha256 VARCHAR(64),
       call_id VARCHAR(128),
       placed_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_project_discovery_call_requests_project
       ON project_discovery_call_requests (project_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_project_discovery_call_requests_placed
       ON project_discovery_call_requests (placed_at) WHERE placed_at IS NOT NULL`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] project_discovery_call_requests schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Project discovery call schema ensured');
}
