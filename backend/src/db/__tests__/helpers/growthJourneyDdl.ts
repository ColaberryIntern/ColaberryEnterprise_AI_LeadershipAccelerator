import { GROWTH_JOURNEY_STATEMENTS } from '../../ensureGrowthJourneySchema';

/**
 * Shared views over the growth-journey DDL for the schema tests. The statement
 * list is the single source; these helpers read it, never restate it.
 */

/** Every statement, joined — for whole-schema assertions (no DROP, no RENAME…). */
export const SQL = GROWTH_JOURNEY_STATEMENTS.join('\n');

/** The CREATE TABLE statement for `table`, or undefined when the run does not create it. */
export function statementCreating(table: string): string | undefined {
  return GROWTH_JOURNEY_STATEMENTS.find((s) =>
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(s),
  );
}

/**
 * Column names actually DECLARED by a CREATE TABLE statement — parsed, not
 * substring-matched. A `toContain('id')` is satisfied by the `id` inside
 * `tenant_id`, which is how a one-directional check once passed with a deleted
 * primary key; this splits the body into lines and takes the first word of each
 * column line, skipping constraint lines.
 */
export function columnsDeclaredIn(table: string): string[] {
  const sqlBlock = statementCreating(table);
  if (!sqlBlock) throw new Error(`no CREATE TABLE statement for ${table}`);

  const body = sqlBlock.slice(sqlBlock.indexOf('(') + 1, sqlBlock.lastIndexOf(')'));
  const NOT_A_COLUMN = /^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|EXCLUDE)$/i;

  return body
    .split('\n')
    .map((line) => line.trim().match(/^(\w+)\s+\S/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1])
    .filter((word) => !NOT_A_COLUMN.test(word));
}

/** Names of every table the statement list creates, in order. */
export function tablesCreated(): string[] {
  return GROWTH_JOURNEY_STATEMENTS.map((s) => s.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)?.[1])
    .filter((t): t is string => Boolean(t));
}
