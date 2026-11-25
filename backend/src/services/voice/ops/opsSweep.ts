/**
 * Voice operations sweep (VS4.3): every five minutes while a direct engine is on, log the metrics, read
 * the facts (one read-only query set), and raise what the rules say through the shared alert service,
 * which folds repeats of an open condition together.
 *
 * Failure modes: a failing query or alert write is logged and the next sweep tries again; nothing here can
 * touch a call. Test calls count toward provider health and never toward business rates or spend rules
 * about live traffic, except spend, which is real money either way.
 */
import { QueryTypes, type Sequelize } from 'sequelize';
import { evaluateAlerts, type OpsFacts, type VoiceAlert } from './alertRules';
import { voiceOps, type OpsMetrics } from './opsMetrics';
import { WORST_CASE_USD_PER_MIN } from '../testlab/testLabPolicy';

/**
 * Spend = priced usage rows, plus, for every call without any, its whole length (ringing included, at most
 * an hour) at the worst published per-minute rate. An over-estimate on purpose: an alarm that is early, not late.
 *
 * Alert level only. Hard spend caps are the gateway's (per route and per tenant). */
export const SPEND_ALERT_USD = 25;

const ACTIVE = "('dispatching','queued','ringing','answered','session_active')";
const ENDED = "('completed','busy','no_answer','failed','canceled')";

interface Row { ended: number; failed: number; no_answer: number; never_rang: number; unknown24: number; orphaned: number; stalled: number; stuck: number; denied: number; silent: number; wrong_version: number; duplicates: number; spend: string | null; p95: number | null; turns: number; opt_pending: number }

export async function readFacts(s: Sequelize, ops: OpsMetrics = voiceOps, spendAlertUsd = SPEND_ALERT_USD): Promise<OpsFacts> {
  const [r] = await s.query<Row>(`
    WITH recent AS (SELECT * FROM voice_calls WHERE created_at > NOW() - INTERVAL '1 hour' AND test_mode = FALSE AND direction = 'outbound'),
         turns AS (SELECT t.first_audio_latency_ms AS ms FROM voice_turns t WHERE t.speaker = 'agent' AND t.first_audio_latency_ms IS NOT NULL AND t.started_at > NOW() - INTERVAL '1 hour')
    SELECT (SELECT COUNT(*)::int FROM recent WHERE state IN ${ENDED}) AS ended,
           (SELECT COUNT(*)::int FROM recent WHERE state = 'failed') AS failed,
           (SELECT COUNT(*)::int FROM recent WHERE state IN ('busy','no_answer')) AS no_answer,
           (SELECT COUNT(*)::int FROM recent c WHERE c.provider_call_id IS NOT NULL AND c.state IN ('dispatching','queued','failed','canceled') AND c.created_at < NOW() - INTERVAL '2 minutes'
              AND NOT EXISTS (SELECT 1 FROM voice_call_events e WHERE e.call_id = c.id AND e.state IN ('ringing','answered','session_active','completed','busy','no_answer'))) AS never_rang,
           (SELECT COUNT(*)::int FROM voice_calls WHERE state = 'dispatch_unknown' AND created_at > NOW() - INTERVAL '24 hours') AS unknown24,
           (SELECT COUNT(*)::int FROM voice_calls WHERE state IN ${ACTIVE} AND created_at < NOW() - INTERVAL '70 minutes' AND created_at > NOW() - INTERVAL '7 days') AS orphaned,
           (SELECT COUNT(*)::int FROM voice_calls c WHERE c.state IN ('answered','session_active') AND c.created_at < NOW() - INTERVAL '5 minutes' AND c.created_at > NOW() - INTERVAL '70 minutes'
              AND NOT EXISTS (SELECT 1 FROM voice_call_events e WHERE e.call_id = c.id AND e.ingested_at > NOW() - INTERVAL '5 minutes')) AS stalled,
           (SELECT COUNT(*)::int FROM voice_dial_reservations WHERE status IN ('held','dispatching') AND lease_expires_at < NOW() - INTERVAL '2 minutes' AND created_at > NOW() - INTERVAL '24 hours') AS stuck,
           (SELECT COUNT(*)::int FROM voice_tool_runs WHERE auth_decision = 'denied' AND started_at > NOW() - INTERVAL '1 hour') AS denied,
           (SELECT COUNT(*)::int FROM voice_calls WHERE human_answered = TRUE AND session_succeeded = FALSE AND state = 'completed' AND state_reason IS DISTINCT FROM 'transfer_fallback' AND created_at > NOW() - INTERVAL '1 hour') AS silent,
           (SELECT COUNT(*)::int FROM voice_calls c LEFT JOIN voice_agent_versions v ON v.id = c.profile_version_id
             WHERE c.test_mode = FALSE AND c.engine IN ('conversation_relay','openai_realtime') AND c.direction = 'outbound' AND c.created_at > NOW() - INTERVAL '24 hours' AND (v.id IS NULL OR v.status NOT IN ('published','retired'))) AS wrong_version,
           (SELECT COUNT(*)::int FROM (SELECT destination_hash FROM voice_dial_reservations WHERE status IN ('accepted','ambiguous') AND created_at > NOW() - INTERVAL '10 minutes' GROUP BY destination_hash HAVING COUNT(*) > 2) d) AS duplicates,
           (COALESCE((SELECT SUM(quantity * unit_price_usd) FROM voice_usage WHERE created_at > NOW() - INTERVAL '24 hours'), 0)
            + COALESCE((SELECT SUM(LEAST(EXTRACT(EPOCH FROM COALESCE(c.ended_at, NOW()) - c.created_at), 3600) / 60 * :rate) FROM voice_calls c
                WHERE c.engine IN ('conversation_relay','openai_realtime') AND c.provider_call_id IS NOT NULL AND c.created_at > NOW() - INTERVAL '24 hours'
                  AND NOT EXISTS (SELECT 1 FROM voice_usage u WHERE u.call_id = c.id)), 0))::text AS spend,
           (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY ms)::int FROM turns) AS p95, (SELECT COUNT(*)::int FROM turns) AS turns,
           (SELECT COUNT(*)::int FROM voice_calls c WHERE c.state_reason = 'caller_opt_out' AND c.test_mode = FALSE AND c.lead_id IS NOT NULL AND c.updated_at < NOW() - INTERVAL '15 minutes'
              AND NOT EXISTS (SELECT 1 FROM voice_call_events e WHERE e.call_id = c.id AND e.event_key = 'opt_out_recorded')) AS opt_pending`,
  { replacements: { rate: WORST_CASE_USD_PER_MIN }, type: QueryTypes.SELECT });
  const firstText = ops.snapshot().find((o) => o.operation === 'anthropic.first_text');
  return {
    ended: r.ended, failed: r.failed, busyOrNoAnswer: r.no_answer, acceptedNeverRang: r.never_rang, dispatchUnknown24h: r.unknown24, orphaned: r.orphaned, stalled: r.stalled, queueStuck: r.stuck,
    policyDenied: r.denied, silentAnswered: r.silent, wrongVersion: r.wrong_version, duplicateDials: r.duplicates, spend24hUsd: Number(r.spend ?? 0), spendAlertUsd, 
    // Recorded turns when there are any; otherwise Engine A's measured time to first word in this process.
    turnLatencyP95Ms: r.turns ? r.p95 : firstText?.latency_ms.p95 ?? null, turnLatencySamples: r.turns || (firstText?.volume ?? 0), optOutsPending: r.opt_pending,
    webhookSignatureFailures: ops.count('voice_webhook_refused:TwilioSignatureInvalid') + ops.count('voice_ws_upgrade_refused:TwilioSignatureInvalid'),
    transitionsRejected: ops.count('voice_session_transition_rejected'), handlerFailures: ops.count('voice_ws_handler_failed') + ops.count('voice_realtime_handler_failed'),
    breakers: { twilio: ops.breakers.twilio.current, anthropic: ops.breakers.anthropic.current, openai_realtime: ops.breakers.openai_realtime.current },
  };
}

export interface SweepDeps { facts: () => Promise<OpsFacts>; raise: (a: VoiceAlert) => Promise<void>; metrics: () => unknown; log: (l: Record<string, unknown>) => void }

export function productionSweepDeps(): SweepDeps {
  return {
    facts: async () => readFacts((await import('../../../config/database')).sequelize),
    raise: async (a) => {
      const { emitAlert } = await import('../../alertService');
      await emitAlert({ type: a.type, severity: a.severity, title: a.title, description: a.description, sourceType: 'system', impactArea: 'voice', urgency: a.severity >= 8 ? 'high' : 'medium', metadata: { source: 'voice-studio', alert_key: a.key } });
    },
    metrics: () => voiceOps.snapshot(),
    log: (l) => (l.level === 'info' ? console.log : console.warn)(JSON.stringify({ timestamp: new Date().toISOString(), service: 'voice-studio', ...l })),
  };
}

/** Never throws. Returns the keys raised. */
export async function runOpsSweep(d: SweepDeps = productionSweepDeps()): Promise<string[]> {
  d.log({ level: 'info', event: 'voice_ops_metrics', outcome: 'success', operations: d.metrics() });
  let alerts: VoiceAlert[];
  try {
    alerts = evaluateAlerts(await d.facts());
  } catch (e) {
    d.log({ level: 'error', event: 'voice_ops_facts_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError' });
    return [];
  }
  const raised: string[] = [];
  for (const a of alerts) {
    try {
      await d.raise(a); // eslint-disable-line no-await-in-loop -- few, in order
      raised.push(a.key);
    } catch (e) {
      d.log({ level: 'error', event: 'voice_alert_failed', outcome: 'failure', error_class: (e as Error).name || 'AlertError', alert_key: a.key });
    }
  }
  return raised;
}
