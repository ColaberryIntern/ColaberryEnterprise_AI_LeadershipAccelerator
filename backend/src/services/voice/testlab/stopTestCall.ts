/**
 * The Voice Lab stop button (VS3.4): hang up ONE in-progress TEST call. It only ever touches a row
 * that is test_mode, in the Test Lab tenant, and not already ended; anything else is refused, so the
 * button can never end a customer call. Twilio's own "already gone" (404) counts as stopped.
 * One attempt, no retry: if Twilio cannot be reached the call still ends at the 180-second cap.
 */
export interface StopDeps {
  lookup: (callId: string) => Promise<{ provider_call_id: string | null; state: string; test_mode: boolean } | null>;
  hangup: (providerCallId: string) => Promise<void>;
  log: (line: Record<string, unknown>) => void;
}

const ENDED = new Set(['completed', 'busy', 'no_answer', 'failed', 'canceled', 'blocked']);

export type StopResult =
  | { status: 200; body: { stopped: true } }
  | { status: 404; body: { error: 'NotFound' } }
  | { status: 409; body: { error: 'NotStoppable'; reason: 'not_a_test_call' | 'already_ended' | 'not_dialed_yet' } }
  | { status: 502; body: { error: string } };

export async function stopTestCall(callId: string, d: StopDeps): Promise<StopResult> {
  const row = await d.lookup(callId);
  if (!row) return { status: 404, body: { error: 'NotFound' } };
  if (!row.test_mode) return { status: 409, body: { error: 'NotStoppable', reason: 'not_a_test_call' } };
  if (ENDED.has(row.state)) return { status: 409, body: { error: 'NotStoppable', reason: 'already_ended' } };
  if (!row.provider_call_id) return { status: 409, body: { error: 'NotStoppable', reason: 'not_dialed_yet' } };
  try {
    await d.hangup(row.provider_call_id);
    d.log({ level: 'info', service: 'voice-studio', event: 'voice_test_call_stopped', outcome: 'success', call_id: callId });
    return { status: 200, body: { stopped: true } };
  } catch (e) {
    const errorClass = (e as { errorClass?: string; name?: string })?.errorClass ?? (e as Error).name ?? 'UpstreamUnavailable';
    d.log({ level: 'error', service: 'voice-studio', event: 'voice_test_call_stop_failed', outcome: 'failure', error_class: errorClass, call_id: callId });
    return { status: 502, body: { error: errorClass } };
  }
}
