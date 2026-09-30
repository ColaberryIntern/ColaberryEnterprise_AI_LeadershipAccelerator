import { PUBLISHING_SCHEMA_STATEMENTS } from '../ensurePublishingSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import { PUBLISHING_JOB_STATES, RUNNABLE_STATES } from '../../services/publishing/publishingQueueQuery';
import '../../models';

/**
 * Schema/model parity for the publishing queue.
 *
 * The stakes are higher here than in the other schema suites. A dropped write on
 * `link_clicks` loses a click. A dropped write on `publishing_jobs.idempotency_key` or
 * `publish_at` publishes a post twice, or publishes it at the wrong time, to a real audience
 * — and a published post cannot be recalled.
 */

describe('ensurePublishingSchema — DDL and models agree', () => {
  const created = parseCreatedTables(PUBLISHING_SCHEMA_STATEMENTS);

  it('creates exactly the expected tables', () => {
    expect(created.map((c) => c.table).sort()).toEqual([
      'external_publications',
      'platform_delivery_events',
      'publishing_jobs',
    ]);
  });

  it('pins the exact column count per table', () => {
    const counts = Object.fromEntries(created.map((c) => [c.table, c.columns.length]));
    expect(counts).toEqual({
      publishing_jobs: 24,
      external_publications: 16,
      platform_delivery_events: 11,
    });
  });

  it('every created table has a registered Sequelize model', () => {
    const byTable = modelsByTable();
    expect(created.map((c) => c.table).filter((t) => !byTable[t])).toEqual([]);
  });

  it('every created column is declared as a model attribute', () => {
    const byTable = modelsByTable();
    const missing: string[] = [];
    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue;
      const mapped = modelColumnNames(model);
      for (const column of columns) if (!mapped.has(column)) missing.push(`${table}.${column}`);
    }
    expect(missing).toEqual([]);
  });

  it('declares no model attribute that the DDL will not create', () => {
    const byTable = modelsByTable();
    const extra: string[] = [];
    for (const { table, columns } of created) {
      const model = byTable[table];
      if (!model) continue;
      const ddl = new Set(columns);
      for (const field of modelColumnNames(model)) if (!ddl.has(field)) extra.push(`${table}.${field}`);
    }
    expect(extra).toEqual([]);
  });

  it('is additive only and idempotent', () => {
    const joined = PUBLISHING_SCHEMA_STATEMENTS.join('\n').toUpperCase();
    expect(joined).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/);
    expect(joined).not.toMatch(/RENAME|ALTER\s+TABLE|TRUNCATE|DELETE\s+FROM/);
    for (const sql of PUBLISHING_SCHEMA_STATEMENTS) expect(sql).toMatch(/IF\s+NOT\s+EXISTS/i);
  });
});

describe('scheduling is real, not decorative', () => {
  it('publish_at exists and is NOT NULL in the DDL', () => {
    // The defect being replaced is a nullable, never-written, never-filtered scheduling
    // column. NOT NULL means a job cannot be queued without an intended time at all.
    const jobs = PUBLISHING_SCHEMA_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS publishing_jobs'));
    expect(jobs).toMatch(/publish_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
  });

  it('the due-jobs index covers publish_at and is scoped to runnable states', () => {
    // An index on state alone would let the scheduler scan the whole finished queue, and an
    // index that omits publish_at signals that nothing intends to filter on time.
    const idx = PUBLISHING_SCHEMA_STATEMENTS.find((s) => s.includes('idx_publishing_jobs_due'));
    expect(idx).toBeDefined();
    expect(idx).toMatch(/\(\s*publish_at\s*\)/);
    expect(idx).toMatch(/WHERE\s+state\s+IN/i);
    for (const state of RUNNABLE_STATES) expect(idx).toContain(`'${state}'`);
  });

  it('the model declares publish_at as a mapped column', () => {
    expect(modelColumnNames(modelsByTable()['publishing_jobs']).has('publish_at')).toBe(true);
  });
});

describe('idempotency has two independent guards', () => {
  it('the application-level idempotency_key is unique', () => {
    const idx = PUBLISHING_SCHEMA_STATEMENTS.find((s) => s.includes('publishing_jobs_idempotency_key_unique'));
    expect(idx).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
  });

  it('the SEMANTIC key is separately unique on (item, revision, account, occurrence)', () => {
    // Guard 1 catches a retry. Guard 2 catches a bug in whatever computes guard 1. One guard
    // is not enough when the failure mode is an unrecallable duplicate post.
    const idx = PUBLISHING_SCHEMA_STATEMENTS.find((s) => s.includes('publishing_jobs_semantic_unique'));
    expect(idx).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(idx).toMatch(/content_item_id/);
    expect(idx).toMatch(/content_revision/);
    expect(idx).toMatch(/channel_account_id/);
    expect(idx).toMatch(/scheduled_occurrence/);
  });

  it('the semantic index is PARTIAL on channel_account_id', () => {
    // channel_account_id is nullable while T003 is gated on ESC-001, and NULLs are DISTINCT
    // in a unique index — so without the partial predicate this index would silently accept
    // unlimited duplicates for the account-less case. Learned in T002.
    const idx = PUBLISHING_SCHEMA_STATEMENTS.find((s) => s.includes('publishing_jobs_semantic_unique'));
    expect(idx).toMatch(/WHERE\s+channel_account_id\s+IS\s+NOT\s+NULL/i);
  });

  it('content_revision is part of the semantic key, so a later revision is not a duplicate', () => {
    const mapped = modelColumnNames(modelsByTable()['publishing_jobs']);
    expect(mapped.has('content_revision')).toBe(true);
  });

  it('external publications are unique per (provider, external_id)', () => {
    // The reconciliation guard: if an ambiguous timeout is later found to have landed,
    // recording it twice would double-count every metric attached to it.
    const idx = PUBLISHING_SCHEMA_STATEMENTS.find((s) => s.includes('external_publications_provider_external_unique'));
    expect(idx).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(idx).toMatch(/\(\s*provider\s*,\s*external_id\s*\)/);
  });
});

describe('safety properties', () => {
  it('the delivery-event payload column is named for its redaction contract', () => {
    // Named payload_redacted, not payload. Provider bodies carry access tokens, and a column
    // called `payload` invites somebody to write the raw one. This repo already has a column
    // whose name asserts something untrue about its contents —
    // github_connections.access_token_encrypted holds plaintext — which is the failure being
    // avoided.
    const mapped = modelColumnNames(modelsByTable()['platform_delivery_events']);
    expect(mapped.has('payload_redacted')).toBe(true);
    expect(mapped.has('payload')).toBe(false);
  });

  it('a job can be dead-lettered without losing why', () => {
    const mapped = modelColumnNames(modelsByTable()['publishing_jobs']);
    expect(mapped.has('dead_lettered_at')).toBe(true);
    expect(mapped.has('dead_letter_reason')).toBe(true);
    expect(mapped.has('last_error_class')).toBe(true);
  });

  it('a publication can be marked removed by the provider', () => {
    // A published post does not stay published. Without this the system keeps reporting
    // engagement on a post that no longer exists.
    const mapped = modelColumnNames(modelsByTable()['external_publications']);
    expect(mapped.has('removed_at')).toBe(true);
    expect(mapped.has('current_status')).toBe(true);
  });

  it('the job state column can express every state the queue module knows', () => {
    // Guards drift between the model and the predicate module that decides what runs.
    expect(PUBLISHING_JOB_STATES.length).toBeGreaterThan(0);
    for (const s of RUNNABLE_STATES) expect(PUBLISHING_JOB_STATES).toContain(s);
  });

  it('channel_account_id carries NO foreign key while T003 is gated', () => {
    // The plan's declared blast radius for the ESC-001 gate. If this ever gains a REFERENCES
    // clause before marketing_channel_accounts exists, boot breaks on a fresh database.
    const jobs = PUBLISHING_SCHEMA_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS publishing_jobs'));
    expect(jobs).toMatch(/channel_account_id\s+UUID\s*,/);
    expect(jobs).not.toMatch(/channel_account_id\s+UUID\s+REFERENCES/i);
  });
});
