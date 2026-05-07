/**
 * sandboxCalibrationBuffer — in-memory rolling buffer of predicted vs
 * actual deltas keyed by task type. The executionConfidenceCalibrator
 * reads this so that bless-then-fail patterns surface as confidence
 * downgrades — if the sandbox keeps predicting +8 pressure drop and
 * production keeps delivering +1, autonomy confidence should erode.
 *
 * Phase 13 §G.
 */

const BUFFER_LIMIT = 50;
const MIN_OUTCOMES_FOR_SCORE = 3;

interface Sample {
  predicted_pressure_delta: number;
  actual_pressure_delta: number;
  predicted_cognition_delta: number;
  actual_cognition_delta: number;
  recorded_at: number;
}

const buffersByTaskType = new Map<string, Sample[]>();

export function recordCalibrationSample(taskType: string, sample: Omit<Sample, 'recorded_at'>): void {
  const list = buffersByTaskType.get(taskType) ?? [];
  list.push({ ...sample, recorded_at: Date.now() });
  while (list.length > BUFFER_LIMIT) list.shift();
  buffersByTaskType.set(taskType, list);
}

export interface CalibrationScore {
  /** 0-100, where 100 = perfect prediction; downgrades confidence below ~70. */
  readonly score: number;
  /** Mean abs % error across the most recent samples used for the score. */
  readonly mean_abs_pct_error: number;
  readonly samples_evaluated: number;
}

/**
 * Score the recent samples for a task type. Returns 100 when no samples
 * yet (no penalty for the cold-start case) and downgrades when error
 * climbs above 30% across the last 10 samples.
 */
export function calibrationScoreFor(taskType: string, lookback = 10): CalibrationScore {
  const list = buffersByTaskType.get(taskType) ?? [];
  if (list.length < MIN_OUTCOMES_FOR_SCORE) {
    return { score: 100, mean_abs_pct_error: 0, samples_evaluated: list.length };
  }
  const recent = list.slice(-lookback);
  let totalErr = 0;
  let valid = 0;
  for (const s of recent) {
    const err = errorPct(s.predicted_pressure_delta, s.actual_pressure_delta);
    if (err != null) { totalErr += err; valid++; }
  }
  if (valid === 0) {
    return { score: 100, mean_abs_pct_error: 0, samples_evaluated: 0 };
  }
  const meanErr = totalErr / valid;
  // 0% error → score 100; 30% error → score 70; 60%+ → score 40.
  const score = Math.max(40, Math.min(100, Math.round(100 - meanErr)));
  return { score, mean_abs_pct_error: Math.round(meanErr * 10) / 10, samples_evaluated: valid };
}

function errorPct(predicted: number, actual: number): number | null {
  if (predicted === 0 && actual === 0) return 0;
  const denom = Math.abs(predicted) || 1;     // avoid div-by-zero; small predictions tolerate larger absolute error
  return Math.abs(predicted - actual) / denom * 100;
}

/** Test-only buffer reset. */
export function _resetSandboxCalibrationBuffer(): void {
  buffersByTaskType.clear();
}

export function getSandboxCalibrationStats(): { task_types: number; samples_total: number } {
  let total = 0;
  for (const list of buffersByTaskType.values()) total += list.length;
  return { task_types: buffersByTaskType.size, samples_total: total };
}
