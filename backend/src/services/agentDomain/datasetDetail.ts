/**
 * datasetDetail — what one dataset actually looks like, for the builder choosing it.
 *
 * Ali, 17 Nov 2026: *"If we are picking datasets we need to be able to see the data when we click
 * on it."*
 *
 * ## The boundary, stated before the code
 *
 * "See the data" has two readings, and only one of them is safe to build. A builder choosing
 * `enrollments` needs to know its SHAPE: what the columns are called, what kind of thing each one
 * holds, roughly how big it is, when it was last looked at, and what it joins to. That is what
 * makes a tool request specific instead of a guess.
 *
 * The other reading is rows, and this module never returns one. `dataset_registry` holds 633
 * scanned tables covering students, leads, enrollments and payments; a drill-in that sampled rows
 * would hand every holder of the `dashboard` section real people's records, on a screen whose
 * entire purpose is choosing a table from a list. There is no version of that which is worth the
 * convenience, and `profile_summary` is excluded for exactly this reason: it is an unbounded blob
 * written by a profiler, it may contain minima, maxima and example values, and nobody can promise
 * what a future profiler will put in it. A field whose safety depends on what somebody writes into
 * it later is not a field this module returns.
 *
 * If Ali later names specific tables whose rows he wants visible, that is a different endpoint
 * with its own gate and its own named tables. It is not this one widened.
 *
 * ## Why the row count IS returned here, when the catalog withholds it
 *
 * `datasetCatalog.ts` deliberately leaves `row_count` out of the LIST, and the reason it gives is
 * about handing business figures to every holder of `dashboard` — in bulk, 633 at a time, as a
 * side effect of typing in a search box. This is the opposite shape: one table, named explicitly,
 * at the moment somebody is about to request access to it. The count is also the single most
 * decision-changing fact available, because a request to read a 300-row table and a request to
 * read a 300,000-row one are different requests with different blast radiuses, and the person
 * deciding should be able to see which one they are being asked for.
 *
 * So the reversal is deliberate, bounded to one named table per call, and recorded here rather
 * than discovered later as an inconsistency.
 *
 * ## Split, as the rest of this subtree is
 *
 * `shapeDatasetDetail` is pure and does the whole projection, including the exclusions, so the
 * thing that must never leak a value can be tested without a database. `loadDatasetDetail` does
 * the I/O and nothing else, and a missing table comes back as `null` rather than throwing: a
 * builder clicking a stale name needs "that table is not in the catalog", not a 500.
 */

import { QueryTypes, type Sequelize } from 'sequelize';

/** One column, as a person choosing a dataset needs it. A name and a KIND, never a value. */
export interface DatasetColumn {
  readonly name: string;
  /**
   * The semantic type the scanner recorded — `email`, `identifier`, `timestamp`, and so on.
   *
   * Null when the map holds the column with no type rather than omitting it. Null is honest here;
   * guessing a type from a column's name is how `read_lead_records` got matched to
   * `hire_interviews`, and that mistake is already written up in `datasetCatalog.ts`.
   */
  readonly semantic_type: string | null;
}

/** A join this table declares. Names only: two tables and the columns that connect them. */
export interface DatasetRelationship {
  readonly to_table: string;
  readonly from_column: string | null;
  readonly to_column: string | null;
}

export interface DatasetDetail {
  readonly table_name: string;
  readonly schema_name: string;
  readonly status: string;
  /** ISO day, or null when the row has never been scanned. */
  readonly last_scanned: string | null;
  readonly column_count: number;
  readonly columns: ReadonlyArray<DatasetColumn>;
  /**
   * Rows, or null when the scanner never recorded one.
   *
   * Null is NOT rendered as zero anywhere. "We do not know how big this is" and "this table is
   * empty" lead to opposite decisions, and a 0 standing in for the first one would quietly argue
   * that reading the table is harmless.
   */
  readonly row_count: number | null;
  readonly relationships: ReadonlyArray<DatasetRelationship>;
  /**
   * How many joins the table declares in total, which is not the length of the list above.
   *
   * Added 2026-11-18 after an audit against real data: `enrollments` declares **133** and the
   * panel was showing 40 with nothing to say the other 93 existed. That is the same mistake
   * `columns_incomplete` was written to prevent, made one field along, and it is worse here
   * because a decider reading "joins to 40 tables" would reasonably conclude that is the whole
   * blast radius of a read grant.
   */
  readonly relationship_count: number;
  /** TRUE when `relationships` is shorter than `relationship_count`. */
  readonly relationships_incomplete: boolean;
  /**
   * TRUE when `columns` is shorter than `column_count` — fewer names than the table has.
   *
   * It covers both ways that happens, which is why it is defined on the LIST rather than on the
   * type map. A table whose declared count is 40 and whose type map holds 12 has been scanned
   * partially or has changed since. A table with 225 columns has been truncated by
   * `MAX_DETAIL_COLUMNS`. Either way the names on screen are not the whole table, and the person
   * deciding a read grant should be told that rather than shown a tidy list that looks complete.
   *
   * Surfaced rather than reconciled: the two counts are both facts, and picking one would throw
   * away the evidence that the catalog is behind.
   */
  readonly columns_incomplete: boolean;
}

/** How many columns one detail response carries, so a 400-column table cannot return all of them. */
export const MAX_DETAIL_COLUMNS = 200;
/** How many declared joins one detail response carries. */
export const MAX_DETAIL_RELATIONSHIPS = 40;

/** The registry row, exactly as the query selects it. `profile_summary` is NOT selected. */
export interface DatasetDetailRow {
  table_name: string;
  schema_name: string | null;
  column_count: number | string | null;
  row_count: number | string | null;
  semantic_types: Record<string, unknown> | null;
  relationships: unknown;
  status: string | null;
  last_scanned: Date | string | null;
}

const isoDay = (v: Date | string | null): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const countOrNull = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

/**
 * A semantic type, only if it is a plain short string.
 *
 * The map is JSONB, so a value could be an object, an array or a long blob written by some future
 * profiler. Anything that is not a short scalar label is dropped to null rather than stringified
 * onto the screen, because a stringified object is exactly the shape in which a sampled value
 * would arrive.
 */
function labelOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 40) return null;
  return s;
}

/**
 * One declared join, if it looks like one.
 *
 * `relationships` is an untyped JSONB array written by the scanner, and the field names it uses
 * have varied, so each candidate key is tried in turn. Anything that does not yield a target table
 * name is dropped: a relationship panel listing `{}` three times is worse than one listing
 * nothing, because it reads as "this table joins to something" when the truth is "we cannot tell".
 */
function relationshipOf(v: unknown): DatasetRelationship | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const to = labelOf(o.to_table) ?? labelOf(o.table) ?? labelOf(o.references)
    ?? labelOf(o.target_table) ?? labelOf(o.foreign_table);
  if (!to) return null;
  return {
    to_table: to,
    from_column: labelOf(o.from_column) ?? labelOf(o.column) ?? labelOf(o.local_column),
    to_column: labelOf(o.to_column) ?? labelOf(o.references_column) ?? labelOf(o.foreign_column),
  };
}

/**
 * Project a registry row into what the drill-in shows. PURE, and the exclusions live here.
 *
 * Columns come back in the scanner's own order rather than sorted. The order a table's columns
 * were scanned in is close to the order they are defined in, and that grouping (the identifiers
 * together, then the dates, then the payload) is how somebody reads a schema.
 */
export function shapeDatasetDetail(row: DatasetDetailRow): DatasetDetail {
  const map = row.semantic_types && typeof row.semantic_types === 'object' && !Array.isArray(row.semantic_types)
    ? row.semantic_types
    : {};
  const names = Object.keys(map);
  const columns: DatasetColumn[] = names
    .slice(0, MAX_DETAIL_COLUMNS)
    .map((name) => ({ name, semantic_type: labelOf(map[name]) }));

  const declared = countOrNull(row.column_count);
  // The declared count when there is one, else what the map actually carries. Same rule as the
  // catalog, for the same reason: reporting 0 columns for a scanned table reads as "empty table".
  const columnCount = declared && declared > 0 ? declared : names.length;

  // Readable joins are counted BEFORE the cap, so the count is what the table declares rather
  // than what happened to fit. Unreadable entries are excluded from both, because claiming a
  // join nobody can name would be its own kind of lie.
  const readableJoins = Array.isArray(row.relationships)
    ? row.relationships
      .map(relationshipOf)
      .filter((r): r is DatasetRelationship => r !== null)
    : [];
  const relationships = readableJoins.slice(0, MAX_DETAIL_RELATIONSHIPS);

  return {
    table_name: String(row.table_name).trim(),
    schema_name: (row.schema_name ?? 'public').trim() || 'public',
    status: (row.status ?? 'discovered').trim() || 'discovered',
    last_scanned: isoDay(row.last_scanned),
    column_count: columnCount,
    columns,
    row_count: countOrNull(row.row_count),
    relationships,
    relationship_count: readableJoins.length,
    relationships_incomplete: relationships.length < readableJoins.length,
    columns_incomplete: columns.length < columnCount,
  };
}

/**
 * Read one dataset by name. NEVER REJECTS, and a name that is not in the catalog is `null`.
 *
 * Parameterised on the name, and the column list is a literal — `profile_summary` is not selected
 * at all, rather than selected and then dropped. A field that never enters the process cannot be
 * logged by accident, serialised by a later refactor, or exposed by somebody spreading the row.
 */
export async function loadDatasetDetail(
  sequelize: Sequelize,
  tableName: string,
): Promise<DatasetDetail | null> {
  const name = String(tableName ?? '').trim();
  if (!name) return null;
  try {
    const rows = await sequelize.query<DatasetDetailRow>(
      `SELECT table_name, schema_name, column_count, row_count,
              semantic_types, relationships, status, last_scanned
         FROM dataset_registry
        WHERE table_name = :name
        LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { name } },
    );
    const row = rows[0];
    if (!row || typeof row.table_name !== 'string') return null;
    return shapeDatasetDetail(row);
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'dataset_detail_unreadable',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      // The table name is in here on purpose and is not sensitive: it is a name the caller
      // already typed. No row data is ever in scope to log.
      context: { table_name: name, message: err instanceof Error ? err.message : String(err) },
    }));
    return null;
  }
}
