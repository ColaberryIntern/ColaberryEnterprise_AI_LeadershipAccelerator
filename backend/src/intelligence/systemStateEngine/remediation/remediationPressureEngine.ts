/**
 * remediationPressureEngine — per-project remediation pressure state +
 * reranker. Parallels livePressureEngine + pressureDecayModel for the
 * UX remediation surface specifically.
 *
 * Pressure builds from Σ(unresolved_cluster_count × severity_weight),
 * decays exponentially over time (10-min half-life), and gets a one-shot
 * boost on regression detection. The clusterPriorityState reranker sorts
 * clusters by current_pressure × (1 − historical_success_rate) and emits
 * `remediation.cluster.reranked` when ordering shifts (Kendall tau > 0.2).
 *
 * IMPORTANT: every rerank calls operationalCostGovernance.recordRerank()
 * so reranks count against the existing budget. Without this, the
 * reranker would bypass the cost ceiling that Phase 8 enforces.
 *
 * Phase 10.5 §B.
 */

import { recordRerank } from '../realtime/operationalCostGovernance';

const HALF_LIFE_MS = 10 * 60 * 1000;     // 10 min — matches livePressureEngine cadence
const REGRESSION_BOOST = 18;
const SEVERITY_WEIGHT: Record<string, number> = { high: 4, medium: 2, low: 1 };
const MAX_PRESSURE = 100;
const RERANK_RATE_LIMIT_MS = 30_000;
const KENDALL_TAU_THRESHOLD = 0.2;

interface ProjectPressureState {
  pressure: number;
  last_updated_at: number;
  rerank_blocked_until: number;
  current_order: ReadonlyArray<string>;     // cluster_signature[]
}

interface ClusterInputForRerank {
  cluster_signature: string;
  severity: 'low' | 'medium' | 'high';
  issue_count: number;
  historical_success_rate: number;     // 0-100
  is_regression_prone: boolean;
}

const projectStates = new Map<string, ProjectPressureState>();

function decayed(state: ProjectPressureState, now: number): number {
  const elapsed = now - state.last_updated_at;
  if (elapsed <= 0) return state.pressure;
  const factor = Math.pow(0.5, elapsed / HALF_LIFE_MS);
  return state.pressure * factor;
}

function getOrInit(projectId: string, now: number): ProjectPressureState {
  let s = projectStates.get(projectId);
  if (!s) {
    s = { pressure: 0, last_updated_at: now, rerank_blocked_until: 0, current_order: [] };
    projectStates.set(projectId, s);
  }
  return s;
}

/**
 * Update pressure from current open clusters. Returns the new state.
 * Call this any time clusters change (createFeedback, bulk-resolve,
 * regression detection).
 */
export function updateRemediationPressure(opts: {
  project_id: string;
  clusters: ReadonlyArray<{ severity: 'low' | 'medium' | 'high'; issue_count: number }>;
  regression_event?: boolean;
  now?: number;
}): { pressure: number; tier: 'calm' | 'elevated' | 'urgent' | 'critical'; changed: boolean } {
  const now = opts.now ?? Date.now();
  const state = getOrInit(opts.project_id, now);
  const decay = decayed(state, now);

  let raw = 0;
  for (const c of opts.clusters) {
    raw += SEVERITY_WEIGHT[c.severity] * Math.min(c.issue_count, 8);
  }
  // Blend: take the larger of (decayed previous pressure) vs (current
  // raw cluster count). This prevents pressure from oscillating wildly
  // when clusters get classified vs declassified within a short window.
  let pressure = Math.max(decay, Math.min(MAX_PRESSURE, raw * 1.5));
  if (opts.regression_event) {
    pressure = Math.min(MAX_PRESSURE, pressure + REGRESSION_BOOST);
  }

  const before = state.pressure;
  state.pressure = pressure;
  state.last_updated_at = now;

  const tier: 'calm' | 'elevated' | 'urgent' | 'critical' =
    pressure >= 75 ? 'critical' :
    pressure >= 50 ? 'urgent' :
    pressure >= 25 ? 'elevated' :
    'calm';

  return { pressure: Math.round(pressure), tier, changed: Math.abs(pressure - before) >= 1 };
}

export function getRemediationPressure(project_id: string, now?: number): { pressure: number; tier: 'calm' | 'elevated' | 'urgent' | 'critical' } {
  const t = now ?? Date.now();
  const s = projectStates.get(project_id);
  if (!s) return { pressure: 0, tier: 'calm' };
  const p = decayed(s, t);
  const tier: 'calm' | 'elevated' | 'urgent' | 'critical' =
    p >= 75 ? 'critical' :
    p >= 50 ? 'urgent' :
    p >= 25 ? 'elevated' :
    'calm';
  return { pressure: Math.round(p), tier };
}

/**
 * Reranker. Returns the new ordering, plus whether it was a "material"
 * change worth emitting an event for.
 *
 * Materiality test: Kendall tau distance between old and new orderings
 * > KENDALL_TAU_THRESHOLD. Below threshold the reranker eats the change
 * silently (no event, no cost charged).
 *
 * Above threshold + outside the rate-limit window: charges
 * operationalCostGovernance.recordRerank() and returns changed=true.
 */
export function rerankClusterPriority(opts: {
  project_id: string;
  clusters: ReadonlyArray<ClusterInputForRerank>;
  now?: number;
}): {
  ordered_signatures: ReadonlyArray<string>;
  changed: boolean;
  rate_limited: boolean;
  reason: string;
} {
  const now = opts.now ?? Date.now();
  const state = getOrInit(opts.project_id, now);

  // Compute priority scores. Higher = more urgent.
  const scored = opts.clusters.map(c => ({
    signature: c.cluster_signature,
    score: priorityScore(c),
  }));
  scored.sort((a, b) => b.score - a.score);
  const newOrder = scored.map(s => s.signature);

  if (state.current_order.length === 0) {
    state.current_order = newOrder;
    state.rerank_blocked_until = now + RERANK_RATE_LIMIT_MS;
    recordRerank();
    return { ordered_signatures: newOrder, changed: true, rate_limited: false, reason: 'Initial ordering recorded.' };
  }

  const tau = kendallTauDistance(state.current_order, newOrder);
  const material = tau > KENDALL_TAU_THRESHOLD;
  if (!material) {
    return { ordered_signatures: state.current_order, changed: false, rate_limited: false, reason: `Kendall tau ${tau.toFixed(2)} below threshold ${KENDALL_TAU_THRESHOLD}.` };
  }

  if (now < state.rerank_blocked_until) {
    return { ordered_signatures: state.current_order, changed: false, rate_limited: true, reason: `Rate-limited; next allowed at ${new Date(state.rerank_blocked_until).toISOString()}.` };
  }

  state.current_order = newOrder;
  state.rerank_blocked_until = now + RERANK_RATE_LIMIT_MS;
  recordRerank();
  return { ordered_signatures: newOrder, changed: true, rate_limited: false, reason: `Material rerank (tau ${tau.toFixed(2)}); cost-budget recorded.` };
}

function priorityScore(c: ClusterInputForRerank): number {
  const sevWeight = SEVERITY_WEIGHT[c.severity] ?? 2;
  const sizeFactor = Math.log2(1 + Math.min(c.issue_count, 16));
  const successFactor = 1 - Math.max(0, Math.min(1, c.historical_success_rate / 100));
  const regressionMultiplier = c.is_regression_prone ? 1.4 : 1;
  return sevWeight * sizeFactor * (0.5 + 0.5 * successFactor) * regressionMultiplier;
}

/**
 * Normalized Kendall tau distance: 0 = identical, 1 = reversed.
 * Standard pair-discordance count, normalized by n*(n-1)/2.
 */
function kendallTauDistance(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return a.length === b.length && a.every((x, i) => x === b[i]) ? 0 : 1;
  const rankA = new Map<string, number>();
  const rankB = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    rankA.set(a[i], i);
    rankB.set(b[i], i);
  }
  let discordant = 0;
  let comparable = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ai = rankA.get(a[i]);
      const aj = rankA.get(a[j]);
      const bi = rankB.get(a[i]);
      const bj = rankB.get(a[j]);
      if (ai == null || aj == null || bi == null || bj == null) continue;
      comparable++;
      const orderA = ai - aj;
      const orderB = bi - bj;
      if ((orderA > 0 && orderB < 0) || (orderA < 0 && orderB > 0)) discordant++;
    }
  }
  return comparable === 0 ? 0 : discordant / comparable;
}

/** Test-only helper. */
export function _resetRemediationPressureState(): void {
  projectStates.clear();
}
