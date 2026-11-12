/**
 * The CONVERSATION on a tool request. APPEND-ONLY, one row per message.
 *
 * Agent Tools Phase 2, 2026-11-11. Ali: *"They can request and manage communication between me
 * on the request and keeping track until it is built out and handed over and we should track
 * everything associated so all parties can see what's going on."*
 *
 * ## Why this is not the decision log
 *
 * `agent_domain_tool_request_decisions` already exists and is excellent at what it does: it
 * records the four VERBS and the words each verb requires. But a verb is not a conversation. A
 * builder asking "does this need to cover the sandbox too?" and Ali answering "no, production
 * read only" is neither an approval nor a denial, and today it has nowhere to live, so it
 * happens in chat and is lost to everyone who was not in that chat.
 *
 * This table is where that lives, next to the request it is about, visible to everyone who can
 * see the request. It carries NO verb, NO status and NO decision, so it can never disagree with
 * the decision log about what was decided, nor with `agent_domain_change_requests.status` about
 * whether a request is open.
 *
 * ## Why append-only
 *
 * Same reason as the decision log: an edited message is a changed record of what somebody said.
 * A correction is a new message. There is no UPDATE path and no `edited_at` column, because a
 * column nothing writes is a promise the code does not keep.
 *
 * ## What it deliberately cannot hold
 *
 * No `verb`, no `status`, no `tool_name`, no `capability_id`, no `autonomy_level`. Those belong
 * to the request and the decision, and a message that could carry them would be a second way to
 * decide things — exactly the "second approval spine" the AF11 design doc warns against.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { normalizeNameRows } from './ensureAgentDomainProjectSchema';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['agent_domain_tool_request_messages'];

const T = 'agent_domain_tool_request_messages';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  `${T}.id`,
  `${T}.change_request_id`,
  // WHO said it and WHEN. The two facts that make a conversation worth keeping.
  `${T}.author_identity`,
  `${T}.posted_at`,
  // WHAT they said.
  `${T}.body`,
  `${T}.created_at`,
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_adtrm_change_request_id'];

export const REQUIRED_CHECKS: ReadonlyArray<string> = [
  'chk_adtrm_body_is_not_blank',
  'chk_adtrm_author_is_not_blank',
];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_tool_request_messages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     change_request_id UUID NOT NULL
       REFERENCES agent_domain_change_requests (id) ON DELETE CASCADE,
     author_identity TEXT NOT NULL,
     posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     body TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     -- The application refuses these by name so the person gets a sentence; the constraints mean
     -- a row that breaks them cannot exist even if a future caller skips the contract. Same move,
     -- same reason, as chk_adtrd_verb_carries_its_words on the decision log.
     CONSTRAINT chk_adtrm_body_is_not_blank CHECK (length(btrim(body)) > 0),
     CONSTRAINT chk_adtrm_author_is_not_blank CHECK (length(btrim(author_identity)) > 0)
   )`,
  // "Show me the conversation on this request, in order" is the only question this table answers.
  `CREATE INDEX IF NOT EXISTS idx_adtrm_change_request_id
     ON agent_domain_tool_request_messages (change_request_id, posted_at)`,
];

/** Net-new, so it reverts whole. The parent is deliberately not mentioned here. */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_tool_request_messages',
];

export async function ensureToolRequestMessageSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'tool_request_message_schema_statement_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }
}

/** NAMED bind plus `normalizeNameRows`, the shape proven against this driver. */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  });
  return normalizeNameRows(rows);
}

export async function assertToolRequestMessageSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) if (!tables.includes(t)) problems.push(`missing table ${t}`);

  // Every query below binds REQUIRED_TABLES and filters by table, matching
  // ensureToolRequestDecisionSchema.ts byte for byte in shape. Deliberate: that is the form
  // proven against this driver, and `normalizeNameRows` exists because the shapes it returns are
  // not uniform. A hand-rolled variant here (binding the column list, or reading pg_constraint
  // instead of information_schema) might work and might silently return nothing, which this
  // assert would read as a clean schema.
  if (problems.length === 0) {
    const cols = await readNames(
      `SELECT table_name || '.' || column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_COLUMNS) if (!cols.includes(c)) problems.push(`missing column ${c}`);

    const idx = await readNames(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($names)`,
      REQUIRED_TABLES,
    );
    for (const i of REQUIRED_INDEXES) if (!idx.includes(i)) problems.push(`missing index ${i}`);

    const checks = await readNames(
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = ANY($names)
          AND constraint_type = 'CHECK'`,
      REQUIRED_TABLES,
    );
    for (const c of REQUIRED_CHECKS) {
      if (!checks.includes(c)) problems.push(`missing constraint ${c}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

export interface GuardedToolRequestMessageSchemaResult {
  ok: boolean;
  error_class?: string;
}

/** Boot entry point. CANNOT REJECT, the same contract its siblings have. */
export async function ensureToolRequestMessageSchemaGuarded(
): Promise<GuardedToolRequestMessageSchemaResult> {
  try {
    await ensureToolRequestMessageSchema();
    await assertToolRequestMessageSchema();
    return { ok: true };
  } catch (err: unknown) {
    const error_class = err instanceof Error ? err.constructor.name : 'UnknownError';
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'tool_request_message_schema_unavailable',
      outcome: 'failure',
      error_class,
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { ok: false, error_class };
  }
}
