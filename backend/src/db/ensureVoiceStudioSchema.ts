import { sequelize } from '../config/database';
import { voiceStudioStatements, VOICE_TABLE_SPECS } from './voiceStudioTableSpecs';

/**
 * Voice AI Studio schema (VS1.4): 13 new voice_* tables, idempotent raw DDL, same pattern as
 * ensureMultiTenantSchema.ts. The statements are generated from voiceStudioTableSpecs.ts, which also
 * defines the Sequelize models, so DDL columns and model columns cannot drift.
 *
 * ADDITIVE ONLY: CREATE TABLE / CREATE INDEX IF NOT EXISTS. Nothing here alters, drops or backfills
 * an existing table. While VOICE_STUDIO_ENABLED is off (the default) nothing reads or writes these
 * tables, so they are inert. Rollback is "leave them unused"; a reviewed drop script lives at
 * backend/src/db/rollback/dropVoiceStudioSchema.sql and is never run without approval.
 *
 * Failure: each statement is attempted independently and a failure is logged as structured JSON with
 * an error_class, never thrown, so one bad statement cannot stop the server (the repo-wide boot rule).
 * Re-running boot retries whatever failed.
 */
export const VOICE_STUDIO_TABLES: readonly string[] = VOICE_TABLE_SPECS.map((t) => t.table);

function logStatementFailure(sql: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event: 'ensure_voice_studio_schema_statement_failed',
    outcome: 'failure',
    error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
    context: { sql: sql.slice(0, 160), message: err instanceof Error ? err.message : String(err) },
  }));
}

export async function ensureVoiceStudioSchema(): Promise<{ attempted: number; failed: number }> {
  let failed = 0;
  const statements = voiceStudioStatements();
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      failed += 1;
      logStatementFailure(sql, err);
    }
  }
  return { attempted: statements.length, failed };
}
