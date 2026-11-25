/**
 * Voice alert rules (VS4.3), pure: facts in, alerts out. Each alert has a stable key, which names its
 * section in docs/voice-studio/RUNBOOK.md (a test keeps the two in step), and a stable title, because the
 * shared alert service folds repeats of one open condition together by title.
 *
 * Facts are counts and rates. No phone number, name, transcript or provider message can reach an alert.
 * Rates need a minimum sample, so one failed call out of one is not "100% failing".
 */
import type { CircuitState } from './circuitBreaker';
import type { Provider } from './opsMetrics';

export interface OpsFacts {
  /** Outbound, last hour. */
  ended: number;
  failed: number;
  busyOrNoAnswer: number;
  acceptedNeverRang: number;
  dispatchUnknown24h: number;
  /** Active states for far longer than a call can last. */
  orphaned: number;
  /** In a live state with no event for a while. */
  stalled: number;
  /** Reservations still open past their lease. */
  queueStuck: number;
  policyDenied: number;
  webhookSignatureFailures: number;
  /** A person answered and the AI session never succeeded, last hour. */
  silentAnswered: number;
  transitionsRejected: number;
  /** Live (non-test) calls whose version is missing or not published. */
  wrongVersion: number;
  duplicateDials: number;
  spend24hUsd: number;
  spendAlertUsd: number;
  turnLatencyP95Ms: number | null;
  turnLatencySamples: number;
  optOutsPending: number;
  handlerFailures: number;
  breakers: Record<Provider, CircuitState>;
}

export const THRESHOLDS = { minCalls: 5, failureRate: 0.3, noAnswerRate: 0.8, signatureFailures: 5, policyDenied: 10, transitions: 20, turnLatencyMs: 2_500, minTurns: 10 } as const;

export type AlertKey = 'no_ringing' | 'busy_no_answer' | 'call_failures' | 'webhook_signature' | 'provider_circuit_open' | 'silent_audio' | 'interruption_failures' | 'wrong_agent' | 'duplicate_calls' | 'dispatch_unknown' | 'orphaned_sessions' | 'stalled_events' | 'queue_stuck' | 'runaway_cost' | 'slow_turns' | 'policy_failures' | 'opt_out_pending' | 'handler_failures';
export interface VoiceAlert { key: AlertKey; title: string; severity: number; type: 'warning' | 'critical'; description: string }

const TITLES: Record<AlertKey, string> = {
  no_ringing: 'Voice: calls are accepted but never ring', busy_no_answer: 'Voice: almost nobody is answering', call_failures: 'Voice: calls are failing',
  webhook_signature: 'Voice: carrier webhooks fail signature checks', provider_circuit_open: 'Voice: a provider is switched off by its circuit breaker',
  silent_audio: 'Voice: people answer but the agent does not speak', interruption_failures: 'Voice: the conversation engine is rejecting turns', wrong_agent: 'Voice: calls without a published agent version',
  duplicate_calls: 'Voice: the same person was dialed repeatedly', dispatch_unknown: 'Voice: dials with an unknown outcome', orphaned_sessions: 'Voice: calls that never ended', stalled_events: 'Voice: live calls with no events',
  queue_stuck: 'Voice: dial reservations are stuck', runaway_cost: 'Voice: spend is over its alert level', slow_turns: 'Voice: the agent is slow to answer', policy_failures: 'Voice: many tool calls are being refused',
  opt_out_pending: 'Voice: opt-outs are not being recorded', handler_failures: 'Voice: call handlers are failing',
};
export const ALERT_KEYS = Object.keys(TITLES) as AlertKey[];

export function evaluateAlerts(f: OpsFacts): VoiceAlert[] {
  const out: VoiceAlert[] = [];
  const add = (key: AlertKey, severity: number, description: string) => out.push({ key, title: TITLES[key], severity, type: severity >= 8 ? 'critical' : 'warning', description: `${description} Runbook: docs/voice-studio/RUNBOOK.md, ${key}.` });
  const enough = f.ended >= THRESHOLDS.minCalls;
  const rate = (n: number) => `${n} of ${f.ended} calls in the last hour`;

  if (f.acceptedNeverRang > 0) add('no_ringing', 7, `${f.acceptedNeverRang} call(s) in the last hour were accepted by the carrier and never rang.`);
  if (enough && f.busyOrNoAnswer / f.ended >= THRESHOLDS.noAnswerRate) add('busy_no_answer', 5, `${rate(f.busyOrNoAnswer)} were busy or not answered.`);
  if (enough && f.failed / f.ended >= THRESHOLDS.failureRate) add('call_failures', 8, `${rate(f.failed)} failed.`);
  if (f.webhookSignatureFailures >= THRESHOLDS.signatureFailures) add('webhook_signature', 8, `${f.webhookSignatureFailures} webhook requests failed the signature check in the last hour.`);
  const open = Object.entries(f.breakers).filter(([, s]) => s !== 'CLOSED').map(([p]) => p);
  if (open.length) add('provider_circuit_open', 8, `Circuit not closed for: ${open.join(', ')}.`);
  if (f.silentAnswered > 0) add('silent_audio', 8, `${f.silentAnswered} answered call(s) in the last hour had no working AI session.`);
  if (f.transitionsRejected >= THRESHOLDS.transitions) add('interruption_failures', 6, `${f.transitionsRejected} rejected turn changes in the last hour.`);
  if (f.wrongVersion > 0) add('wrong_agent', 9, `${f.wrongVersion} live call(s) in the last day ran without a published agent version.`);
  if (f.duplicateDials > 0) add('duplicate_calls', 9, `${f.duplicateDials} recipient(s) were dialed more than twice in ten minutes.`);
  if (f.dispatchUnknown24h > 0) add('dispatch_unknown', 7, `${f.dispatchUnknown24h} dial(s) in the last day have an unknown outcome and were not retried.`);
  if (f.orphaned > 0) add('orphaned_sessions', 7, `${f.orphaned} call(s) are still open long after they can have ended.`);
  if (f.stalled > 0) add('stalled_events', 6, `${f.stalled} live call(s) have had no event for over five minutes.`);
  if (f.queueStuck > 0) add('queue_stuck', 6, `${f.queueStuck} dial reservation(s) are open past their lease.`);
  if (f.spend24hUsd >= f.spendAlertUsd) add('runaway_cost', 9, `Voice spend in the last 24 hours is $${f.spend24hUsd.toFixed(2)} (alert level $${f.spendAlertUsd.toFixed(2)}).`);
  if (f.turnLatencyP95Ms !== null && f.turnLatencySamples >= THRESHOLDS.minTurns && f.turnLatencyP95Ms > THRESHOLDS.turnLatencyMs) add('slow_turns', 5, `95th percentile time to first audio is ${Math.round(f.turnLatencyP95Ms)} ms over ${f.turnLatencySamples} turns.`);
  if (f.policyDenied >= THRESHOLDS.policyDenied) add('policy_failures', 6, `${f.policyDenied} tool calls were refused in the last hour.`);
  if (f.optOutsPending > 0) add('opt_out_pending', 9, `${f.optOutsPending} opt-out(s) older than 15 minutes are not recorded.`);
  if (f.handlerFailures > 0) add('handler_failures', 7, `${f.handlerFailures} call handler failure(s) in the last hour.`);
  return out;
}
