/**
 * The producer's half of the broadcast: ending it.
 *
 * Exists because Ali asked the obvious question during Test 2 — "can we just end it once the
 * stream is done? I won't have you there every time." Until now the only way to end a
 * broadcast was an engineer running a producer command by hand, and on 20 Oct the occurrence
 * sat in `live` for five minutes after the stream stopped, advertising a broadcast over dead
 * air.
 *
 * WHY THIS LIVES IN THE PORTAL AND NOT THE ADMIN APP. The command route authenticates a
 * PARTICIPANT and derives producer rights from the staff context on that token. A control in
 * the admin app would need either a second command route or a participant token it does not
 * have, and a second command path is exactly the duplication this subsystem keeps being warned
 * about. Ali already watches his own broadcast in the portal; the control belongs where he is.
 *
 * ENDING IS NOT REVERSIBLE. There is no un-end command, and the state machine treats `ended`
 * as terminal. The caller must confirm before invoking this.
 */
import portalApi from '../utils/portalApi';

export type EndOutcome = 'ended' | 'conflict' | 'forbidden' | 'failed';

export interface EndResult {
  outcome: EndOutcome;
  /** Present on conflict: the version the server believes is current, if it said. */
  currentVersion?: number;
}

/**
 * End a live broadcast, guarded on the version the caller last saw.
 *
 * A 409 is NOT an error to retry blindly: it means the occurrence moved under us, so the
 * producer is looking at a stale picture and should see a fresh one before deciding again.
 * That is reported rather than swallowed.
 */
export async function endBroadcast(occurrenceId: string, expectedVersion: number): Promise<EndResult> {
  try {
    await portalApi.post(`/api/portal/broadcasts/${occurrenceId}/command`, {
      command: 'end',
      expected_version: expectedVersion,
    });
    return { outcome: 'ended' };
  } catch (err: unknown) {
    const res = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
    const status = res?.status;
    if (status === 409) {
      const v = res?.data?.version;
      return { outcome: 'conflict', currentVersion: typeof v === 'number' ? v : undefined };
    }
    // 403 is a real answer, not a failure: this viewer is not a producer. It should be
    // unreachable from the UI, because the control is only rendered when the server said
    // is_producer — but the server deciding again is the reason that is safe.
    if (status === 403 || status === 401) return { outcome: 'forbidden' };
    return { outcome: 'failed' };
  }
}
