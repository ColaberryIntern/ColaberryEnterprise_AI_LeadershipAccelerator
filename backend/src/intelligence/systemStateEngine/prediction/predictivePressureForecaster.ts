/**
 * predictivePressureForecaster — extrapolates future pressure from a
 * recent history of pressure measurements.
 *
 * V1 uses linear regression on the last N samples + a momentum check
 * against the most recent sample. Phase 10 can swap with ARIMA / LSTM
 * — the interface (`forecastPressure(history, horizon_min)`) stays.
 *
 * Pure: no I/O. Tested with synthetic series.
 *
 * Phase 9 §7.
 */

export interface PressureSample {
  readonly timestamp_ms: number;
  readonly pressure: number;
}

export interface PressureForecast {
  readonly horizon_min: number;
  readonly predicted_pressure: number;
  readonly predicted_tier: 'calm' | 'elevated' | 'urgent' | 'critical';
  readonly slope_per_min: number;
  readonly trend: 'rising' | 'falling' | 'flat';
  readonly confidence: number;            // 0-100
  readonly basis: ReadonlyArray<string>;
  /** Risk: probability the predicted tier escalates one step within horizon. */
  readonly escalation_risk: number;
}

export function forecastPressure(
  history: ReadonlyArray<PressureSample>,
  horizon_min: number,
): PressureForecast {
  if (history.length < 2) {
    const last = history[history.length - 1]?.pressure ?? 0;
    return {
      horizon_min,
      predicted_pressure: last,
      predicted_tier: tierOf(last),
      slope_per_min: 0,
      trend: 'flat',
      confidence: 10,
      basis: ['Insufficient history (<2 samples) — returning latest as prediction.'],
      escalation_risk: 0,
    };
  }

  // Linear regression: x = minutes since first sample, y = pressure.
  // slope = (n*Σxy − Σx*Σy) / (n*Σx² − (Σx)²)
  const t0 = history[0].timestamp_ms;
  const xs = history.map(h => (h.timestamp_ms - t0) / 60_000);
  const ys = history.map(h => h.pressure);
  const n = history.length;
  const sumX = xs.reduce((s, v) => s + v, 0);
  const sumY = ys.reduce((s, v) => s + v, 0);
  const sumXY = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const sumXX = xs.reduce((s, v) => s + v * v, 0);
  const denom = n * sumXX - sumX * sumX;
  let slope = 0;
  let intercept = sumY / n;
  if (denom !== 0) {
    slope = (n * sumXY - sumX * sumY) / denom;
    intercept = (sumY - slope * sumX) / n;
  }

  const lastX = xs[xs.length - 1];
  const predictedX = lastX + horizon_min;
  let predicted = intercept + slope * predictedX;
  predicted = Math.max(0, Math.min(100, Math.round(predicted)));

  // Momentum check: weight the prediction toward the most recent sample
  // when its delta from intercept is large.
  const lastY = ys[ys.length - 1];
  const blendWeight = 0.3;
  predicted = Math.round(predicted * (1 - blendWeight) + lastY * blendWeight);

  // Confidence: function of sample count + how linear the data is (use R²)
  const meanY = sumY / n;
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => {
    const fit = intercept + slope * xs[i];
    return s + (y - fit) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const confidence = Math.min(95, Math.round(40 + Math.min(40, n * 5) + r2 * 20));

  const trend: PressureForecast['trend'] = slope > 0.5 ? 'rising' : slope < -0.5 ? 'falling' : 'flat';

  // Escalation risk: how close are we to crossing the next tier upward?
  const currentTier = tierOf(lastY);
  const predictedTier = tierOf(predicted);
  const tierOrder = ['calm', 'elevated', 'urgent', 'critical'] as const;
  const currentIdx = tierOrder.indexOf(currentTier);
  const predictedIdx = tierOrder.indexOf(predictedTier);
  const willEscalate = predictedIdx > currentIdx;
  let escalationRisk = 0;
  if (willEscalate) escalationRisk = Math.min(100, 60 + Math.round(slope * 5));
  else if (slope > 0.5) escalationRisk = Math.min(60, Math.round((100 - lastY) * (slope / 5)));

  const basis: string[] = [];
  basis.push(`Linear fit slope ${slope.toFixed(2)}/min over ${n} samples; R²=${r2.toFixed(2)}.`);
  basis.push(`Latest ${lastY} → predicted ${predicted} at +${horizon_min}m (${trend}).`);
  if (willEscalate) basis.push(`Predicted to cross from ${currentTier} → ${predictedTier}.`);

  return {
    horizon_min,
    predicted_pressure: predicted,
    predicted_tier: predictedTier,
    slope_per_min: Math.round(slope * 100) / 100,
    trend,
    confidence,
    basis,
    escalation_risk: escalationRisk,
  };
}

function tierOf(v: number): 'calm' | 'elevated' | 'urgent' | 'critical' {
  if (v >= 80) return 'critical';
  if (v >= 50) return 'urgent';
  if (v >= 20) return 'elevated';
  return 'calm';
}
