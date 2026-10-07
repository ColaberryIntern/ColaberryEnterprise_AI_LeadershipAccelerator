import { sequelize } from '../config/database';

/**
 * Generated decks — one row per attempt to turn a student's prompt into a deck.
 *
 * ITS OWN MODULE, not another table bolted onto `ensurePresentationStudioSchema`.
 * That module's parity suite asserts it creates EXACTLY the five Studio tables, which
 * is a real guard against a sixth arriving unnoticed. Widening the assertion to make
 * room for this one would retire the guard to save a file.
 *
 * WHAT A ROW IS. A row is an ATTEMPT, not a deck. A failed generation is a row with
 * `state = 'failed'`, the error class that caused it, and the attempt number — not a
 * missing row. "Nothing happened" and "it was tried four times and the model kept
 * timing out" must not look the same to the student or to whoever is paged.
 *
 * WHY THE PROMPT IS STORED, not just referenced. `prompt_version` names the template
 * and version in force, and `prompt_sha` freezes what was actually sent. The prompt
 * is assembled from the student's own project, so re-deriving it later gives a
 * different string the moment they edit anything — and then "why did it generate
 * that" has no answer. The same first-write-wins reasoning as
 * `student_tasks.verified_ref`.
 *
 * THE ADD COLUMN TRAP, HONOURED EXPLICITLY. `CREATE TABLE IF NOT EXISTS` is a no-op
 * on an existing table, so every column in the CREATE body also gets its own
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. A column added only to the CREATE body
 * silently never appears on any environment where the table already exists.
 *
 * NO COMPLETION, NO POINTS. Generating a deck is work in progress. Whether it
 * satisfies PREP-3 is still decided by `markTaskVerifiedComplete` from submitted
 * evidence, exactly as before.
 */

export const PRESENTATION_DECK_TABLES = ['presentation_decks'] as const;

export const PRESENTATION_DECK_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS presentation_decks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     assignment_id UUID NOT NULL,
     attempt_no INTEGER NOT NULL DEFAULT 1,
     state VARCHAR(20) NOT NULL DEFAULT 'generating',
     model VARCHAR(80),
     prompt_version VARCHAR(120),
     prompt_sha VARCHAR(64),
     content_html TEXT,
     error_class VARCHAR(60),
     error_detail TEXT,
     tries INTEGER NOT NULL DEFAULT 0,
     started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     finished_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS assignment_id UUID`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS attempt_no INTEGER DEFAULT 1`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'generating'`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS model VARCHAR(80)`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(120)`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS prompt_sha VARCHAR(64)`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS content_html TEXT`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS error_class VARCHAR(60)`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS error_detail TEXT`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS tries INTEGER DEFAULT 0`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_decks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

  // ONE GENERATION IN FLIGHT PER ASSIGNMENT, enforced by the database rather than by a
  // read-then-write in the service. Two clicks a second apart would otherwise both see
  // "nothing running" and both start a paid model call. A partial unique index is the
  // only thing that cannot race here.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_decks_one_in_flight
     ON presentation_decks (assignment_id) WHERE state = 'generating'`,
  // Attempts are numbered per assignment, so "attempt 3 of a cap of 3" is a fact in the
  // table and not a count the service has to recompute.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_decks_attempt_no
     ON presentation_decks (assignment_id, attempt_no)`,
  `CREATE INDEX IF NOT EXISTS presentation_decks_ready
     ON presentation_decks (assignment_id, finished_at DESC) WHERE state = 'ready'`,
  // What a human has to look at: generations that ran out of attempts.
  `CREATE INDEX IF NOT EXISTS presentation_decks_failed
     ON presentation_decks (state, finished_at DESC) WHERE state = 'failed'`,
];

export async function ensurePresentationDeckSchema(): Promise<void> {
  for (const sql of PRESENTATION_DECK_STATEMENTS) {
    await sequelize.query(sql);
  }
}

export default ensurePresentationDeckSchema;
