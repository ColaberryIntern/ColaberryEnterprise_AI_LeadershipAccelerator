/**
 * escalationEffectivenessLearner — measures how often escalations actually
 * led to a meaningful operational outcome (incident acknowledged within
 * SLA, remediation accepted, pressure dropped after dispatch).
 *
 * Pure: takes a list of dispatch+incident pairs, scores effectiveness.
 *
 * Phase 10 §8.
 */

export interface DispatchObservation {
  readonly subscriber_id: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly succeeded: boolean;
  /** Time from dispatch to incident.acknowledged (ms). Null = never acknowledged. */
  readonly time_to_ack_ms: number | null;
  /** Time from dispatch to incident.resolved (ms). */
  readonly time_to_resolve_ms: number | null;
  /** Pressure delta in the 30 minutes following dispatch (negative = improved). */
  readonly pressure_delta_30min: number | null;
}

export interface EscalationEffectivenessReport {
  readonly subscriber_scores: ReadonlyArray<{
    subscriber_id: string;
    samples: number;
    success_rate: number;
    median_time_to_ack_min: number | null;
    median_time_to_resolve_min: number | null;
    avg_pressure_delta: number;
    score: number;            // 0-100
  }>;
  readonly overall_effectiveness: number;     // 0-100
  readonly best_subscriber: string | null;
  readonly notes: ReadonlyArray<string>;
}

const SLA_ACK_MIN = 30;          // ack within 30 min = healthy

export function scoreEscalations(observations: ReadonlyArray<DispatchObservation>): EscalationEffectivenessReport {
  if (observations.length === 0) {
    return {
      subscriber_scores: [],
      overall_effectiveness: 0,
      best_subscriber: null,
      notes: ['No dispatch history yet.'],
    };
  }

  const bySubscriber = new Map<string, DispatchObservation[]>();
  for (const o of observations) {
    const arr = bySubscriber.get(o.subscriber_id) || [];
    arr.push(o);
    bySubscriber.set(o.subscriber_id, arr);
  }

  const scores: EscalationEffectivenessReport['subscriber_scores'] = Array.from(bySubscriber.entries()).map(([id, list]) => {
    const successes = list.filter(o => o.succeeded);
    const successRate = list.length > 0 ? successes.length / list.length : 0;
    const ackTimes = list.map(o => o.time_to_ack_ms).filter((v): v is number => typeof v === 'number');
    const resolveTimes = list.map(o => o.time_to_resolve_ms).filter((v): v is number => typeof v === 'number');
    const pressureDeltas = list.map(o => o.pressure_delta_30min).filter((v): v is number => typeof v === 'number');
    const medianAck = median(ackTimes);
    const medianResolve = median(resolveTimes);
    const avgPressure = pressureDeltas.length > 0
      ? pressureDeltas.reduce((s, v) => s + v, 0) / pressureDeltas.length
      : 0;

    // Score: success rate (40) + SLA conformance (30) + pressure-drop signal (30)
    const slaScore = medianAck !== null
      ? Math.max(0, 30 - Math.round((medianAck / 60_000 / SLA_ACK_MIN) * 30))
      : 5;
    const pressureScore = Math.max(0, Math.min(30, Math.round(-avgPressure * 0.5)));
    const score = Math.max(0, Math.min(100, Math.round(successRate * 40 + slaScore + pressureScore + 5)));

    return {
      subscriber_id: id,
      samples: list.length,
      success_rate: Math.round(successRate * 100) / 100,
      median_time_to_ack_min: medianAck !== null ? Math.round((medianAck / 60_000) * 10) / 10 : null,
      median_time_to_resolve_min: medianResolve !== null ? Math.round((medianResolve / 60_000) * 10) / 10 : null,
      avg_pressure_delta: Math.round(avgPressure * 10) / 10,
      score,
    };
  }).sort((a, b) => b.score - a.score);

  const overall = scores.length > 0
    ? Math.round(scores.reduce((s, v) => s + v.score, 0) / scores.length)
    : 0;

  const notes: string[] = [];
  notes.push(`Scored ${scores.length} subscriber${scores.length === 1 ? '' : 's'} across ${observations.length} dispatch outcomes.`);
  if (scores.length > 0 && scores[0].score < 50) {
    notes.push(`Best-scoring subscriber (${scores[0].subscriber_id}) only at ${scores[0].score}/100 — review dispatch routing.`);
  }

  return {
    subscriber_scores: scores,
    overall_effectiveness: overall,
    best_subscriber: scores[0]?.subscriber_id ?? null,
    notes,
  };
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
