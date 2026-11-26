/**
 * Migration matrix (VS5.1), pure: read the assistant table out of MIGRATION_MATRIX.md, check it, and compare
 * it with what the vendor API shows. The document is the record of decisions; this only holds it to its rules.
 */
export const COLUMNS = ['Key', 'Assistant', 'Direction', 'Owner', 'Route today', 'Recommendation', 'New profile / number', 'Feature mapping', 'Tests', 'Consent', 'History', 'Risk', 'Stage', 'Rollback', 'Evidence', 'Status'] as const;
export type Column = (typeof COLUMNS)[number];
export type MatrixRow = Record<Column, string>;
export const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED_UNVERIFIED', 'PASS', 'FAIL', 'BLOCKED', 'APPROVAL_REQUIRED', 'RETIRED'] as const;
export const STAGES = ['decision', 'legacy', 'shadow', 'test', 'canary', 'live', 'retired'] as const;
export const HEADING = '## Synthflow assistants';

export type ParsedMatrix = { ok: true; rows: MatrixRow[] } | { ok: false; reason: string };

export function parseMatrix(markdown: string): ParsedMatrix {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => l.trim() === HEADING);
  if (at < 0) return { ok: false, reason: `section "${HEADING}" not found` };
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const rows: MatrixRow[] = [];
  let header = false;
  for (let i = at + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const l = lines[i];
    if (!l.trim().startsWith('|') || /^\|[\s|:-]+$/.test(l.trim())) continue;
    const c = cells(l);
    if (!header) {
      if (c.join('|') !== COLUMNS.join('|')) return { ok: false, reason: 'the table columns are not the expected ones' };
      header = true;
      continue;
    }
    if (c.length !== COLUMNS.length) return { ok: false, reason: `line ${i + 1} has ${c.length} cells, expected ${COLUMNS.length}` };
    rows.push(Object.fromEntries(COLUMNS.map((k, n) => [k, c[n]])) as MatrixRow);
  }
  return header ? { ok: true, rows } : { ok: false, reason: 'the table is missing' };
}

const blank = (s: string): boolean => /^(|-|tbd|none|unknown|\?)$/i.test(s.trim());

export interface MatrixProblem { key: string; problem: string }

export function checkMatrix(rows: readonly MatrixRow[]): MatrixProblem[] {
  const out: MatrixProblem[] = [];
  const add = (key: string, problem: string) => out.push({ key, problem });
  if (!rows.length) add('(table)', 'no rows');
  const seen = new Set<string>();
  for (const r of rows) {
    if (!/^sf-[0-9a-f]{8}$/.test(r.Key)) add(r.Key || '(blank)', 'key is not an assistant key');
    if (seen.has(r.Key)) add(r.Key, 'duplicate key');
    seen.add(r.Key);
    if (blank(r.Owner)) add(r.Key, 'no owner');
    for (const c of ['Assistant', 'Recommendation', 'Risk', 'Rollback', 'Consent', 'History'] as const) if (blank(r[c])) add(r.Key, `no ${c.toLowerCase()}`);
    if (!(STATUSES as readonly string[]).includes(r.Status)) add(r.Key, `status ${r.Status || '(blank)'} is not a status word`);
    if (!(STAGES as readonly string[]).includes(r.Stage)) add(r.Key, `stage ${r.Stage || '(blank)'} is not a stage`);
    if (r.Status === 'PASS' && blank(r.Evidence)) add(r.Key, 'PASS without evidence');
    if (['canary', 'live', 'retired'].includes(r.Stage) && blank(r.Evidence)) add(r.Key, `${r.Stage} without evidence`);
    if (Object.values(r).some((v) => /\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}\b/.test(v))) add(r.Key, 'a phone-like number is in the row');
  }
  return out;
}

export interface LiveDiff { missing: string[]; gone: string[]; renamed: string[]; ok: boolean }

/** Every assistant the key sees has exactly one row, and every row is a real assistant (retired ones may be gone). */
export function compareLive(rows: readonly MatrixRow[], live: ReadonlyArray<{ key: string; name: string }>): LiveDiff {
  const byKey = new Map(rows.map((r) => [r.Key, r]));
  const liveKeys = new Set(live.map((a) => a.key));
  const missing = live.filter((a) => !byKey.has(a.key)).map((a) => a.key);
  const gone = rows.filter((r) => !liveKeys.has(r.Key) && r.Stage !== 'retired').map((r) => r.Key);
  const renamed = live.filter((a) => byKey.has(a.key) && byKey.get(a.key)!.Assistant !== a.name).map((a) => a.key);
  return { missing, gone, renamed, ok: live.length > 0 && !missing.length && !gone.length && !renamed.length };
}
