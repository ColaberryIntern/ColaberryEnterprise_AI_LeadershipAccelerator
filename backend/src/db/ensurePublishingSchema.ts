import { sequelize } from '../config/database';

/**
 * Marketing Operations — publishing queue skeleton.
 *
 * Three tables: publishing_jobs, external_publications, platform_delivery_events.
 * Idempotent additive raw SQL. ADDITIVE ONLY.
 *
 * ── The defect this exists to fix ─────────────────────────────────────────────────────
 *
 * "Schedule this post for Tuesday at 9am" does not exist anywhere in this codebase today.
 * `OpenclawTask.scheduled_for` is declared and indexed, but:
 *   - nothing ever writes it;
 *   - the browser worker selects on `status` + `priority` with NO time predicate, so a
 *     future-dated task is picked up and posted immediately;
 *   - no content model (OpenclawResponse, AuthorityContent, SkoolResponse, ResponseQueue)
 *     has a publish-at column at all.
 * The only working future-scheduler is `ScheduledEmail.scheduled_for`, whose channel enum is
 * email|voice|sms and therefore cannot carry a social post.
 *
 * So `publish_at` here is NOT NULL and the due-jobs predicate is a tested pure function
 * (services/publishing/publishingQueueQuery.ts). A column nothing filters on is exactly the
 * shape of the existing bug, and it would look identical from the outside.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────────────
 *
 * Two independent guards, because they fail differently:
 *   1. `idempotency_key` UNIQUE — the application-level key a caller supplies or derives.
 *   2. UNIQUE (content_item_id, content_revision, channel_account_id, scheduled_occurrence)
 *      — the SEMANTIC key. Even if a caller generates a fresh idempotency key by mistake,
 *      the same content revision cannot be queued twice for the same account and slot.
 * Guard 1 catches a retry; guard 2 catches a bug in whatever computes guard 1. A duplicate
 * social post cannot be recalled once published, so one guard is not enough.
 *
 * `content_revision` is part of the key on purpose: publishing revision 3 after revision 2
 * already went out is a legitimately different job, not a duplicate.
 *
 * ── T003 is BLOCKED, and this schema accounts for it ─────────────────────────────────
 *
 * `marketing_channel_accounts` does not exist yet — T003 is gated on the ESC-001 credential
 * encryption decision. `channel_account_id` is therefore a nullable bare UUID with NO foreign
 * key, exactly as the plan's declared blast radius for that gate specifies. When T003 lands
 * it adds the FK additively. This is also consistent with the repo's existing choice not to
 * FK-constrain high-write tracking columns.
 *
 * ── Redaction ────────────────────────────────────────────────────────────────────────
 *
 * The event payload column is named `payload_redacted`, not `payload`. Provider
 * request/response bodies carry access tokens, and a column called `payload` invites
 * somebody to write the raw one into it. The name states the contract.
 */

export const PUBLISHING_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS publishing_jobs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     content_item_id UUID NOT NULL REFERENCES content_items(id),
     content_variant_id UUID REFERENCES content_variants(id),
     channel_account_id UUID,
     provider VARCHAR(40) NOT NULL,
     publish_at TIMESTAMPTZ NOT NULL,
     scheduled_occurrence VARCHAR(64) NOT NULL,
     content_revision INTEGER NOT NULL DEFAULT 1,
     idempotency_key VARCHAR(200) NOT NULL,
     state VARCHAR(30) NOT NULL DEFAULT 'pending',
     attempts INTEGER NOT NULL DEFAULT 0,
     max_attempts INTEGER NOT NULL DEFAULT 3,
     next_retry_at TIMESTAMPTZ,
     last_error TEXT,
     last_error_class VARCHAR(80),
     claimed_by VARCHAR(120),
     claimed_at TIMESTAMPTZ,
     policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
     dead_lettered_at TIMESTAMPTZ,
     dead_letter_reason VARCHAR(200),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS publishing_jobs_idempotency_key_unique
     ON publishing_jobs (idempotency_key)`,
  // The semantic key. Partial on channel_account_id because it is nullable while T003 is
  // blocked, and a NULL account would otherwise make this index accept unlimited duplicates
  // (NULLs are distinct in a unique index — the lesson from T002).
  `CREATE UNIQUE INDEX IF NOT EXISTS publishing_jobs_semantic_unique
     ON publishing_jobs (content_item_id, content_revision, channel_account_id, scheduled_occurrence)
     WHERE channel_account_id IS NOT NULL`,
  // The due-jobs read path: state + time. Partial, because a queue is overwhelmingly made of
  // rows that are already done and must not be scanned.
  `CREATE INDEX IF NOT EXISTS idx_publishing_jobs_due
     ON publishing_jobs (publish_at)
     WHERE state IN ('pending', 'retrying')`,
  `CREATE INDEX IF NOT EXISTS idx_publishing_jobs_scope ON publishing_jobs (tenant_id, brand_id, state)`,
  `CREATE INDEX IF NOT EXISTS idx_publishing_jobs_item ON publishing_jobs (content_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_publishing_jobs_dead_letter
     ON publishing_jobs (dead_lettered_at)
     WHERE dead_lettered_at IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS external_publications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     publishing_job_id UUID REFERENCES publishing_jobs(id),
     tenant_id UUID NOT NULL,
     brand_id UUID,
     content_item_id UUID,
     provider VARCHAR(40) NOT NULL,
     external_id VARCHAR(300) NOT NULL,
     permalink TEXT,
     published_at TIMESTAMPTZ,
     current_status VARCHAR(40) NOT NULL DEFAULT 'live',
     last_checked_at TIMESTAMPTZ,
     removed_at TIMESTAMPTZ,
     removed_reason VARCHAR(200),
     metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // The reconciliation guard. If a publish times out ambiguously and we later discover the
  // post DID land, recording it twice would double-count every metric attached to it.
  `CREATE UNIQUE INDEX IF NOT EXISTS external_publications_provider_external_unique
     ON external_publications (provider, external_id)`,
  `CREATE INDEX IF NOT EXISTS idx_external_publications_job ON external_publications (publishing_job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_external_publications_scope ON external_publications (tenant_id, brand_id, current_status)`,

  `CREATE TABLE IF NOT EXISTS platform_delivery_events (
     id BIGSERIAL PRIMARY KEY,
     publishing_job_id UUID REFERENCES publishing_jobs(id),
     provider VARCHAR(40) NOT NULL,
     direction VARCHAR(12) NOT NULL,
     event_type VARCHAR(60) NOT NULL,
     http_status INTEGER,
     provider_code VARCHAR(80),
     message TEXT,
     payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
     correlation_id VARCHAR(64),
     occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_events_job ON platform_delivery_events (publishing_job_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_events_correlation ON platform_delivery_events (correlation_id)`,
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  publishing_jobs: [
    'id', 'tenant_id', 'content_item_id', 'provider', 'publish_at',
    'scheduled_occurrence', 'content_revision', 'idempotency_key', 'state',
    'attempts', 'max_attempts', 'next_retry_at', 'dead_lettered_at',
  ],
  external_publications: ['id', 'provider', 'external_id', 'permalink', 'current_status'],
  platform_delivery_events: ['id', 'publishing_job_id', 'direction', 'payload_redacted', 'occurred_at'],
};

/**
 * Indexes whose absence is silent and therefore dangerous.
 *
 * Both uniqueness guards are here. Losing either one means a duplicate social post, and a
 * published post cannot be recalled — the audience has already seen it. That is a materially
 * worse failure than a missing column, which merely throws.
 */
const REQUIRED_INDEXES: string[] = [
  'publishing_jobs_idempotency_key_unique',
  'publishing_jobs_semantic_unique',
  'external_publications_provider_external_unique',
];

export interface PublishingSchemaResult {
  ok: boolean;
  missing: Array<{ table: string; columns: string[] }>;
  missingIndexes: string[];
}

export async function ensurePublishingSchema(): Promise<PublishingSchemaResult> {
  for (const sql of PUBLISHING_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] publishing schema stmt skipped:', err?.message?.split('\n')[0]);
    }
  }

  const missing: Array<{ table: string; columns: string[] }> = [];
  let missingIndexes: string[] = [];
  try {
    for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
      const [rows]: any = await sequelize.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = :table`,
        { replacements: { table } },
      );
      const present = new Set((rows || []).map((r: any) => r.column_name));
      const absent = required.filter((c) => !present.has(c));
      if (absent.length > 0) {
        missing.push({ table, columns: absent });
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
          outcome: 'failure', error_class: 'SchemaInvariantViolation',
          context: { table, missing_columns: absent },
        }));
      }
    }

    const [idxRows]: any = await sequelize.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('publishing_jobs','external_publications','platform_delivery_events')`,
    );
    const presentIdx = new Set((idxRows || []).map((r: any) => r.indexname));
    missingIndexes = REQUIRED_INDEXES.filter((i) => !presentIdx.has(i));
    if (missingIndexes.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: {
          missing_indexes: missingIndexes,
          impact: 'publish idempotency is NOT enforced; the same content can be queued and published twice to the same account, and a published post cannot be recalled',
        },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] publishing schema verification failed:', err?.message);
  }

  console.log('[DB] Publishing schema ensured');
  return { ok: missing.length === 0 && missingIndexes.length === 0, missing, missingIndexes };
}
