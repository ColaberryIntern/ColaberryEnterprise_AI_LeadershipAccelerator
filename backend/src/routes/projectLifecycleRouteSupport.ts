/**
 * Shared plumbing for the project-lifecycle admin routes.
 *
 * Extracted when `projectLifecycleRoutes.ts` reached 480 lines — 20 short of CLAUDE.md's hard
 * 500-line ceiling, with another route still to come. Extracting the plumbing rather than
 * splitting the handlers keeps every lifecycle route in one file, which is where a reader looks
 * for them, and leaves room for the next one.
 *
 * It lives in `src/routes/` rather than `src/routes/admin/` because `portalRouteHelpers.ts`
 * already established that as the home for shared route helpers — NOT to avoid the route-auth
 * lint. That lint does a non-recursive read of `routes/admin` and requires a guard name in every
 * file it finds, so a guard-free helper module dropped in there would fail it, and burying it in
 * a subdirectory to slip past a non-recursive readdir would be loosening a tripwire that exists
 * because an admin route once shipped unguarded.
 *
 * Nothing here is lifecycle-specific except the two constants, and nothing here imports a model:
 * `redactPayload` reaches for `piiRedaction` lazily so this module stays inert at load.
 */
import type { Request, Response } from 'express';

export const SECTION = 'program';
export const PREFIX = '/api/admin/project-lifecycle';

/** One structured line per request outcome. JSON to stdout, per the Observability Framework. */
export function log(event: string, correlationId: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'backend',
    event,
    correlation_id: correlationId,
    outcome,
    ...(context.error_class ? { error_class: context.error_class } : {}),
    context,
  }));
}

/**
 * Redact a PAYLOAD, never a whole log line.
 *
 * `redactForLogs` applied to an entire line mangles UUIDs — it rewrites anything that looks like
 * an identifier — so correlation ids and project ids become unusable for tracing exactly when a
 * trace is needed. Applied to the free-text fields only, it masks what it should.
 */
export async function redactPayload(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { redactForLogs } = await import('../utils/piiRedaction');
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = typeof v === 'string' ? redactForLogs(v) : v;
  }
  return out;
}

export function correlationOf(req: Request): string {
  return String(req.header('X-Correlation-ID') ?? (req as any).correlationId ?? `plc-${Date.now()}`);
}

/** The authenticated admin. Never read from a request body — that is a spoofable approver. */
export function adminOf(req: Request): { id?: string; email?: string; role?: string } | undefined {
  return (req as any).admin;
}

/** The explicit disabled answer. Shared so no route can accidentally return a soft success. */
export function disabled(res: Response): void {
  res.status(409).json({
    lifecycleDisabled: true,
    error: 'Project lifecycle enforcement is not enabled in this environment.',
    remedy: 'Set ENABLE_PROJECT_LIFECYCLE=true to enable it.',
  });
}
