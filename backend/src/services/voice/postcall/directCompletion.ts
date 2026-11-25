/**
 * Post-call for the direct engines (VS3.2): when a Conversation Relay or OpenAI Realtime call ends,
 * reproduce what a completed Synthflow call produces today, exactly once:
 *   1. a CommunicationLog row for the call (deterministic id, so it is created once) with the
 *      completion recorded by claimCompletion (status delivered/failed, transcript, duration),
 *   2. a timeline Activity on the lead ("<agent> called <First> (1m 5s)") - claimed, and written in
 *      the same transaction as its done mark,
 *   3. transcript extraction into the lead (processCallTranscript) when there is a usable transcript.
 * Deliberately NOT reproduced: the post-call text message. It is a second outbound channel and needs
 * its own per-route approval (directive section 10); it stays Synthflow-only until then.
 *
 * Triggers (any order, any number of times): the session handing over its transcript, the Twilio
 * status callback reaching a terminal state, and reconcileDirectCompletions (the sweep for calls whose
 * callback never came: "reconcile, do not trust delivery"). Test-mode calls are recorded nowhere.
 *
 * A completed call without a usable transcript is never counted as a successful conversation: its
 * log carries transcript_state 'pending_review' and extraction is not attempted.
 */
import { createHash } from 'crypto';
import type { CallCompletion, ClaimResult, CompletionProvider } from './completion';
import { transcriptState } from './completion';
import type { PostCallEffect } from './effectClaims';

export const TERMINAL_STATES = new Set(['completed', 'busy', 'no_answer', 'failed', 'canceled']);

export interface DirectCallRow {
  id: string;
  engine: string;
  state: string;
  lead_id: number | null;
  provider_call_id: string | null;
  test_mode: boolean;
  human_answered: boolean;
  duration_seconds: number | null;
  purpose: string;
}

export interface DirectDeps {
  loadCall: (callId: string) => Promise<DirectCallRow | null>;
  /** Create the call's communication log once (by id) and link it on voice_calls. Returns the id. */
  ensureLog: (call: DirectCallRow, logId: string) => Promise<string>;
  claimCompletion: (logId: string, c: CallCompletion) => Promise<ClaimResult>;
  claimEffect: (logId: string, effect: PostCallEffect) => Promise<boolean>;
  releaseEffect: (logId: string, effect: PostCallEffect) => Promise<void>;
  /** Write the timeline Activity AND mark the effect done atomically. */
  writeTimeline: (logId: string, leadId: number, subject: string, body: string, meta: Record<string, unknown>) => Promise<void>;
  /** Extraction (an OpenAI call plus lead writes); markEffectDone after it succeeds. */
  extract: (leadId: number, transcript: string, providerCallId: string) => Promise<void>;
  markEffectDone: (logId: string, effect: PostCallEffect) => Promise<void>;
  leadFirstName: (leadId: number) => Promise<string>;
  transcriptFor: (callId: string) => string;
  log: (line: Record<string, unknown>) => void;
}

/** A stable UUID (RFC 4122 layout, version nibble 5) derived from the voice call id. */
export function logIdFor(callId: string): string {
  const h = createHash('sha1').update(`voice-call-log:${callId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function formatDuration(s: number | null): string {
  if (!s || s < 1) return '';
  const m = Math.floor(s / 60);
  return ` (${m ? `${m}m ` : ''}${s % 60}s)`;
}

export function toCompletion(call: DirectCallRow, transcript: string): CallCompletion {
  return {
    provider: call.engine as CompletionProvider, providerCallId: call.provider_call_id ?? call.id, status: call.state,
    completed: call.state === 'completed' && call.human_answered, durationSeconds: call.duration_seconds,
    transcript, recordingUrl: '', disposition: call.state, analysis: {}, metadata: { voice_call_id: call.id, purpose: call.purpose },
  };
}

export type DirectOutcome =
  | { done: false; reason: 'unknown_call' | 'not_ended' | 'test_mode' }
  | { done: true; logId: string; firstDelivery: boolean; timeline: boolean; extraction: boolean; transcriptState: string };

export async function processDirectCompletion(callId: string, d: DirectDeps, agentName = 'Cory'): Promise<DirectOutcome> {
  const call = await d.loadCall(callId);
  if (!call) return { done: false, reason: 'unknown_call' };
  if (!TERMINAL_STATES.has(call.state)) return { done: false, reason: 'not_ended' };
  if (call.test_mode) return { done: false, reason: 'test_mode' };
  const transcript = d.transcriptFor(callId);
  const completion = toCompletion(call, transcript);
  const state = transcriptState(completion);
  const logId = await d.ensureLog(call, logIdFor(callId));
  const { firstDelivery } = await d.claimCompletion(logId, completion);
  let timeline = false;
  let extraction = false;

  if (call.lead_id && (await d.claimEffect(logId, 'timeline'))) {
    try {
      const first = (await d.leadFirstName(call.lead_id)).split(' ')[0] || 'Lead';
      const subject = call.state === 'completed' ? `${agentName} called ${first}${formatDuration(call.duration_seconds)}` : `${agentName} tried to call ${first} (${call.state.replace('_', ' ')})`;
      await d.writeTimeline(logId, call.lead_id, subject, transcript.slice(0, 2000), { call_id: completion.providerCallId, voice_call_id: call.id, engine: call.engine, transcript_state: state });
      timeline = true;
    } catch (e) {
      await d.releaseEffect(logId, 'timeline').catch(() => undefined);
      d.log({ level: 'error', service: 'voice-postcall', event: 'voice_postcall_timeline_failed', outcome: 'failure', error_class: (e as Error).name || 'Error', call_id: callId });
    }
  }

  if (call.lead_id && state === 'present' && (await d.claimEffect(logId, 'extraction'))) {
    try {
      await d.extract(call.lead_id, transcript, completion.providerCallId);
      await d.markEffectDone(logId, 'extraction');
      extraction = true;
    } catch (e) {
      await d.releaseEffect(logId, 'extraction').catch(() => undefined);
      d.log({ level: 'error', service: 'voice-postcall', event: 'voice_postcall_extraction_failed', outcome: 'failure', error_class: (e as Error).name || 'Error', call_id: callId });
    }
  }

  d.log({ level: 'info', service: 'voice-postcall', event: 'voice_postcall_processed', outcome: 'success', call_id: callId, first_delivery: firstDelivery, timeline, extraction, transcript_state: state });
  return { done: true, logId, firstDelivery, timeline, extraction, transcriptState: state };
}
