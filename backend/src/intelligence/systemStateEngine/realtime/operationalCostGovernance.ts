/**
 * operationalCostGovernance — aggregates GPT-4o usage, cache hit rates,
 * websocket throughput, and rerank frequency into a single cost report.
 *
 * No DB writes; all numbers come from in-memory counters maintained by
 * existing components (visionResultCache, cognitiveEventBus, refresh
 * triggers).
 *
 * Phase 8 §18.
 */
import { cognitiveEventBus } from './cognitiveEventBus';
import { getCacheStats } from '../multimodal/visionResultCache';

// Per-call cost rough constants (USD). Used only for live-budget reporting,
// not for billing. Adjust when OpenAI pricing changes.
const ESTIMATED_GPT4O_VISION_COST_USD = 0.012;        // ~5 KB image + 1.5K output
const ESTIMATED_TEXT_COST_USD = 0.003;

interface UsageCounters {
  gpt4o_calls: number;
  gpt4o_cache_hits: number;
  rerank_count: number;
  sse_subscribers_peak: number;
  events_published: number;
  reset_at: Date;
}

const counters: UsageCounters = {
  gpt4o_calls: 0,
  gpt4o_cache_hits: 0,
  rerank_count: 0,
  sse_subscribers_peak: 0,
  events_published: 0,
  reset_at: new Date(),
};

export function recordGPT4oCall(): void { counters.gpt4o_calls++; }
export function recordGPT4oCacheHit(): void { counters.gpt4o_cache_hits++; }
export function recordRerank(): void { counters.rerank_count++; }
export function recordSSESubscribers(count: number): void {
  if (count > counters.sse_subscribers_peak) counters.sse_subscribers_peak = count;
}

export interface OperationalCostGovernanceReport {
  readonly window_start: string;
  readonly window_end: string;
  readonly window_minutes: number;

  readonly gpt4o_calls: number;
  readonly gpt4o_cache_hits: number;
  readonly gpt4o_total_evaluations: number;
  readonly gpt4o_estimated_cost_usd: number;
  readonly gpt4o_estimated_cost_without_cache_usd: number;
  readonly cache_hit_rate: number;

  readonly rerank_count: number;
  readonly events_published: number;
  readonly events_dropped: number;
  readonly sse_subscribers_peak: number;

  readonly health_signals: ReadonlyArray<string>;
}

export function getCostGovernanceReport(): OperationalCostGovernanceReport {
  const now = new Date();
  const windowMin = (now.getTime() - counters.reset_at.getTime()) / (60 * 1000);
  const cacheStats = getCacheStats();
  const busStats = cognitiveEventBus.stats();

  // Live counters from components (snapshot — pull current values).
  counters.events_published = busStats.published;

  const totalEvals = counters.gpt4o_calls + counters.gpt4o_cache_hits;
  const cacheRate = totalEvals > 0 ? counters.gpt4o_cache_hits / totalEvals : 0;
  const gptCost = counters.gpt4o_calls * ESTIMATED_GPT4O_VISION_COST_USD;
  const withoutCacheCost = totalEvals * ESTIMATED_GPT4O_VISION_COST_USD;

  const health_signals: string[] = [];
  if (cacheRate < 0.4 && totalEvals >= 10) {
    health_signals.push(`Cache hit rate ${(cacheRate * 100).toFixed(0)}% — investigate cache key churn.`);
  }
  if (counters.gpt4o_calls > 100 && windowMin < 60) {
    health_signals.push(`>100 GPT-4o calls in <1h — verify rate limiter is engaged.`);
  }
  if (busStats.dropped > 10) {
    health_signals.push(`${busStats.dropped} events dropped from bus (subscriber errors).`);
  }
  if (cacheStats.size >= cacheStats.max_entries * 0.95) {
    health_signals.push(`Vision cache near capacity (${cacheStats.size}/${cacheStats.max_entries}) — eviction churn likely.`);
  }

  return {
    window_start: counters.reset_at.toISOString(),
    window_end: now.toISOString(),
    window_minutes: Math.round(windowMin * 10) / 10,

    gpt4o_calls: counters.gpt4o_calls,
    gpt4o_cache_hits: counters.gpt4o_cache_hits,
    gpt4o_total_evaluations: totalEvals,
    gpt4o_estimated_cost_usd: Math.round(gptCost * 1000) / 1000,
    gpt4o_estimated_cost_without_cache_usd: Math.round(withoutCacheCost * 1000) / 1000,
    cache_hit_rate: Math.round(cacheRate * 100) / 100,

    rerank_count: counters.rerank_count,
    events_published: busStats.published,
    events_dropped: busStats.dropped,
    sse_subscribers_peak: counters.sse_subscribers_peak,

    health_signals,
  };
}

export function resetCostGovernanceWindow(): void {
  counters.gpt4o_calls = 0;
  counters.gpt4o_cache_hits = 0;
  counters.rerank_count = 0;
  counters.sse_subscribers_peak = 0;
  counters.events_published = 0;
  counters.reset_at = new Date();
}
