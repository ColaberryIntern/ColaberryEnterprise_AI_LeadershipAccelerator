/**
 * The additive-only predicate, extracted so its test file stays under the 500-line ceiling.
 *
 * A FIXTURE, not production code: `ensureProjectLifecycleSchema.ts` ships a statement LIST and
 * this is the rule that list is held to. It lives beside the tests because the rule is a test
 * concern — nothing at runtime consults it.
 *
 * TWO LAYERS, and the reason is written at each one. An earlier version replaced the deny-list
 * with an allow-list and deleted the deny-list; the allow-list then turned out to rest on a
 * tokeniser that could be fooled by a single quote, and 954 destructive shapes became
 * acceptable. Both layers now, with a generated sweep over carrier tokens in the test file.
 */
/**
 * Blank the CONTENTS of string literals, quoted identifiers and comments.
 *
 * THE BUG THIS EXISTS FOR. The paren counter below had no idea what a quote was, so ONE
 * unbalanced open-paren inside a DEFAULT string or a comment suppressed the comma split and
 * glued a destructive action into a permitted one. A verifier ran the result against real
 * Postgres: an ADD COLUMN carrying DEFAULT with an unbalanced paren, followed by DROP COLUMN,
 * was ACCEPTED — and it dropped a populated column at exit 0.
 *
 * Runs on the RAW sql, BEFORE the whitespace collapse: a line comment runs to a newline, so
 * collapsing first would let it swallow the rest of the statement instead of ending.
 *
 * Blanks to spaces of equal length rather than deleting, so word boundaries are preserved and
 * two tokens either side of a literal cannot be welded into one.
 */
export function blankLiterals(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      while (i < sql.length && sql.charCodeAt(i) !== 10) { out += ' '; i += 1; }
      continue;
    }
    if (two === '/*') {
      while (i < sql.length && sql.slice(i, i + 2) !== '*/') { out += ' '; i += 1; }
      if (i < sql.length) { out += '  '; i += 2; }
      continue;
    }
    // 39 is a single quote, 34 a double. Compared by CODE so this scanner needs no escaping of
    // the very characters it is about, which is where a scanner like this usually goes wrong.
    const code = sql.charCodeAt(i);
    if (code === 39 || code === 34) {
      out += ' ';
      i += 1;
      while (i < sql.length && sql.charCodeAt(i) !== code) { out += ' '; i += 1; }
      if (i < sql.length) { out += ' '; i += 1; }
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/**
 * Split a comma-separated ALTER action list at PAREN DEPTH ZERO.
 *
 * Only ever called on literal-blanked text, which is what makes the depth count trustworthy.
 * A precision such as NUMERIC(10,2) still carries a real comma that is not an action boundary.
 */
export function splitActions(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

/** Word-boundary token test over already-collapsed, literal-blanked, uppercased text. */
function hasToken(text: string, token: string): boolean {
  return new RegExp('(^| )' + token + '($| )').test(text);
}

/**
 * Tokens that are never additive, wherever they appear.
 *
 * RESTORED, AND APPLIED TO BOTH BRANCHES. An earlier version of this file moved these into the
 * CREATE branch only, on the reasoning that the ALTER branch allow-list below made them
 * redundant. It did not: the allow-list is only as sound as the tokeniser under it, and mine
 * could be fooled by a quote. Deleting this layer removed the thing that would have caught that,
 * and 954 distinct destructive shapes became acceptable.
 *
 * Defence in depth is not redundancy to be tidied away. Standing rule 15 says it directly:
 * enumerate what the OLD rule caught incidentally, because that is where the new hole is.
 *
 * USING is deliberately NOT here: CREATE INDEX ... USING gin is legitimate and additive. It is
 * refused on the ALTER branch specifically, below.
 */
const NEVER_ADDITIVE = [
  'DROP', 'TRUNCATE', 'RENAME', 'SET UNLOGGED', 'SET LOGGED', 'DISABLE TRIGGER',
  'ADD CONSTRAINT', 'GENERATED', 'VALIDATE CONSTRAINT', 'CLUSTER ON', 'INHERIT',
  'OWNER TO', 'SET SCHEMA', 'ENABLE ROW LEVEL SECURITY', 'ALTER COLUMN',
];

/**
 * Is ONE action an additive column add? The allow-list, and the SECOND layer.
 *
 * Kept because it catches what a keyword list cannot: an action that is simply not an ADD COLUMN
 * at all, including a spelling nobody has thought of. It is not a replacement for the deny-list.
 */
function isAdditiveAction(action: string): boolean {
  if (!action.startsWith('ADD COLUMN IF NOT EXISTS ')) return false;
  if (hasToken(action, 'UNIQUE')) return false;
  if (hasToken(action, 'PRIMARY KEY')) return false;
  if (action.includes('CHECK (') || action.includes('CHECK(')) return false;
  if (hasToken(action, 'REFERENCES')) return false;
  if (hasToken(action, 'NOT NULL') && !hasToken(action, 'DEFAULT')) return false;
  return true;
}

export function isAdditive(sql: string): boolean {
  // Literals blanked BEFORE the collapse, so no quote or comment can reach the scanner.
  const s = blankLiterals(sql).trim().toUpperCase().split(/\s+/).join(' ');
  const one = s.endsWith(';') ? s.slice(0, -1).trim() : s;
  if (one.includes(';')) return false;            // a SECOND statement

  // LAYER 1 — the deny-list, on every statement, whichever branch it would take.
  for (const token of NEVER_ADDITIVE) {
    if (hasToken(one, token)) return false;
  }
  // ALTER [COLUMN] col [SET DATA] TYPE ... — COLUMN is OPTIONAL in PostgreSQL, which is exactly
  // how one of these got past a check that only looked for the two-word form.
  if (/(^| )ALTER (COLUMN )?[^ ]+ (SET DATA )?TYPE($| )/.test(one)) return false;

  const isCreate =
    one.startsWith('CREATE TABLE IF NOT EXISTS') ||
    one.startsWith('CREATE INDEX IF NOT EXISTS') ||
    one.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS');
  // A CREATE of a NEW object destroys nothing, and USING names an index access method here.
  if (isCreate) return true;

  // Outside a CREATE INDEX, USING is a column rewrite.
  if (hasToken(one, 'USING')) return false;

  // LAYER 2 — the allow-list, over every action in the list.
  const m = /^ALTER TABLE ([^ ]+) (.+)$/.exec(one);
  if (m === null) return false;
  return splitActions(m[2]).every(isAdditiveAction);
}
