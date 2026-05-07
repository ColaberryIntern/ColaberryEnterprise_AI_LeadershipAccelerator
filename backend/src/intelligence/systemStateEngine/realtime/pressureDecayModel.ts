/**
 * pressureDecayModel — pure model for how pressure should decay over time
 * when no new escalating signals arrive.
 *
 * Half-life model: pressure halves every `half_life_min` minutes of calm.
 * Combined with hysteresis bands so we don't oscillate around tier
 * boundaries.
 *
 * Phase 8 §6.
 */

export type PressureTier = 'calm' | 'elevated' | 'urgent' | 'critical';

export interface DecayInput {
  readonly previous_pressure: number;
  readonly minutes_since_last_escalation: number;
  /** New raw pressure observed this tick (e.g., from uxPressureEscalation). */
  readonly new_raw_pressure: number;
  readonly half_life_min?: number;
}

export interface DecayedPressure {
  readonly value: number;
  readonly tier: PressureTier;
  readonly applied_decay: number;
  readonly applied_escalation: number;
}

const DEFAULT_HALF_LIFE_MIN = 15;

// Hysteresis bands: must EXCEED upper to escalate, fall BELOW lower to decay.
const TIER_BANDS: Record<PressureTier, { lower: number; upper: number }> = {
  calm: { lower: 0, upper: 25 },
  elevated: { lower: 18, upper: 55 },
  urgent: { lower: 45, upper: 80 },
  critical: { lower: 72, upper: 100 },
};

export function decayPressure(input: DecayInput): DecayedPressure {
  const halfLife = input.half_life_min ?? DEFAULT_HALF_LIFE_MIN;
  // Decay: previous_pressure * 0.5^(t / half_life)
  const decayed = input.previous_pressure * Math.pow(0.5, input.minutes_since_last_escalation / halfLife);
  const applied_decay = input.previous_pressure - decayed;

  // The new pressure is the MAX of decayed-old and new-raw — pressure jumps
  // up immediately on new escalation, but only decays gradually.
  const value = Math.max(0, Math.min(100, Math.round(Math.max(decayed, input.new_raw_pressure))));
  const applied_escalation = Math.max(0, value - decayed);

  return {
    value,
    tier: tierOf(value, /* previousTier */ undefined),
    applied_decay: Math.round(applied_decay * 10) / 10,
    applied_escalation: Math.round(applied_escalation * 10) / 10,
  };
}

/**
 * Hysteretic tier mapping. If `previousTier` is supplied, transitions are
 * dampened — only escalates above the upper band, only decays below the
 * lower band.
 */
export function tierOf(value: number, previousTier?: PressureTier): PressureTier {
  if (!previousTier) {
    if (value >= 80) return 'critical';
    if (value >= 50) return 'urgent';
    if (value >= 20) return 'elevated';
    return 'calm';
  }
  const order: PressureTier[] = ['calm', 'elevated', 'urgent', 'critical'];
  const prevIdx = order.indexOf(previousTier);
  // Try to escalate
  for (let i = order.length - 1; i > prevIdx; i--) {
    if (value > TIER_BANDS[order[i]].lower) {
      // Must have exceeded the lower bound of the higher tier to escalate
      return order[i];
    }
  }
  // Try to decay
  for (let i = 0; i < prevIdx; i++) {
    if (value < TIER_BANDS[previousTier].lower) {
      return order[Math.max(0, prevIdx - 1)];
    }
  }
  return previousTier;
}
