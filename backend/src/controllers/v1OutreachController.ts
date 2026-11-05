import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { getOutreach } from '../services/explorerGrowth/explorerCampusService';
import { outreachQuerySchema } from '../schemas/explorerGrowthSchema';

/**
 * GET /api/v1/explorer-growth/outreach — the ranked call queue, for Cora.
 *
 * WHY THIS EXISTS. Rose calls Colaberry Explorer leads with no list to work from. The ranking
 * that says who is worth calling lives here; the call outcomes live in Cora. Cora's nightly job
 * tags contacts in GoHighLevel from this feed, so one of the two halves has to cross a boundary
 * and this is it.
 *
 * WHY IT IS NOT JUST THE ADMIN ROUTE. `/api/admin/explorer-growth/outreach` is guarded by
 * `requireAdmin`, which verifies a session JWT with a four-hour expiry. A scheduled job in
 * another system cannot hold one. Measured against production on 2026-11-03: a static bearer
 * there returns `Invalid or expired token`, while `/api/v1/enrollments/lookup` returns
 * `Invalid service token` for the same bearer. Two different middlewares; no credential makes
 * the admin path work for a machine. Hence a v1 sibling with the service-token guard the other
 * machine-to-machine routes already use.
 *
 * ── THE PAYLOAD IS AN ALLOWLIST, AND THAT IS THE SECURITY DECISION ──────────
 *
 * The admin payload carries `email` and `name`. This one does not. Those are the only personal
 * data in the row, and the consumer does not need them: Cora joins on `ghl_url`, which carries
 * the GoHighLevel contact id and the sub-account it lives in, both of which Cora already holds.
 * Sending learner names and addresses across the boundary would widen the blast radius of a
 * leaked static token for no functional gain.
 *
 * It is an ALLOWLIST rather than an `Omit<>` or a delete, and that distinction is the whole
 * point. A denylist protects the fields somebody remembered; the next person to add a column to
 * the ranking would export it to an external system by default, and nothing would say so. With
 * an allowlist a new field is invisible here until someone adds it deliberately, and a test
 * asserts the emitted keys are exactly this list, so adding one without deciding fails the
 * build.
 *
 * ── WHAT THIS CANNOT DO ─────────────────────────────────────────────────────
 *
 * It is a GET over `getOutreach`, which is two SELECTs and a pure ranking function. It writes
 * nothing, sends nothing, and holds no state. The service token is checked by
 * `requireServiceToken` on the route, not here, for the same reason every other v1 route does
 * it there: a guard on the router cannot be forgotten by a handler.
 */

/**
 * Exactly what crosses the boundary. Order is the payload's documented order.
 *
 * `email` and `name` are absent BY CONSTRUCTION, not by removal.
 */
export const V1_OUTREACH_FIELDS = [
  'enrollment_id',
  'primary_state',
  'overlays',
  'e_score',
  'i_score',
  'cards',
  'rsvps',
  'calls',
  'next_call',
  'tour_furthest',
  'tour_total',
  'tour_finished',
  'last_seen',
  'last_contacted_at',
  'score',
  'reasons',
  'lead_id',
  'ghl_url',
] as const;

export type V1OutreachField = (typeof V1_OUTREACH_FIELDS)[number];
export type V1OutreachRow = Record<V1OutreachField, unknown>;

export interface V1OutreachResponse {
  view: string;
  tracked_since: string;
  /** How many rows the ranking returned, so a caller can tell "none today" from "page empty". */
  count: number;
  rows: V1OutreachRow[];
}

/** Pick the allowlisted fields, and only those. */
export function toPublicRow(row: Record<string, unknown>): V1OutreachRow {
  const out = {} as V1OutreachRow;
  for (const key of V1_OUTREACH_FIELDS) out[key] = row[key] ?? null;
  return out;
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-outreach-feed', event, outcome, ...context }) + '\n',
  );
}

export async function getOutreachFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();

  try {
    // The SAME schema the admin route uses, imported rather than restated, so the two surfaces
    // cannot drift on the 200-row cap or on rejecting an unknown parameter.
    const { view, limit } = outreachQuerySchema.parse(req.query);
    const result = await getOutreach(view, limit);
    const rows = result.rows.map((r) => toPublicRow(r as unknown as Record<string, unknown>));

    // `joinable` is logged because a row with no ghl_url is one the consumer must skip, and a
    // sudden drop in that ratio is the signal that lead linkage has broken upstream.
    const joinable = rows.filter((r) => r.ghl_url !== null).length;
    log('info', 'outreach_feed', 'success', {
      correlation_id, view, limit, rows: rows.length, joinable, duration_ms: Date.now() - start,
    });

    res.status(200).json({
      view: result.view, tracked_since: result.tracked_since, count: rows.length, rows,
    } satisfies V1OutreachResponse);
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'outreach_feed', 'failure', { correlation_id, error_class: 'ValidationError', issues: err.issues.length });
      res.status(400).json({ error: 'Invalid query', details: err.issues.map((i) => i.message) });
      return;
    }
    log('error', 'outreach_feed', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
}
