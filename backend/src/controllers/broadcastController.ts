import { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  producerCommandSchema, occurrenceIdParamSchema, playbackGrantSchema, playbackHeartbeatSchema,
} from '../schemas/broadcastSchema';
import {
  rejectUntrustedFields, resolveTelemetryConfig, type MeasuredAccessMode,
} from '../services/broadcast/broadcastTelemetryPolicy';
// The runtime list, from the module that also defines the column's CHECK constraint. One
// source of truth: a second array in the policy module would be a second place to forget.
import { ACCESS_MODES } from '../db/ensureBroadcastSchema';
import { recordPlaybackBeat, readLiveAudience } from '../services/broadcast/broadcastTelemetryService';
import { runProducerCommand } from '../services/broadcast/broadcastCommandService';
import { decideBroadcastAccess, resolveBroadcastAccess } from '../services/broadcast/broadcastEntitlement';
import { resolveRoomEligibility } from '../services/broadcast/broadcastRoomEligibility';
import { loadViewerAccessFacts, broadcastAccessDeps } from '../services/broadcast/broadcastAccessDeps';
import { projectDiscovery, DiscoveryEntry } from '../services/broadcast/broadcastDiscovery';
import { ACTIVE_DISCOVERY_STATES, findActiveOccurrences } from '../services/broadcast/broadcastActiveQuery';
import { resolvePollAfterMs } from '../services/broadcast/broadcastPollPolicy';
import { signPlayback, computeGrantExpiry } from '../services/broadcast/broadcastPlaybackGrant';
import { signLivePlayback, CloudflareStreamError } from '../services/broadcast/providers/cloudflareStreamProvider';
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

    // Entitlement inputs are all server-resolved, and as of this commit all of them are
    // actually resolved. Before it, `roomEligible` was the literal `false` and the three
    // paid-access facts were `null` — so every private occurrence denied its own cohort, and
    // `hasFullCurriculumAccess` was asked "is this person entitled?" with no enrollment and
    // answered no for everybody. Both errors denied rather than leaked, which is exactly why
    // nothing looked broken from outside.
    const viewer = {
      enrollmentId: req.participant!.sub,
      isAdmin: isStaff(req),
      roomEligible: await resolveRoomEligibility(occurrence.room_id, {
        enrollmentId: req.participant!.sub,
        cohortId: req.participant!.cohort_id ?? null,
        isAdmin: isStaff(req),
      }),
    };
    // THE FAIL-CLOSED WRAPPER, not the pure function. P2-04 shipped `resolveBroadcastAccess`
    // and nothing ever called it; an independent check pointed out that my own comments
    // described wiring that did not exist. It loads the facts itself and, crucially, turns a
    // loader rejection into a DENIAL rather than letting it propagate — which is the property
    // the pure function cannot have.
    //
    // The discovery endpoint below deliberately does NOT use it: that path judges N
    // occurrences against one viewer, so it loads the facts once and calls the pure function
    // per row. Using the wrapper there would re-read the enrollment, the cohort and the comp
    // list for every broadcast on screen.
    const decision = await resolveBroadcastAccess(
      {
        access_mode: occurrence.access_mode,
        editorial_state: occurrence.editorial_state,
        preview_seconds: occurrence.preview_seconds,
        content_started_at: occurrence.content_started_at,
      },
      viewer,
      broadcastAccessDeps,
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

    const bound = {
      contentStartedAtMs: occurrence.content_started_at?.getTime() ?? null,
      previewSeconds: occurrence.preview_seconds,
    };

    // THE PROVIDER BRANCH. Replay serves our own bytes through `/bm/`; live never touches this
    // server, so the url points at Cloudflare's edge instead. What does NOT change is WHEN
    // access ends: both branches take their expiry from `computeGrantExpiry`, so the preview
    // deadline is enforced by one piece of arithmetic rather than two that could drift.
    //
    // Every occurrence written before this commit has `provider` defaulted to 'zoom', so the
    // branch below is unreachable for all of them and the replay path is byte-identical.
    if (occurrence.provider === 'cloudflare') {
      const expiresAt = computeGrantExpiry(decision, bound, Date.now());
      if (expiresAt === null) {
        res.status(403).json({ error: 'NotEntitled', reason: 'preview_expired', offer_upgrade: true });
        return;
      }
      if (!occurrence.provider_session_id) {
        // Configured for Cloudflare but no live input bound yet. 503, not 404: the occurrence
        // exists and the viewer is entitled — the provider side is simply not ready, and
        // saying "not found" would send a producer looking for the wrong fault.
        res.status(503).json({ error: 'ProviderNotReady', reason: 'live_input_not_bound' });
        return;
      }
      try {
        const live = signLivePlayback(occurrence.provider_session_id, expiresAt);
        res.json({
          url: live.url,
          expires_at: live.expiresAt,
          ttl_seconds: live.ttlSeconds,
          // The client must NOT infer liveness from the url shape. A live manifest restarts
          // its timeline on reload, so the player has to know not to restore the viewer's
          // position on renewal — doing so replays the last stretch, every renewal, which is
          // what the 15 Oct 2026 airing found. The server is the only honest authority here.
          is_live: occurrence.editorial_state === 'live',
          // Whether this viewer may END the broadcast. Server-decided from the same staff
          // context the producer commands use, for the same reason as is_live: the client
          // must never infer a capability it could simply assert. `is_producer` is on the
          // forbidden-client-supplied list — that governs what a client may SEND, and this is
          // the server answering, which is the only trustworthy direction.
          is_producer: isStaff(req),
          // The occurrence version, so a producer control can issue a version-guarded command
          // without a second round trip. Not a secret: the command route already REQUIRES the
          // caller to supply it, so the design always intended the client to hold it. A stale
          // one is the guard working - it answers 409 and the client re-grants.
          version: occurrence.version,
          grant: decision.grant,
          preview_seconds_remaining: decision.previewSecondsRemaining ?? null,
        });
      } catch (err) {
        if (err instanceof CloudflareStreamError) {
          // Fail closed and say so. There is deliberately no fallback to the replay path here:
          // serving a different asset than the one asked for is how a viewer ends up watching
          // last week's class and nobody notices.
          console.error(JSON.stringify({
            timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
            event: 'broadcast_live_grant_failed', outcome: 'failure', error_class: err.error_class,
            context: { occurrence_id: occurrence.id },
          }));
          res.status(503).json({ error: 'ProviderNotReady', reason: 'live_playback_unavailable' });
          return;
        }
        throw err;
      }
      return;
    }

    const signed = signPlayback(
      `broadcast/${occurrence.id}/${asset}`,
      decision,
      bound,
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
      // Same field on the replay path, and normally false: a replay is served once the
      // occurrence has ended. Sent explicitly rather than omitted so the two branches answer
      // the same question in the same shape.
      is_live: occurrence.editorial_state === 'live',
      // Same field on the replay path, and normally false for a different reason: a replay has
      // no broadcast left to end. Sent explicitly so both branches answer the same question.
      is_producer: isStaff(req),
      version: occurrence.version,
      grant: decision.grant,
      preview_seconds_remaining: decision.previewSecondsRemaining ?? null,
    });
  } catch (err) {
    respondError(res, err, 'broadcast_playback_grant_failed');
  }
}

/**
 * POST /api/portal/broadcasts/:id/heartbeat — one playback beat from one tab.
 *
 * THE CLIENT SENDS WHAT ITS PLAYER IS DOING. NOTHING ELSE.
 *
 * Identity, staff status and access mode are all resolved here, from the JWT and the
 * occurrence row. A body that tries to supply any of them is refused with the offending
 * fields NAMED, because a silently dropped field is indistinguishable from an accepted one:
 * a client that believes it is reporting paid viewers would go on believing it, and the
 * number it inflates would be trusted.
 *
 * ANSWERS 204 EVEN WHEN THE WRITE FAILS. Telemetry must never break the thing it measures.
 * A viewer watching successfully must not see an error because a metrics row did not persist,
 * and a client must not retry into a database that is already struggling. The failure is
 * logged by the service with a stable error_class; it is not the viewer's problem.
 */
export async function postPlaybackHeartbeat(req: Request, res: Response): Promise<void> {
  try {
    const { id } = occurrenceIdParamSchema.parse(req.params);

    // Named refusal FIRST, before the schema's generic unknown-key error, so the caller is
    // told precisely which claim was rejected rather than merely that something was wrong.
    const offending = rejectUntrustedFields(req.body);
    if (offending.length > 0) {
      res.status(400).json({
        error: 'UntrustedFields',
        reason: 'client_supplied_identity_or_counts',
        fields: offending,
      });
      return;
    }

    const body = playbackHeartbeatSchema.parse(req.body ?? {});

    const occurrence = await BroadcastOccurrence.findByPk(id);
    if (!occurrence) {
      res.status(404).json({ error: 'NotFoundError' });
      return;
    }

    const cfg = resolveTelemetryConfig(process.env as unknown as Record<string, unknown>);
    await recordPlaybackBeat(
      { occurrenceId: occurrence.id, sessionId: body.session_id, state: body.state, intent: body.intent },
      {
        // Every one of these is server-decided. None can be influenced by the body above.
        enrollmentId: req.participant!.sub,
        isStaff: isStaff(req),
        isTest: process.env.BROADCAST_TELEMETRY_TEST_MODE === 'true',
        // Checked, not cast. An unrecognised mode records as null rather than appearing in
        // the counts under a label nobody defined.
        accessMode: (ACCESS_MODES as readonly string[]).includes(occurrence.access_mode)
          ? (occurrence.access_mode as MeasuredAccessMode)
          : null,
      },
      cfg,
      Date.now(),
    );

    res.status(204).end();
  } catch (err) {
    respondError(res, err, 'broadcast_heartbeat_failed');
  }
}

/**
 * GET /api/portal/broadcasts/:id/audience — who is watching, for a producer.
 *
 * ZERO AND "WE DO NOT KNOW" ARE DIFFERENT ANSWERS, AND THIS IS WHERE THEY STAY DIFFERENT.
 *
 * The metrics dictionary calls a fabricated zero a defect rather than a cosmetic issue, and
 * it is right: "nobody watched" is a verdict on the broadcast, while "collection is down" is
 * a verdict on us. Rendering the second as the first would have a producer stop a class that
 * people were actually watching.
 *
 * So a collection failure answers 503 and the body carries NO COUNT FIELD AT ALL. Not zero,
 * not null — absent. A client cannot render a number that is not there, which is a stronger
 * guarantee than asking it to check a flag first.
 */
export async function getLiveAudience(req: Request, res: Response): Promise<void> {
  const { id } = occurrenceIdParamSchema.parse(req.params);

  // A viewer count is producer information: it says how a class is performing while it airs.
  if (!isStaff(req)) {
    res.status(403).json({ error: 'Forbidden', reason: 'not_a_producer' });
    return;
  }

  const cfg = resolveTelemetryConfig(process.env as unknown as Record<string, unknown>);
  let audience;
  try {
    audience = await readLiveAudience(id, cfg, Date.now());
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
      event: 'broadcast_audience_unavailable', outcome: 'failure',
      error_class: (err as Error)?.name ?? 'UnexpectedError',
      context: { occurrence_id: id },
    }));
    res.status(503).json({
      error: 'MeasurementUnavailable',
      available: false,
      reason: 'collection_unavailable',
    });
    return;
  }

  res.json({
    available: true,
    watching_now: audience.watchingNow,
    deliberate: audience.deliberate,
    auto: audience.auto,
    by_mode: audience.byMode,
  });
}

/**
 * GET /api/portal/broadcasts/active — what this viewer may know is airing.
 *
 * TWO DELIBERATE SHAPES.
 *
 * The viewer's paid-access facts are loaded ONCE and then applied to every occurrence through
 * the pure decision function. Calling `resolveBroadcastAccess` per row would re-read the
 * enrollment, the cohort and the comp list for every broadcast on screen.
 *
 * A resolution failure answers 503, NOT an empty list. "Nothing is airing" and "we could not
 * work out what is airing" are different facts, and reporting the second as the first is the
 * same mistake as a dashboard reporting a fabricated zero during its own outage. The client
 * shows no badge either way; only one of the two is honest about why.
 */
export async function getActiveBroadcasts(req: Request, res: Response): Promise<void> {
  const enrollmentId = req.participant!.sub;
  try {
    const occurrences = await findActiveOccurrences();
    const facts = await loadViewerAccessFacts(enrollmentId);
    const ctx = {
      enrollmentId,
      cohortId: req.participant!.cohort_id ?? null,
      isAdmin: isStaff(req),
    };
    const nowMs = Date.now();

    const entries: DiscoveryEntry[] = [];
    for (const occurrence of occurrences) {
      // Sequential on purpose: a partial UNIQUE index permits one airing per room, so this is
      // a handful of rows and a burst of parallel membership reads buys only contention.
      // eslint-disable-next-line no-await-in-loop
      const roomEligible = await resolveRoomEligibility(occurrence.room_id, ctx);
      entries.push({
        occurrence,
        roomEligible,
        decision: decideBroadcastAccess(
          {
            access_mode: occurrence.access_mode,
            editorial_state: occurrence.editorial_state,
            preview_seconds: occurrence.preview_seconds,
            content_started_at: occurrence.content_started_at,
          },
          { enrollmentId, isAdmin: ctx.isAdmin, roomEligible },
          facts.enrollment, facts.cohort, facts.roleInfo,
          nowMs,
        ),
      });
    }

    res.json({
      states: ACTIVE_DISCOVERY_STATES,
      broadcasts: projectDiscovery(entries),
      // The SERVER decides the cadence, so it can be slowed during an incident by an env
      // change rather than a frontend deploy. A client that picks its own interval cannot
      // be turned down when it matters.
      poll_after_ms: resolvePollAfterMs(process.env.BROADCAST_DISCOVERY_POLL_MS),
    });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
      event: 'broadcast_discovery_failed', outcome: 'failure',
      error_class: (err as Error)?.name ?? 'UnexpectedError',
      context: { error_name: (err as Error)?.name ?? 'unknown' },
    }));
    res.status(503).json({ error: 'DiscoveryUnavailable' });
  }
}
