/**
 * datasetCatalog — the list of datasets a tool request may name, and the search behind the picker.
 *
 * ## Why this exists
 *
 * Quincy's L1 run (14 Nov 2026) ended on a request for read access to two rooms, and the answer
 * was that there is no read-only grant to give him: every `/api/admin/ai-ops/*` route sits behind
 * one `requireAdmin`. Ali's follow-up was the general version of it — *"there are a lot of agents
 * that will need access to certain data. They will need to get access to it, see it, understand
 * and build based on that data. How can we add this to our tool proposal process"*.
 *
 * The measured shape of the problem, from production on 14 Nov 2026:
 *
 *   - `dataset_registry` holds **633** scanned datasets, 633 with semantic types, 499 with
 *     declared relationships. The catalog is real, current, and nothing reads it at grant time.
 *   - **784 of 1,459** tool declarations across the 444 capability records (53.7%) are pure data
 *     reads. More than half of everything an agent is recorded as needing is a read.
 *   - `agent_domain_tool_request_details` and `agent_domain_tool_grants` were both **empty**. No
 *     request has ever been filed and no grant has ever been recorded, so nothing here is a
 *     migration — it is the shape the first one will arrive in.
 *
 * The important negative result sits behind that third line. An attempt to resolve the declared
 * tool verbs to datasets automatically was abandoned rather than shipped: name matching placed 27
 * of 118 read verbs, and adding the catalogue's own column vocabulary moved the figure by six
 * percent while producing matches like `read_lead_records` to `hire_interviews`. A classifier
 * confident enough to write `platform_identities` under `read_platform_db_sandbox` is confident
 * enough to be believed, which is how a wrong dataset id becomes a grant.
 *
 * So the picker is not a convenience laid over an existing mapping. **It is the only way a
 * grantable scope gets created**, because a verb string cannot be resolved to one and a human
 * choosing from a list can.
 *
 * ## What this module deliberately does not return
 *
 * `row_count`, though `dataset_registry` carries it. A builder choosing a dataset needs its name
 * and its shape; how many rows are in `leads` or `enrollments` is a business figure, and a catalog
 * endpoint is the wrong place to hand it to every holder of the `dashboard` section. The columns
 * come back as NAMES only, from `semantic_types`, never as sampled values.
 *
 * ## The split, which is the same one the rest of this subtree uses
 *
 * `loadDatasetCatalog` does the I/O and nothing else. `searchDatasetCatalog` is pure, so the
 * ranking the picker shows can be tested without a database, exactly as `toolDuplicateCheck.ts`
 * separates its matcher from `loadToolCatalogForMatching`. An unreadable catalog comes back as
 * `catalog_absent: true` with an empty list rather than throwing, and the CALLER decides what that
 * means — the gate turns it into `dataset_roster_absent` and refuses, the endpoint reports it. An
 * empty roster is never a pass.
 */

import { QueryTypes, type Sequelize } from 'sequelize';

/** One dataset, as the picker needs it. No row counts and no sampled values. */
export interface DatasetCatalogEntry {
  readonly table_name: string;
  readonly schema_name: string;
  readonly column_count: number;
  /** Column NAMES from `semantic_types`, so a builder can tell `leads` from `lead_sources`. */
  readonly columns: ReadonlyArray<string>;
  readonly status: string;
  /** ISO day, or null when the row has never been scanned. */
  readonly last_scanned: string | null;
}

export interface DatasetCatalog {
  readonly datasets: ReadonlyArray<DatasetCatalogEntry>;
  /**
   * TRUE when the catalog could not be read, or came back empty.
   *
   * Both are the same fact for a gate's purposes — there is no roster to check a name against —
   * and collapsing them here means no caller has to remember to handle two. The distinction is
   * kept in the log line, where it is a diagnosis rather than a decision.
   */
  readonly catalog_absent: boolean;
}

/** How many columns a single catalog entry carries, so one dataset cannot return a 400-name list. */
export const MAX_COLUMNS_PER_ENTRY = 60;

/** Default page size for the picker. Bounded so a search cannot ask for all 633 at once. */
export const DATASET_SEARCH_LIMIT = 25;
export const DATASET_SEARCH_LIMIT_MAX = 100;

interface CatalogRow {
  table_name: string;
  schema_name: string | null;
  column_count: number | string | null;
  semantic_types: Record<string, string> | null;
  status: string | null;
  last_scanned: Date | string | null;
}

const isoDay = (v: Date | string | null): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * Read the catalog. NEVER REJECTS — an unreadable catalog is `catalog_absent`, not an exception.
 *
 * Filing a tool request must not fail because a metadata table is unavailable; it must be REFUSED,
 * by name, with a sentence the person filing can act on. A throw here would surface as a 500 and
 * teach an intern that the form is broken rather than that the catalog is.
 *
 * Raw SQL rather than the `DatasetRegistry` model because this is a projection over three columns
 * of 633 rows, the result is typed at this call site, and the model would hydrate `relationships`
 * and `profile_summary` — two JSONB blobs this module has no use for — on every filing.
 */
export async function loadDatasetCatalog(sequelize: Sequelize): Promise<DatasetCatalog> {
  try {
    const rows = await sequelize.query<CatalogRow>(
      `SELECT table_name, schema_name, column_count, semantic_types, status, last_scanned
         FROM dataset_registry
        ORDER BY table_name`,
      { type: QueryTypes.SELECT },
    );

    const datasets: DatasetCatalogEntry[] = rows
      .filter((r) => typeof r.table_name === 'string' && r.table_name.trim().length > 0)
      .map((r) => {
        const semantic = r.semantic_types && typeof r.semantic_types === 'object'
          ? Object.keys(r.semantic_types)
          : [];
        const declared = Number(r.column_count);
        return {
          table_name: r.table_name.trim(),
          schema_name: (r.schema_name ?? 'public').trim() || 'public',
          // The declared count when there is one, else what the semantic map actually carries.
          // Reporting 0 columns for a scanned table would read as "empty table", which is a
          // different fact from "the count was never written".
          column_count: Number.isFinite(declared) && declared > 0 ? declared : semantic.length,
          columns: semantic.slice(0, MAX_COLUMNS_PER_ENTRY),
          status: (r.status ?? 'discovered').trim() || 'discovered',
          last_scanned: isoDay(r.last_scanned),
        };
      });

    return { datasets, catalog_absent: datasets.length === 0 };
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'dataset_catalog_unreadable',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return { datasets: [], catalog_absent: true };
  }
}

/**
 * The names a gate checks a request's `reads` against.
 *
 * Returned as a plain array rather than a `Set` to match the roster arguments
 * `toolRequestContract.ts` already takes, so the gate's signature stays one shape.
 */
export function datasetNames(catalog: DatasetCatalog): string[] {
  return catalog.datasets.map((d) => d.table_name);
}

export interface DatasetSearchResult {
  readonly datasets: ReadonlyArray<DatasetCatalogEntry>;
  readonly total_matched: number;
  readonly catalog_size: number;
  readonly catalog_absent: boolean;
}

/**
 * Rank the catalog for a picker query. PURE.
 *
 * Three tiers, best first, because a builder typing `lead` wants `leads` before
 * `agent_domain_lead_notes` and wants both before a table whose `lead_id` column happens to match:
 *
 *   1. the name IS the query, or starts with it
 *   2. the name contains it
 *   3. a COLUMN name contains it
 *
 * Ties break on name, so the same query always returns the same page in the same order — a picker
 * whose list reshuffles between keystrokes is one people stop trusting.
 *
 * An empty query returns the head of the catalog rather than nothing, so the picker opens with
 * something in it instead of a blank box the builder has to guess at.
 */
export function searchDatasetCatalog(args: {
  readonly catalog: DatasetCatalog;
  readonly q?: string | null;
  readonly limit?: number;
}): DatasetSearchResult {
  const { catalog } = args;
  const q = (typeof args.q === 'string' ? args.q : '').trim().toLowerCase();

  const requested = Number(args.limit);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), DATASET_SEARCH_LIMIT_MAX)
    : DATASET_SEARCH_LIMIT;

  const tier = (d: DatasetCatalogEntry): number => {
    const name = d.table_name.toLowerCase();
    if (name === q || name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (d.columns.some((c) => c.toLowerCase().includes(q))) return 2;
    return 3;
  };

  const matched = q
    ? catalog.datasets
      .map((d) => ({ d, t: tier(d) }))
      .filter((x) => x.t < 3)
      .sort((a, b) => (a.t - b.t) || a.d.table_name.localeCompare(b.d.table_name))
      .map((x) => x.d)
    : [...catalog.datasets].sort((a, b) => a.table_name.localeCompare(b.table_name));

  return {
    datasets: matched.slice(0, limit),
    total_matched: matched.length,
    catalog_size: catalog.datasets.length,
    catalog_absent: catalog.catalog_absent,
  };
}
