import { sequelize } from '../../config/database';

/**
 * Shared helpers for DDL/model parity tests.
 *
 * Extracted at the third use, per CLAUDE.md's "three is the threshold" rule:
 * `ensureMultiTenantSchema.modelParity.test.ts` has its own copies,
 * `ensureMarketingTrackingSchema.modelParity.test.ts` had a second, and
 * `ensureMarketingCampaignSchema.modelParity.test.ts` would have been a third.
 *
 * Not named `*.test.ts`, so jest's `testMatch` (`**\/__tests__\/**\/*.test.ts`) does not
 * pick it up as a suite.
 *
 * THE BUG THIS FAMILY OF TESTS EXISTS TO PREVENT, which actually happened on the tenancy
 * columns: the DDL added columns, services read and wrote them, and no Sequelize model
 * declared them. Sequelize only touches attributes a model knows about, so reads returned
 * `undefined` and `update()` silently dropped the write while reporting success. Every unit
 * test passed, because they all mock the models.
 */

/** tableName -> the model registered for it. */
export function modelsByTable(): Record<string, any> {
  const byTable: Record<string, any> = {};
  for (const model of Object.values(sequelize.models)) {
    byTable[(model as any).getTableName()] = model;
  }
  return byTable;
}

/**
 * The set of DATABASE COLUMN names a model maps to.
 *
 * Not the same as `Object.keys(getAttributes())`. Under `underscored: true` Sequelize keeps
 * the JS attribute named `createdAt` while pointing it at the `created_at` column via
 * `field`. Comparing attribute names against DDL column names therefore reports `created_at`
 * as missing on a model that maps it perfectly well.
 */
export function modelColumnNames(model: any): Set<string> {
  const attrs = model.getAttributes();
  return new Set(Object.keys(attrs).map((a) => attrs[a]?.field ?? a));
}

/**
 * `ALTER TABLE x ADD COLUMN IF NOT EXISTS y TYPE` -> { table, column }
 */
export function parseAddedColumns(
  statements: readonly string[],
): Array<{ table: string; column: string }> {
  const added: Array<{ table: string; column: string }> = [];
  const rx = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi;
  for (const sql of statements) {
    let m: RegExpExecArray | null;
    rx.lastIndex = 0;
    while ((m = rx.exec(sql)) !== null) added.push({ table: m[1], column: m[2] });
  }
  return added;
}

/**
 * `CREATE TABLE IF NOT EXISTS <name> ( <col> TYPE ..., CONSTRAINT ... )`
 * -> { table, columns[] }
 *
 * Splits the body on top-level commas only, so `VARCHAR(32)`, `CHAR(64)` and
 * `DEFAULT '{}'::jsonb` do not fracture a definition.
 */
export function parseCreatedTables(
  statements: readonly string[],
): Array<{ table: string; columns: string[] }> {
  const out: Array<{ table: string; columns: string[] }> = [];
  const header = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(/i;
  const notAColumn = new Set([
    'primary', 'unique', 'constraint', 'foreign', 'check', 'exclude', 'like',
  ]);

  for (const raw of statements) {
    // Strip `--` line comments BEFORE parsing.
    //
    // Without this, a commented column is silently DROPPED from the parse rather than
    // mis-parsed: the split is on top-level commas, so a comment sitting between two column
    // definitions becomes the head of the next part, its first token is `--`, that fails the
    // \w+ test, and the real column following it is discarded along with the comment. The
    // column then looks absent from the DDL, and the inverse parity check reports the
    // model's attribute as spurious — pointing at entirely the wrong file.
    //
    // Not hypothetical: ensureContentOsSchema documents several columns inline this way.
    const sql = raw.replace(/--[^\n]*/g, '');
    const m = header.exec(sql);
    if (!m) continue;

    const bodyStart = sql.indexOf('(', m.index);
    let depth = 0;
    let bodyEnd = -1;
    for (let i = bodyStart; i < sql.length; i += 1) {
      if (sql[i] === '(') depth += 1;
      else if (sql[i] === ')') {
        depth -= 1;
        if (depth === 0) { bodyEnd = i; break; }
      }
    }
    if (bodyEnd === -1) continue;

    const body = sql.slice(bodyStart + 1, bodyEnd);
    const parts: string[] = [];
    let buf = '';
    depth = 0;
    let inQuote = false;
    for (const ch of body) {
      if (ch === "'") inQuote = !inQuote;
      if (!inQuote && ch === '(') depth += 1;
      if (!inQuote && ch === ')') depth -= 1;
      if (!inQuote && ch === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
      buf += ch;
    }
    if (buf.trim()) parts.push(buf);

    const columns = parts
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split(/\s+/)[0])
      .filter((c) => /^\w+$/.test(c) && !notAColumn.has(c.toLowerCase()));

    out.push({ table: m[1], columns });
  }
  return out;
}
