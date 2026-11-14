import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import {
  DATASET_SEARCH_LIMIT,
  DATASET_SEARCH_LIMIT_MAX,
  loadDatasetCatalog,
  searchDatasetCatalog,
} from '../services/agentDomain/datasetCatalog';

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
