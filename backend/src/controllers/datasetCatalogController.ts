import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import {
  DATASET_SEARCH_LIMIT,
  DATASET_SEARCH_LIMIT_MAX,
  loadDatasetCatalog,
  searchDatasetCatalog,
} from '../services/agentDomain/datasetCatalog';
import { loadDatasetDetail } from '../services/agentDomain/datasetDetail';

/**
 * The dataset picker's read surface — what a builder filing a tool request chooses from.
 *
 * One route, one verb, no writes. It exists because `toolRequestContract.ts` now refuses a
 * production tool request whose `read_datasets` names anything absent from `dataset_registry`, and
 * a refusal a person cannot act on is a dead end. This is where they get the list.
 *
 * ## `catalog_absent` is in the BODY, and the status is still 200
 *
 * An unreadable catalog returns `{ datasets: [], catalog_absent: true }` with a 200 rather than a
 * 503. The reason is what the caller does next: a picker that receives an empty list with a 200
 * and no flag renders "no matches", which is a different fact from "we could not read the
 * catalog", and the builder would conclude their search term was wrong and retype it.
 *
 * `total_matched` is returned beside the page for the same reason. A picker showing 25 of 148
 * matches has to be able to say so, or the builder assumes 25 is all there is and never refines
 * the query.
 *
 * ## What this never returns
 *
 * No row counts and no sampled values — `datasetCatalog.ts` carries the reasoning. The response is
 * table names, column names and scan metadata: enough to choose a dataset, and nothing that
 * amounts to reading one.
 */

const QuerySchema = z.object({
  q: z.string().trim().max(200, 'A search term can be at most 200 characters.').optional(),
  // Coerced, because a query string is always text. `.strict()` on the object so `?limitt=5` is a
  // 400 rather than a silently ignored intent — the same house rule the tool-request schema cites.
  limit: z.coerce.number()
    .int('A limit has to be a whole number.')
    .positive('A limit has to be greater than zero.')
    .max(DATASET_SEARCH_LIMIT_MAX, `A limit can be at most ${DATASET_SEARCH_LIMIT_MAX}.`)
    .optional(),
}).strict();

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'dataset_catalog_search',
    ...fields,
  }));
}

export async function handleSearchDatasetCatalog(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const actorEmail = (req as any).admin?.email ?? '';

  let query: z.infer<typeof QuerySchema>;
  try {
    query = QuerySchema.parse(req.query);
  } catch (err: unknown) {
    log({
      level: 'warn',
      outcome: 'failure',
      error_class: 'ValidationError',
      duration_ms: Date.now() - started,
      actor_email: actorEmail,
    });
    res.status(400).json({
      error: 'Invalid input',
      issues: err instanceof z.ZodError ? err.issues : [],
    });
    return;
  }

  // `loadDatasetCatalog` cannot reject — it reports `catalog_absent` and logs the error class
  // itself — so there is no catch here that would be reachable. A try block around it would be a
  // branch no test could enter, which is worse than its absence.
  const catalog = await loadDatasetCatalog(sequelize);
  const result = searchDatasetCatalog({
    catalog,
    q: query.q ?? null,
    limit: query.limit ?? DATASET_SEARCH_LIMIT,
  });

  log({
    level: result.catalog_absent ? 'warn' : 'info',
    outcome: result.catalog_absent ? 'partial' : 'success',
    duration_ms: Date.now() - started,
    actor_email: actorEmail,
    context: {
      q: query.q ?? null,
      returned: result.datasets.length,
      total_matched: result.total_matched,
      catalog_size: result.catalog_size,
      catalog_absent: result.catalog_absent,
    },
  });

  res.json(result);
}

/**
 * GET one dataset's shape — the drill-in behind a click in the picker.
 *
 * Ali, 17 Nov 2026: *"If we are picking datasets we need to be able to see the data when we click
 * on it."* `datasetDetail.ts` carries the full reasoning for where the line falls; the short
 * version is that this returns the SHAPE of a table and never a row of it.
 *
 * ## A name that is not in the catalog is a 404, not an empty detail
 *
 * The list endpoint above turns an unreadable catalog into a flag rather than a status, because a
 * picker that renders "no matches" would send a builder off to retype a search term that was
 * fine. A drill-in is the other case: the caller named one table, and "that table is not in the
 * catalog" is specific, actionable and the thing they need to read. Returning a hollow detail
 * object with nulls in it would be the same mistake as an unscanned row count rendering as zero.
 *
 * A table name that cannot be read for any other reason also arrives here as a 404, because
 * `loadDatasetDetail` does not reject. That collapse is deliberate and the distinction is kept
 * where it belongs: the service logs `dataset_detail_unreadable` with the error class.
 */
export async function handleGetDatasetDetail(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const actorEmail = (req as any).admin?.email ?? '';
  const raw = String(req.params.tableName ?? '').trim();

  // Bounded and checked before it reaches the query. The query is parameterised, so this is not
  // the injection defence; it is so that a 400 says "that is not a table name" instead of a
  // lookup silently finding nothing and reporting a missing table.
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9_.]+$/.test(raw)) {
    log({
      level: 'warn',
      event: 'dataset_detail',
      outcome: 'failure',
      error_class: 'ValidationError',
      duration_ms: Date.now() - started,
      actor_email: actorEmail,
    });
    res.status(400).json({ error: 'That is not a table name.', error_class: 'ValidationError' });
    return;
  }

  const detail = await loadDatasetDetail(sequelize, raw);
  if (!detail) {
    log({
      level: 'info',
      event: 'dataset_detail',
      outcome: 'failure',
      error_class: 'DatasetNotCatalogued',
      duration_ms: Date.now() - started,
      actor_email: actorEmail,
      context: { table_name: raw },
    });
    res.status(404).json({
      error: `${raw} is not in the dataset catalog, so there is nothing recorded about its shape.`,
      error_class: 'DatasetNotCatalogued',
    });
    return;
  }

  log({
    level: 'info',
    event: 'dataset_detail',
    outcome: 'success',
    duration_ms: Date.now() - started,
    actor_email: actorEmail,
    // Counts, never contents. This log line is the one place a careless addition would persist a
    // value, so it carries numbers only.
    context: {
      table_name: detail.table_name,
      columns_returned: detail.columns.length,
      column_count: detail.column_count,
      relationships: detail.relationships.length,
      columns_incomplete: detail.columns_incomplete,
    },
  });

  res.json({ dataset: detail });
}
