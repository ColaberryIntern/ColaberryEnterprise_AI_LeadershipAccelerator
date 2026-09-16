import { sequelize } from '../config/database';

// AI Employee Consolidation Program, Phase 4 (2026-09-15/16) — the three
// additive fields the program's migration matrix proposed (Program Phase 0,
// `docs/architecture/ai-workforce-management/MIGRATION_MATRIX.md`), confirmed
// against a live `\d ai_agents` query to not yet exist. Same shape as
// ensureAiAgentAutonomySourceSchema.ts: one file, one exported statement
// array, `ADD COLUMN IF NOT EXISTS` only, every statement in its own
// try/catch so a partial DB self-heals on the next boot.
//
// ── WHY THIS MODULE ALSO HAS A REAL POST-CONDITION CHECK ───────────────────
// The DDL loop below swallows every failure into a console.warn — deliberate,
// so one bad statement never aborts boot — which means `ensureAiAgentConsolidationSchema()`
// resolving cleanly proves nothing about whether the columns actually landed.
// `ai_agents` is an EXISTING table (unlike ensureCaseStudySchema.ts's CREATE
// TABLE case), so there is no "table missing" failure mode here — only "column
// missing", which is exactly the shape `ensureEmailSendLedgerSchema.ts`'s own
// `assertEmailSendLedgerSchema()` already proves matters (ALTER TABLE ADD
// COLUMN IF NOT EXISTS is a genuine no-op if the column already exists under a
// different type, or if the statement itself failed silently). Mirrors that
// module's real `information_schema.columns`/`pg_indexes` catalog-probe
// pattern, scoped down: one table, no UNIQUE invariant to verify (this index
// is a plain lookup index, not a duplicate-prevention guard), so no
// `pg_index.indisunique` check is needed the way the UNIQUE-index case requires.
//
// `record_kind` — 'employee' | 'behavior' | 'tool' | null. Matches the
// mission's Section 7 taxonomy (`CLAUDE_CODE_AI_EMPLOYEE_CONSOLIDATION_LOOP_PROMPT.md`).
// `duplicate`/`retire`/`unresolved` are classification-time-only states from
// `LEGACY_AGENT_CLASSIFICATION.csv`, not meant to persist on the live row —
// a resolved `retire` decision maps to `migration_status:'archived'` below,
// not a `record_kind` value.
//
// `parent_agent_id` — nullable UUID, no FK constraint. Mirrors `reports_to_id`'s
// own established convention on this exact table
// (ensureAiAgentHierarchySchema.ts:17-19, confirmed no FK there either) —
// this table's actor-reference columns are deliberately left unconstrained.
// Indexed: an employee's Agent Detail page queries "all rows where
// parent_agent_id = my id" to render owned behaviors, a stronger version of
// the `related_tasks` same-module inference agentDetailService.ts already
// does (agentDetailService.ts:392-394).
//
// `migration_status` — 'legacy' | 'absorbed' | 'archived' | null. `NULL` for
// any row Phase 0's classification never reached a firm decision on — never
// backfilled to a guess here, same posture as autonomy_level_source's own
// migration.
export const AI_AGENT_CONSOLIDATION_STATEMENTS: string[] = [
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS record_kind VARCHAR(20)`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS parent_agent_id UUID`,
  `ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS migration_status VARCHAR(20)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_agents_parent_agent_id ON ai_agents (parent_agent_id)`,
];

/** What the DDL above must have produced. Checked, not assumed — see the
 * module header for why a swallowed-failure DDL loop needs this. */
export const REQUIRED_COLUMNS = [
  'ai_agents.record_kind',
  'ai_agents.parent_agent_id',
  'ai_agents.migration_status',
] as const;

export const REQUIRED_INDEXES = ['idx_ai_agents_parent_agent_id'] as const;

export async function ensureAiAgentConsolidationSchema(): Promise<void> {
  for (const sql of AI_AGENT_CONSOLIDATION_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] ai-agent consolidation schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] AiAgent record_kind/parent_agent_id/migration_status (consolidation) schema ensured');
}

/**
 * Verify the post-condition against the real Postgres catalog and report
 * loudly if it is not met. Exported so a test can prove the assertion fires
 * against an un-migrated database — an assertion nobody has watched fail is
 * not an assertion. Mirrors ensureEmailSendLedgerSchema.ts's real
 * assertEmailSendLedgerSchema() shape, scoped down (no table check needed —
 * `ai_agents` already exists; no uniqueness check needed — this index carries
 * no duplicate-prevention invariant, unlike that module's two UNIQUE indexes).
 */
export async function assertAiAgentConsolidationSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [idxRows]: any = await sequelize.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ANY($indexes)`,
      { bind: { indexes: [...REQUIRED_INDEXES] } },
    );
    const foundIndexes = new Set((idxRows ?? []).map((r: any) => r.indexname));
    for (const i of REQUIRED_INDEXES) if (!foundIndexes.has(i)) missing.push(`index:${i}`);

    const [colRows]: any = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...new Set(REQUIRED_COLUMNS.map((c) => c.split('.')[0]))] } },
    );
    const foundColumns = new Set((colRows ?? []).map((r: any) => `${r.table_name}.${r.column_name}`));
    for (const c of REQUIRED_COLUMNS) if (!foundColumns.has(c)) missing.push(`column:${c}`);
  } catch (err: any) {
    console.warn('[DB] ai-agent consolidation schema post-check could not run:', err?.message);
    return { ok: false, missing: ['post-check-failed'] };
  }

  if (missing.length > 0) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'ai_agent_consolidation_schema_incomplete',
      outcome: 'failure',
      error_class: 'SchemaInvariantViolation',
      context: {
        missing,
        impact:
          'the AI Employee Consolidation Program cannot record which legacy behaviors an ' +
          'employee owns, or which record_kind/migration_status a row has — repointCurriculumLegacyBehaviors() ' +
          'and every future employee\'s equivalent will silently write to a column that does not exist, ' +
          'and Sequelize will drop the value with no error (this is the exact failure mode the ' +
          '2026-08-22 tenancy defect showed: a column not in the real catalog is a column every write to it loses).',
        remedy:
          'inspect the [DB] ai-agent consolidation schema stmt skipped warnings above; the ALTER ' +
          'statements are idempotent and safe to re-run. Do NOT run repointCurriculumLegacyBehaviors() ' +
          'or seed Dara\'s identity until this reports ok.',
      },
    }));
    return { ok: false, missing };
  }

  console.log('[DB] AiAgent consolidation schema post-check: ok');
  return { ok: true, missing: [] };
}
