import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { producerCommandSchema, occurrenceIdParamSchema, playbackGrantSchema } from '../schemas/broadcastSchema';
import { runProducerCommand } from '../services/broadcast/broadcastCommandService';
import { decideBroadcastAccess } from '../services/broadcast/broadcastEntitlement';
import { signPlayback } from '../services/broadcast/broadcastPlaybackGrant';
import BroadcastOccurrence from '../models/BroadcastOccurrence';

/**
 * Broadcast HTTP surface.
 *
 * Identity comes from the JWT and nowhere else. `req.participant.sub` is the only source of
 * who the caller is; nothing in any schema can override it. Read-only impersonation is
 * already blocked centrally for non-safe methods at participantAuth.ts:53, so there is
 * deliberately no second read_only check here — a duplicated guard is one that can drift
 * out of agreement with the real one.
 */

function respondZodError(res: Response, error: ZodError): void {
  res.status(400).json({
    error: 'Validation failed',
    details: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
  });
}

/** Tagged service errors already carry the right status; anything else is a 500. */
function respondError(res: Response, err: any, event: string): void {
  if (err instanceof ZodError) return respondZodError(res, err);
  const status = Number(err?.status) || 500;
  const error_class = err?.error_class || 'UnexpectedError';
  if (status >= 500) {
    // The raw message is deliberately NOT logged. A driver error can carry a connection
    // string, and stdout is captured by the container runtime — so the response being clean
    // is not enough on its own. error_class plus the event name is what triage actually
    // needs; the stack is available from the thrown object at the call site if more is
    // required. (Sibling controllers log err.message here; this one does not, rather than
    // propagate the pattern.)
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
      event, outcome: 'failure', error_class, context: { error_name: err?.name ?? 'unknown' },
    }));
  }
  // Never echo err.message on a 5xx: it can carry query fragments or provider detail.
  res.status(status).json({ error: status >= 500 ? 'Internal error' : (err?.reason || err?.message || error_class) });
}

function isStaff(req: Request): boolean {
  return Boolean((req.participant as any)?.isStaff);
}

/**
 * POST /api/portal/broadcasts/:id/command — a producer command.
 *
 * Producer rights are resolved from staff context, never from the body. The service
 * re-checks it too (applyProducerCommand takes isProducer), so the route is defence in
 * depth rather than the only gate.
 */
export async function postProducerCommand(req: Request, res: Response): Promise<void> {
  try {
    const { id } = occurrenceIdParamSchema.parse(req.params);
    const body = producerCommandSchema.parse(req.body ?? {});

    const result = await runProducerCommand({
      occurrenceId: id,
      command: body.command,
      expectedVersion: body.expected_version,
      isProducer: isStaff(req),
    });

    if (!result.ok) {
      res.status(result.status || 409).json({ error: result.error_class, reason: result.reason });
      return;
    }
    res.json({
      ok: true,
      noop: result.noop === true,
      occurrence: {
        id: result.occurrence!.id,
        editorial_state: result.occurrence!.editorial_state,
        provider_health: result.occurrence!.provider_health,
        version: result.occurrence!.version,
        content_started_at: result.occurrence!.content_started_at,
      },
    });
  } catch (err) {
    respondError(res, err, 'broadcast_command_failed');
  }
}

/**
 * POST /api/portal/broadcasts/:id/playback — mint a signed, expiring media URL.
 *
 * The entitlement decision and the grant are made here together so a caller cannot obtain
 * one without the other. A denied viewer receives 403 and NO url field — not a url that
 * happens to fail later, which is how an "unlisted link" leaks.
 */
export async function postPlaybackGrant(req: Request, res: Response): Promise<void> {
  try {
    const { id } = occurrenceIdParamSchema.parse(req.params);
    const { asset } = playbackGrantSchema.parse(req.body ?? {});

    const occurrence = await BroadcastOccurrence.findByPk(id);
    if (!occurrence) {
      res.status(404).json({ error: 'NotFoundError' });
      return;
    }

    // Entitlement inputs are all server-resolved. roomEligible is wired in P2-07 when the
    // occurrence-to-room projection lands; until then a private occurrence denies, which is
    // the safe direction for an unfinished dependency.
    const decision = decideBroadcastAccess(
      {
        access_mode: occurrence.access_mode,
        editorial_state: occurrence.editorial_state,
        preview_seconds: occurrence.preview_seconds,
        content_started_at: occurrence.content_started_at,
      },
      { enrollmentId: req.participant!.sub, isAdmin: isStaff(req), roomEligible: false },
      null, null, null,
      Date.now(),
    );

    if (decision.grant === 'denied') {
      res.status(403).json({
        error: 'NotEntitled',
        reason: decision.reason,
        offer_upgrade: decision.offerUpgrade === true,
        preview_seconds_remaining: decision.previewSecondsRemaining ?? null,
      });
      return;
    }

    const signed = signPlayback(
      `broadcast/${occurrence.id}/${asset}`,
      decision,
      { contentStartedAtMs: occurrence.content_started_at?.getTime() ?? null, previewSeconds: occurrence.preview_seconds },
      // Empty base => a RELATIVE url (`/bm/...`). Deliberate: the player runs in the portal
      // on the same origin as this API, so a relative url is correct and cannot drift out of
      // sync with host config. `env.publicAppUrl` exists if an absolute one is ever needed,
      // but this repo has a documented history of the public host not being the obvious one,
      // and a signed media url pointing at the wrong origin fails in a confusing way.
      '',
    );

    if (!signed) {
      // computeGrantExpiry refused even though the decision allowed — the window closed
      // between the two. Deny rather than fall back to anything long-lived.
      res.status(403).json({ error: 'NotEntitled', reason: 'preview_expired', offer_upgrade: true });
      return;
    }

    res.json({
      url: signed.url,
      expires_at: signed.expiresAt,
      ttl_seconds: signed.ttlSeconds,
      grant: decision.grant,
      preview_seconds_remaining: decision.previewSecondsRemaining ?? null,
    });
  } catch (err) {
    respondError(res, err, 'broadcast_playback_grant_failed');
  }
}
