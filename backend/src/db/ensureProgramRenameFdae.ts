import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Program rename: "AI Systems Architect Accelerator" -> "Forward Deployed AI Engineer Accelerator".
 *
 * WHY THIS RUNS AT BOOT. The code rename (same PR) changes every string the app writes from
 * now on, but the content students, leads and staff are SHOWN going forward also lives in
 * rows: the program blueprint (the Curriculum Composer's course dropdown), Cora's course,
 * timeline cards, curriculum prompts, landing pages, unsent emails, room names. There is no
 * migration runner in this repo, so - like every other `ensure*` module - this converges the
 * database on the next deploy and is a no-op on every boot after that.
 *
 * WHY IT MUST SHIP WITH THE CODE. `seeds/seedCanonicalCourse.ts` finds the program blueprint
 * BY NAME. Renaming the code without the row would make the next seed run create a second,
 * empty "Forward Deployed AI Engineer Accelerator" blueprint beside the real one.
 *
 * WHAT IT DELIBERATELY LEAVES ALONE. History and other people's words: sent emails, the inbox
 * mirror, logs, page views, tickets, the Basecamp mirror, student answers and portfolios,
 * other people's job titles, and case studies (editing a live case study republishes it).
 * Only the allow-list below is touched.
 *
 * SAFETY. Every changed value is first copied to `program_rename_fdae_backup` (table, column,
 * row id, old value), so the rename can be reversed row by row. Each column runs in its own
 * statement and a failure is logged, never thrown: a rename must never stop the API booting.
 */

/** Ordered, case-sensitive. Article forms first so "an AI Systems Architect" reads "a Forward ...". */
export const PROGRAM_RENAME_MAP: ReadonlyArray<readonly [string, string]> = [
  ['an AI Systems Architect', 'a Forward Deployed AI Engineer'],
  ['An AI Systems Architect', 'A Forward Deployed AI Engineer'],
  ['an AI systems architect', 'a forward deployed AI engineer'],
  ['An AI systems architect', 'A forward deployed AI engineer'],
  ['AN AI SYSTEMS ARCHITECT', 'A FORWARD DEPLOYED AI ENGINEER'],
  ['AI Systems Architects', 'Forward Deployed AI Engineers'],
  ['AI systems architects', 'forward deployed AI engineers'],
  ['AI SYSTEMS ARCHITECTS', 'FORWARD DEPLOYED AI ENGINEERS'],
  ['AI Systems Architect', 'Forward Deployed AI Engineer'],
  ['AI systems architect', 'forward deployed AI engineer'],
  ['AI SYSTEMS ARCHITECT', 'FORWARD DEPLOYED AI ENGINEER'],
  ['AI Architect Accelerator', 'Forward Deployed AI Engineer Accelerator'],
  ['AI Architect Readiness', 'Forward Deployed AI Engineer Readiness'],
];

/*
 * Every key is matched as WHOLE WORDS with any run of whitespace between them (a prompt that
 * wraps "AI Systems\nArchitect" still matches). The word boundary at the end is what keeps the
 * curriculum topic "AI Systems Architecture" and "Architected" out of it: without it they became
 * "Forward Deployed AI Engineerure". Keys contain only letters and spaces, so no escaping is needed.
 */
const words = (key: string): string[] => key.split(' ');

/** Postgres ARE for one key: \m / \M are start / end of word. */
const pgKey = (key: string): string => `\\m${words(key).join('\\s+')}\\M`;

/** The same key as a JS RegExp source, with the same word semantics as Postgres (\w = [A-Za-z0-9_]). */
const jsKey = (key: string): string => `(?<![A-Za-z0-9_])${words(key).join('\\s+')}(?![A-Za-z0-9_])`;

/**
 * Postgres regex matching exactly what the map rewrites - the idempotency guard. Built FROM the map,
 * so a value matching it is always changed by it (no row can match forever and be re-"renamed" on
 * every boot), and mixed casings the map does not cover ("AI Systems architect") are not matched.
 */
export const OLD_NAME_PATTERN = PROGRAM_RENAME_MAP.map(([from]) => pgKey(from)).join('|');

/** Pure: the same transform the SQL applies, used by tests and by any caller renaming text in code. */
export function renameProgramText(input: string): string {
  let s = input;
  for (const [from, to] of PROGRAM_RENAME_MAP) s = s.replace(new RegExp(jsKey(from), 'g'), to);
  return s;
}

/** Pure: does this text still contain an old name the map would rewrite? (JS twin of OLD_NAME_PATTERN.) */
export function hasOldProgramName(input: string): boolean {
  return PROGRAM_RENAME_MAP.some(([from]) => new RegExp(jsKey(from)).test(input));
}

export interface RenameTarget {
  table: string;
  columns: string[];
  /** Extra SQL predicate (trusted constant, never user input). */
  where?: string;
}

/** Forward-facing content only. Anything not listed here is history or someone else's words. */
export const RENAME_TARGETS: RenameTarget[] = [
  { table: 'program_blueprints', columns: ['name', 'description', 'default_prompt_injection_rules'] },
  { table: 'cora_courses', columns: ['name'] },
  { table: 'cora_kb_entries', columns: ['question_pattern', 'answer_template'] },
  { table: 'curriculum_blueprints', columns: ['title', 'purpose', 'learning_objectives', 'generated_plan', 'dna'] },
  { table: 'curriculum_type_definitions', columns: ['generation_prompt', 'evaluation_prompt', 'reflection_prompt', 'improvement_prompt', 'design_prompt'] },
  { table: 'curriculum_course_links', columns: ['course_title'] },
  { table: 'timeline_cards', columns: ['title', 'subtitle', 'description', 'metadata'] },
  { table: 'admissions_knowledge_entries', columns: ['content', 'keywords'] },
  { table: 'landing_pages', columns: ['content'] },
  { table: 'campaigns', columns: ['ai_system_prompt'] },
  { table: 'follow_up_sequences', columns: ['name', 'steps'] },
  { table: 'ai_agents', columns: ['description', 'system_prompt'] },
  { table: 'live_sessions', columns: ['title', 'description', 'kit_json', 'kit_config_json'] },
  { table: 'broadcast_occurrences', columns: ['title'] },
  { table: 'community_rooms', columns: ['name', 'topic'] },
  { table: 'room_resources', columns: ['title'] },
  { table: 'explorer_content_assets', columns: ['title', 'summary'] },
  { table: 'challenges', columns: ['name'] },
  { table: 'graph_nodes', columns: ['label', 'metadata'] },
  { table: 'presentation_decks', columns: ['content_html'] },
  { table: 'presentation_assignments', columns: ['checklist_json'] },
  // Unsent mail only. Sent/cancelled/failed rows are a record of what went out.
  { table: 'scheduled_emails', columns: ['subject', 'body'], where: "status NOT IN ('sent', 'cancelled', 'failed')" },
  // The program-interest category every lead carries ("AI Systems Architect", ~21k rows).
  { table: 'leads', columns: ['interest_area'] },
  // Ali's own title only (option C); other people's job titles are theirs.
  { table: 'enrollments', columns: ['title'], where: "title LIKE 'Managing Director%'" },
];

const BACKUP_DDL = `
CREATE TABLE IF NOT EXISTS program_rename_fdae_backup (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  old_value TEXT,
  renamed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

const ident = (s: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`unsafe identifier: ${s}`);
  return `"${s}"`;
};
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** Pure: the nested replace() expression over `expr` (a text expression). */
export function replaceExpression(expr: string): string {
  // regexp_replace with the word-bounded key; flag 'g' = every occurrence. Replacements hold no \ or &.
  return PROGRAM_RENAME_MAP.reduce((acc, [from, to]) => `regexp_replace(${acc}, ${lit(pgKey(from))}, ${lit(to)}, 'g')`, expr);
}

/** Pure: the backup + update statements for one column of a given Postgres data type. */
export function columnStatements(t: RenameTarget, column: string, dataType: string): string[] {
  const tbl = ident(t.table);
  const col = ident(column);
  const cast = dataType === 'jsonb' ? '::jsonb' : dataType === 'json' ? '::json' : '';
  const match = `${col}::text ~ ${lit(OLD_NAME_PATTERN)}${t.where ? ` AND (${t.where})` : ''}`;
  return [
    `INSERT INTO program_rename_fdae_backup (table_name, column_name, row_id, old_value)
     SELECT ${lit(t.table)}, ${lit(column)}, id::text, ${col}::text FROM ${tbl} WHERE ${match}`,
    `UPDATE ${tbl} SET ${col} = (${replaceExpression(`${col}::text`)})${cast} WHERE ${match}`,
  ];
}

export interface RenameOutcome { table: string; column: string; rows: number; error?: string }

export async function ensureProgramRenameFdae(): Promise<RenameOutcome[]> {
  const outcomes: RenameOutcome[] = [];
  try {
    await sequelize.query(BACKUP_DDL);
  } catch (err) {
    console.error('[DB] program rename: backup table not created, skipping rename', (err as Error).message);
    return outcomes;
  }
  for (const t of RENAME_TARGETS) {
    const cols = (await sequelize.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
          AND column_name IN (:cols)
          AND EXISTS (SELECT 1 FROM information_schema.columns c2
                       WHERE c2.table_schema = 'public' AND c2.table_name = :table AND c2.column_name = 'id')`,
      { replacements: { table: t.table, cols: t.columns }, type: QueryTypes.SELECT },
    ).catch(() => [])) as { column_name: string; data_type: string }[];
    for (const { column_name, data_type } of cols) {
      const [backup, update] = columnStatements(t, column_name, data_type);
      try {
        const rows = await sequelize.transaction(async (transaction) => {
          await sequelize.query(backup, { transaction });
          const [, meta] = await sequelize.query(update, { transaction });
          return Number((meta as { rowCount?: number })?.rowCount ?? 0);
        });
        if (rows) outcomes.push({ table: t.table, column: column_name, rows });
      } catch (err) {
        outcomes.push({ table: t.table, column: column_name, rows: 0, error: (err as Error).message });
      }
    }
  }
  const renamed = outcomes.reduce((n, o) => n + o.rows, 0);
  const failed = outcomes.filter((o) => o.error);
  console.log(`[DB] program rename (Forward Deployed AI Engineer): ${renamed} value(s) renamed across ${outcomes.length - failed.length} column(s)${failed.length ? `, ${failed.length} column(s) FAILED: ${JSON.stringify(failed)}` : ''}`);
  return outcomes;
}
