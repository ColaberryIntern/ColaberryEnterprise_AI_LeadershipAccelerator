import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { recordContactActivity, type ContactActivityResult } from '../services/explorerGrowth/explorerContactActivityService';
import { contactActivityBodySchema } from '../schemas/explorerContactActivitySchema';

/**
 * POST /api/v1/explorer-growth/contact-activity - the return leg of the Explorer call queue.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `GET /api/v1/explorer-growth/outreach` hands Cora the ranked list of Explorers worth calling,
 * and Cora tags them in GoHighLevel for Rose to work. Until this route, that was a one-way
 * write: nothing came back, so `explorer_journey_profiles.last_contacted_at` stayed empty, the
 * seven-day suppression in `reachOutCandidate` had no input, and the same people would be
 * tagged again every night for ever. Measured on production 2026-11-17: the column was set on
 * 0 of 1080 profiles. Kes Delele agreed the same day to push connected-call outcomes back here.
 *
 * This route is the smaller half of a pair, and the pair is the point: the feed is only safe to
 * act on once the outcomes return.
 *
 * ── CONNECTED CALLS ONLY, WHICH IS A CONTRACT NOT A FILTER ──────────────────
 *
 * The caller sends a row only when Rose actually reached the person. This route cannot verify
 * that and does not try. It matters because the column means CONTACTED, not attempted: a
 * no-answer must leave someone in the pool so they are called again, and sending no-answers
 * would suppress people nobody has spoken to. The rule lives with the sender; it is written
 * here so the next person to read this route knows the payload is not "calls".
 *
 * ── WHAT COMES BACK, AND WHY IT IS NOT JUST 204 ─────────────────────────────
 *
 * The response carries counts and the contact ids that matched nothing. A fire-and-forget 204
 * would have made the predictable failure silent: Cora sends a file whose ids do not resolve,
 * we write nothing, and both sides believe the integration is running. The counts make a bad
 * day visible in the same second to the system that can fix it.
 *
 * ── SCOPED TO CORA ALONE ────────────────────────────────────────────────────
 *
 * `requireServiceClient('cora')` on the route, not here, for the reason every other v1 route
 * does it there: a guard on the router cannot be forgotten by a handler. It does NOT accept
 * `enterprise_crm`; that credential is held by the training site and Repo2Reputation, neither
 * of which has any business writing contact history.
 *
 * Note this makes `cora` a WRITER for the first time. It was provisioned 2026-11-05 as a
 * read-only client and `serviceAuthMiddleware` said so in as many words; that comment is
 * updated in the same change as this file, because a stale security note is worse than none.
 * The blast radius of a leaked cora token is now: read the ranked queue, and move
 * `last_contacted_at` forward. It cannot move one backwards (the write is monotonic), cannot
 * clear one, and cannot reach any other column or table.
 */

/** The response body. Counts only, plus the caller's own ids; no learner data crosses the boundary. */
export interface V1ContactActivityResponse extends ContactActivityResult {
  source: string;
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'v1-contact-activity', event, outcome, ...context }) + '\n',
  );
}

export async function postContactActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
  const correlation_id = crypto.randomUUID();
  const start = Date.now();

  try {
    const { source, rows } = contactActivityBodySchema.parse(req.body);
    const result = await recordContactActivity(rows);

    /**
     * `partial` is a real outcome here, not a tidier word for success.
     *
     * A push where nothing matched, or where every timestamp was refused as future-dated, is a
     * broken integration that answered 200. Logging it as `success` would hide it from exactly
     * the search someone runs when the queue stops draining. The status stays 200 because the
     * request was well formed and we did what it asked; the log tells the truth about the
     * result.
     *
     * A replay is NOT partial: everything matched and nothing needed moving, which is the
     * monotonic write working as designed.
     */
    const outcome = result.matched === 0 || result.rejected_future === result.received ? 'partial' : 'success';

    // Counts and the source only. No ghl_contact_id, no enrollment id, no learner data in logs -
    // the response carries the unmatched ids to the one system entitled to them, and the log does
    // not need them to show the shape of a bad day.
    log('info', 'contact_activity_ingest', outcome, {
      correlation_id,
      source,
      received: result.received,
      matched: result.matched,
      unmatched: result.unmatched,
      written: result.written,
      unchanged: result.unchanged,
      rejected_future: result.rejected_future,
      duration_ms: Date.now() - start,
    });

    res.status(200).json({ source, ...result } satisfies V1ContactActivityResponse);
  } catch (err) {
    if (err instanceof ZodError) {
      log('warn', 'contact_activity_ingest', 'failure', { correlation_id, error_class: 'ValidationError', issues: err.issues.length });
      res.status(400).json({ error: 'Invalid payload', details: err.issues.map((i) => i.message) });
      return;
    }
    log('error', 'contact_activity_ingest', 'failure', {
      correlation_id,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
}
