import portalApi from '../utils/portalApi';

/**
 * How many phones are in the room, and how many of them said they are stuck (D8).
 *
 * WHY THIS IS NOT THE AUDIENCE ROUTE. `readLiveAudience` counts remote viewers on the
 * broadcast, keyed on the OCCURRENCE. This counts the people who scanned the code and are
 * following along in the room, keyed on the SESSION. Different route, different key, different
 * limiter, and either can fail while the other answers - which is why the header shows two
 * chips rather than one sum. A producer told "14 watching" when 14 are remote and 30 are in the
 * room in front of them has been told something false about the room.
 *
 * Nothing new on the server. `GET /api/portal/sessions/:id/live-state` has existed for the
 * instructor deck since the pulse feature shipped, and is already reachable with a kit token
 * scoped to the session OR an admin JWT, which is what a producer holds. It returns more than
 * is wanted here - chat messages, poll tallies, a presence ticker - and this narrows it to the
 * two counts rather than handing a component a payload it has no business reading.
 *
 * ## The outcome shape, matching `readLiveAudience` deliberately
 *
 * `ok` is a measurement, including a measurement of zero. `unknown` is "nobody is measuring",
 * which must never be rendered as a digit. `forbidden` means this viewer is not entitled and
 * the chips should vanish rather than nag. `failed` is this tab not hearing back, which keeps
 * the last good number marked stale. Collapsing any of them into a zero would report an empty
 * room during a full class.
 */

export type RoomPulseResult =
  | { outcome: 'ok'; present: number; stuck: number }
  | { outcome: 'unknown' }
  | { outcome: 'forbidden' }
  | { outcome: 'failed' };

/** Just the two fields wanted, each only trusted when it is genuinely a finite number. */
interface LiveStateBody {
  present?: number;
  stuck?: number;
}

const count = (n: unknown): number | null =>
  (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);

export async function readRoomPulse(sessionId: string): Promise<RoomPulseResult> {
  try {
    const res = await portalApi.get<LiveStateBody>(
      `/api/portal/sessions/${encodeURIComponent(sessionId)}/live-state`,
    );
    const present = count(res.data?.present);
    const stuck = count(res.data?.stuck);
    /**
     * BOTH OR NEITHER. A body that carries one count and not the other is a shape this client
     * does not understand, and guessing the missing one as zero is exactly the fabricated zero
     * the whole chip rule exists to prevent. `unknown` says so instead.
     */
    if (present === null || stuck === null) return { outcome: 'unknown' };
    return { outcome: 'ok', present, stuck };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 403 || status === 401 || status === 404) return { outcome: 'forbidden' };
    if (status === 503) return { outcome: 'unknown' };
    // Everything else, 429 included: a throttled producer is dropping measurements, which shows
    // the same way as a dropped request - the last count, marked as not updating.
    return { outcome: 'failed' };
  }
}
