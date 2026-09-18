import { Op } from 'sequelize';
import { GROWTH_JOURNEY_PHASE4_STATEMENTS } from '../../../../db/growthJourneyPhase4Statements';

/**
 * T414 — the in-memory tables the Phase 4 world (`phase4Harness.ts`) is made of. Split from the
 * harness at the 500-line ceiling: this file knows nothing about fixtures or boundaries.
 *
 * Every `CREATE UNIQUE INDEX` in T401's SHIPPED statements is parsed here - columns, `COALESCE`
 * expressions and the partial `WHERE` - and honoured on create and on update, so "one open handoff
 * per subject per brand" and "one open conversation per lead per brand" are the database's rules in
 * this world, not the test's. Change the DDL and the world changes with it; an index column or a
 * predicate the parser cannot read throws rather than being ignored. `matches` evaluates the
 * where-clause shapes these services send (equality, null, arrays as IN, `Op.in/notIn/ne/gt/gte/lt/lte`,
 * `Op.or/and`, a dotted JSON key).
 */

export const AS_OF_4 = new Date('2026-09-16T12:00:00Z');

/* ── unique indexes, read from the shipped DDL ──────────────────────────────── */

export type Row = Record<string, unknown> & { id: string };
export type Where = Record<string | symbol, unknown>;

export interface UniqueIndex {
  name: string;
  table: string;
  columns: string[];
  keyOf: (row: Record<string, unknown>) => unknown[];
  applies: (row: Record<string, unknown>) => boolean;
}

/** Split `a, COALESCE(b, ''), c` on its top-level commas. */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function columnReader(expr: string): { column: string; read: (row: Record<string, unknown>) => unknown } {
  if (/^\w+$/.test(expr)) return { column: expr, read: (row) => row[expr] };
  const co = /^COALESCE\((\w+), '([^']*)'\)$/.exec(expr);
  if (co) return { column: co[1], read: (row) => row[co[1]] ?? co[2] };
  throw new Error(`phase4Harness: an index column this world cannot honour: ${expr}`);
}

function predicateOf(sql: string | undefined): (row: Record<string, unknown>) => boolean {
  if (!sql) return () => true;
  const inList = /^(\w+) IN \(([^)]*)\)$/.exec(sql);
  if (inList) {
    const values = inList[2].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
    return (row) => values.includes(String(row[inList[1]]));
  }
  const notNull = /^(\w+) IS NOT NULL$/.exec(sql);
  if (notNull) return (row) => row[notNull[1]] !== null && row[notNull[1]] !== undefined;
  const isNull = /^(\w+) IS NULL$/.exec(sql);
  if (isNull) return (row) => row[isNull[1]] === null || row[isNull[1]] === undefined;
  throw new Error(`phase4Harness: a partial-index predicate this world cannot honour: ${sql}`);
}

export function uniqueIndexesFromDdl(statements: readonly string[] = GROWTH_JOURNEY_PHASE4_STATEMENTS): UniqueIndex[] {
  const out: UniqueIndex[] = [];
  for (const raw of statements) {
    const s = raw.replace(/\s+/g, ' ').trim();
    const head = /^CREATE UNIQUE INDEX (?:IF NOT EXISTS )?(\w+) ON (\w+) \(/.exec(s);
    if (!head) continue;
    let depth = 1;
    let i = head[0].length;
    for (; i < s.length && depth > 0; i += 1) {
      if (s[i] === '(') depth += 1;
      if (s[i] === ')') depth -= 1;
    }
    const readers = splitTopLevel(s.slice(head[0].length, i - 1)).map(columnReader);
    const where = /^ WHERE (.+)$/.exec(s.slice(i));
    out.push({
      name: head[1],
      table: head[2],
      columns: readers.map((r) => r.column),
      keyOf: (row) => readers.map((r) => r.read(row)),
      applies: predicateOf(where?.[1]),
    });
  }
  return out;
}

export const uniqueViolation = (index: string) =>
  Object.assign(new Error(`duplicate key value violates unique constraint "${index}"`), { name: 'SequelizeUniqueConstraintError', parent: { code: '23505' } });

/* ── a where-clause evaluator for the shapes these services send ────────────── */

function valueAt(row: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return row[key];
  return key.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), row);
}

export function matches(row: Record<string, unknown>, where: Where): boolean {
  for (const key of Reflect.ownKeys(where)) {
    const cond = where[key];
    if (key === Op.or) {
      if (!(cond as Where[]).some((alt) => matches(row, alt))) return false;
      continue;
    }
    if (key === Op.and) {
      if (!(cond as Where[]).every((alt) => matches(row, alt))) return false;
      continue;
    }
    const v = valueAt(row, key as string);
    if (Array.isArray(cond)) {
      if (!cond.includes(v)) return false;
    } else if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<symbol, unknown>;
      const t = (x: unknown) => (x instanceof Date ? x.getTime() : x) as number;
      if (Op.in in c && !(c[Op.in] as unknown[]).includes(v)) return false;
      if (Op.notIn in c && (c[Op.notIn] as unknown[]).includes(v)) return false;
      if (Op.ne in c && (c[Op.ne] === null ? v === null || v === undefined : v === c[Op.ne])) return false;
      if (Op.gt in c && !(t(v) > t(c[Op.gt]))) return false;
      if (Op.gte in c && !(t(v) >= t(c[Op.gte]))) return false;
      if (Op.lt in c && !(t(v) < t(c[Op.lt]))) return false;
      if (Op.lte in c && !(t(v) <= t(c[Op.lte]))) return false;
    } else if (cond === null) {
      if (v !== null && v !== undefined) return false;
    } else if (v !== cond) return false;
  }
  return true;
}

/* ── a table: rows, the DDL's unique indexes, and the query shapes ──────────── */

let TICK = 0;
/** The clock every row is stamped with: the step's `asOf`, plus a tick so order is total. */
export const clock = { now: AS_OF_4 };
export const stamp = (): Date => new Date(clock.now.getTime() + (TICK += 1));

export interface Query { where?: Where; order?: Array<[string, string]>; limit?: number }

export class Table {
  rows: Row[] = [];
  private seq = 0;
  constructor(readonly table: string, private readonly prefix: string) {}

  private uniques(): UniqueIndex[] {
    return UNIQUES.filter((u) => u.table === this.table);
  }

  private violated(candidate: Record<string, unknown>, self?: Row): string | null {
    for (const u of this.uniques()) {
      if (!u.applies(candidate)) continue;
      const key = u.keyOf(candidate);
      if (key.some((k) => k === null || k === undefined)) continue;
      const clash = this.rows.some((r) => r !== self && u.applies(r) && u.keyOf(r).every((k, i) => k === key[i]));
      if (clash) return u.name;
    }
    return null;
  }

  reset(): void {
    this.rows = [];
    this.seq = 0;
  }

  create = async (attrs: Record<string, unknown>): Promise<Row> => this.insert(attrs);

  /** The synchronous body of `create`, for seeding a world: a violation throws here rather than as a stray rejection. */
  insert(attrs: Record<string, unknown>): Row {
    const at = stamp();
    const row = { ...attrs, id: (attrs.id as string | undefined) ?? `${this.prefix}-${(this.seq += 1)}`, created_at: attrs.created_at ?? at, updated_at: at } as Row;
    const hit = this.violated(row);
    if (hit) throw uniqueViolation(hit);
    Object.defineProperty(row, 'update', {
      enumerable: false,
      value: async (patch: Record<string, unknown>) => {
        const hitOnUpdate = this.violated({ ...row, ...patch }, row);
        if (hitOnUpdate) throw uniqueViolation(hitOnUpdate);
        Object.assign(row, patch, { updated_at: stamp() });
        return row;
      },
    });
    Object.defineProperty(row, 'get', { enumerable: false, value: (k: string) => row[k] });
    this.rows.push(row);
    return row;
  }

  private select(q: Query = {}): Row[] {
    const hits = this.rows.filter((r) => matches(r, q.where ?? {}));
    const [first] = q.order ?? [];
    if (first) {
      const [col, dir] = first;
      const t = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number) ?? 0);
      hits.sort((a, b) => (t(a[col]) - t(b[col])) * (String(dir).toUpperCase() === 'DESC' ? -1 : 1));
    }
    return q.limit ? hits.slice(0, q.limit) : hits;
  }

  findOne = async (q: Query = {}): Promise<Row | null> => this.select(q)[0] ?? null;
  findAll = async (q: Query = {}): Promise<Row[]> => this.select(q);
  count = async (q: Query = {}): Promise<number> => this.select(q).length;
  /** `Model.update(patch, { where })`: every matching row, through the same index checks. */
  update = async (patch: Record<string, unknown>, q: Query): Promise<[number]> => {
    const hits = this.select(q);
    for (const r of hits) await (r as unknown as { update: (p: Record<string, unknown>) => Promise<Row> }).update(patch);
    return [hits.length];
  };
}

export const UNIQUES = uniqueIndexesFromDdl();
