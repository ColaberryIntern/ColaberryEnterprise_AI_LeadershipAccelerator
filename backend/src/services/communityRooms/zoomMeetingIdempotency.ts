import * as zoomService from '../zoomService';

/**
 * The ORM is loaded LAZILY, inside each helper, never at module top.
 *
 * `meetingProvider.ts` imports this module, and a top-level `import { sequelize }`
 * made importing the provider construct a Sequelize instance — which threw at import
 * time in any test that had not mocked the database, taking the whole suite down
 * before a single test ran. The sibling route files already note this convention:
 * "the services lazy-load their models inside their functions, so these imports never
 * init the ORM." Same reason here.
 */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

/**
 * Makes Zoom meeting creation idempotent on a caller-supplied request id.
 *
 * Zoom has no idempotency key of its own, so this is ours. See
 * `db/ensureZoomRequestLedgerSchema.ts` for why the ledger row is written BEFORE the
 * API call rather than after.
 *
 * THE MARKER. Each create embeds `[req:<requestId>]` in the meeting's agenda. That is
 * the only durable thread back from a Zoom meeting to the request that made it, and it
 * is what lets a retry tell "Zoom never got my call" apart from "Zoom created it and
 * the response was lost" — two situations that look identical from the client and have
 * opposite correct responses.
 */

export interface IdempotentCreateInput {
  requestId: string;
  /** Defaults to `ZOOM_HOST_EMAIL`. Recorded on the ledger so a retry reconciles
   *  against the host the first attempt actually used. */
  hostEmail?: string;
  topic: string;
  agenda?: string;
  startDateTime: string;
  durationMinutes: number;
  timezone?: string;
}

export interface IdempotentCreateResult {
  meetingId: string;
  joinUrl: string | null;
  /** How the caller got here — surfaced so the outbox can log what actually happened. */
  outcome: 'created' | 'replayed' | 'reconciled';
}

/** The thread back from a Zoom meeting to the request that created it. */
export function requestMarker(requestId: string): string {
  return `[req:${requestId}]`;
}

function agendaWithMarker(agenda: string | undefined, requestId: string): string {
  const base = (agenda || '').trim();
  const marker = requestMarker(requestId);
  return base ? `${base}\n\n${marker}` : marker;
}

type LedgerRow = {
  request_id: string;
  state: string;
  meeting_id: string | null;
  join_url: string | null;
  attempts: number;
  host_email: string | null;
};

async function readLedger(requestId: string): Promise<LedgerRow | null> {
  const [rows] = await (await db()).query(
    `SELECT request_id, state, meeting_id, join_url, attempts, host_email
       FROM zoom_meeting_requests WHERE request_id = :rid LIMIT 1`,
    { replacements: { rid: requestId } },
  ) as [LedgerRow[], unknown];
  return rows?.[0] || null;
}

/**
 * Claims the request. Returns true if THIS caller owns the Zoom call.
 *
 * `ON CONFLICT DO NOTHING` makes the claim atomic: two workers racing the same booking
 * both attempt the insert, exactly one affects a row, and the loser falls through to
 * read the winner's state. A SELECT-then-INSERT would let both see "absent".
 */
async function claim(requestId: string, topic: string, hostEmail: string): Promise<boolean> {
  const [rows] = await (await db()).query(
    `INSERT INTO zoom_meeting_requests (request_id, state, topic, host_email)
       VALUES (:rid, 'pending', :topic, :host)
       ON CONFLICT (request_id) DO NOTHING
       RETURNING request_id`,
    // The host is written with the CLAIM, before Zoom is called — the same reason the
    // row itself is. A host recorded after a successful response only ever describes
    // the calls that already worked, which are the ones that never needed recording.
    { replacements: { rid: requestId, topic, host: hostEmail } },
  ) as [Array<{ request_id: string }>, unknown];
  return (rows?.length || 0) > 0;
}

async function markCreated(requestId: string, meetingId: string, joinUrl: string | null, reconciled = false): Promise<void> {
  await (await db()).query(
    `UPDATE zoom_meeting_requests
        SET state = 'created', meeting_id = :mid, join_url = :url,
            updated_at = NOW()${reconciled ? ', reconciled_at = NOW()' : ''}
      WHERE request_id = :rid`,
    { replacements: { rid: requestId, mid: meetingId, url: joinUrl } },
  );
}

async function noteFailure(requestId: string, message: string): Promise<void> {
  await (await db()).query(
    `UPDATE zoom_meeting_requests
        SET attempts = attempts + 1, last_error = :err, updated_at = NOW()
      WHERE request_id = :rid`,
    { replacements: { rid: requestId, err: String(message).slice(0, 500) } },
  );
}

/**
 * Looks for a meeting Zoom may already have created for this request.
 *
 * Called only when a prior attempt is 'pending' — i.e. we reached Zoom and never
 * learned the outcome. Matches on the agenda marker rather than on topic or time,
 * because two bookings can legitimately share both.
 *
 * Returns null when nothing matches, which is the honest answer for "the earlier call
 * never landed" — and the only case where creating a second meeting is correct.
 */
export async function findMeetingByRequestMarker(
  requestId: string,
  hostEmail?: string,
): Promise<{ meetingId: string; joinUrl: string | null } | null> {
  const marker = requestMarker(requestId);
  try {
    // The host the ORIGINAL attempt used, not today's default. Those differ as soon
    // as a second host exists, and asking the wrong one returns a confident, wrong
    // "not there".
    const meetings = await zoomService.listUpcomingMeetingsWithAgenda(hostEmail);
    const hit = meetings.find((m) => (m.agenda || '').includes(marker));
    return hit ? { meetingId: String(hit.id), joinUrl: hit.join_url ?? null } : null;
  } catch (err: any) {
    // A failed reconcile must NOT be read as "no meeting exists" — that is exactly the
    // inference that produces the duplicate this module exists to prevent. Re-throw so
    // the caller retries later with the ledger still 'pending'.
    throw Object.assign(new Error(`Zoom reconcile failed: ${err?.message}`), { error_class: 'ReconcileFailed' });
  }
}

export async function createMeetingIdempotent(input: IdempotentCreateInput): Promise<IdempotentCreateResult> {
  const { requestId } = input;
  if (!requestId) {
    // Refused rather than defaulted: a blank request id silently disables the whole
    // guarantee, and a caller that forgot one should find out immediately.
    throw Object.assign(new Error('requestId is required for idempotent meeting creation'), { error_class: 'ValidationError' });
  }

  const host = input.hostEmail || '';
  const iOwnIt = await claim(requestId, input.topic, host);

  if (!iOwnIt) {
    const prior = await readLedger(requestId);
    if (prior?.state === 'created' && prior.meeting_id) {
      return { meetingId: prior.meeting_id, joinUrl: prior.join_url, outcome: 'replayed' };
    }
    // 'pending': a previous attempt reached Zoom with an unknown outcome.
    // Reconcile against the host the FIRST attempt recorded. An empty value means a
    // row written before multi-host existed, which is the default host.
    const found = await findMeetingByRequestMarker(requestId, prior?.host_email || undefined);
    if (found) {
      await markCreated(requestId, found.meetingId, found.joinUrl, true);
      return { ...found, outcome: 'reconciled' };
    }
    // Genuinely absent — the earlier call never landed. Fall through and create.
  }

  try {
    const result = await zoomService.createMeeting({
      topic: input.topic,
      agenda: agendaWithMarker(input.agenda, requestId),
      startDateTime: input.startDateTime,
      durationMinutes: input.durationMinutes,
      timezone: input.timezone,
      hostEmail: input.hostEmail,
    });
    await markCreated(requestId, result.meetingId, result.joinUrl);
    return { meetingId: result.meetingId, joinUrl: result.joinUrl, outcome: 'created' };
  } catch (err: any) {
    // The row stays 'pending' on purpose. We do not know whether Zoom created it, and
    // marking 'failed' here would license the next retry to create a duplicate.
    await noteFailure(requestId, err?.message || 'unknown');
    throw err;
  }
}
