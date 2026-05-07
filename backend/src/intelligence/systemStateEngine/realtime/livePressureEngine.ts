/**
 * livePressureEngine — keeps a per-project rolling pressure value and tier
 * alive across heartbeats. Publishes `pressure.changed` /
 * `pressure.escalated` / `pressure.decayed` events.
 *
 * Phase 8 §6.
 */
import { publishCognitiveEvent } from './cognitiveEventBus';
import { decayPressure, tierOf, type PressureTier } from './pressureDecayModel';

interface ProjectPressureState {
  readonly project_id: string;
  pressure: number;
  tier: PressureTier;
  last_escalation_at: Date;
  last_changed_at: Date;
}

const states = new Map<string, ProjectPressureState>();

function get(projectId: string): ProjectPressureState {
  let s = states.get(projectId);
  if (!s) {
    s = {
      project_id: projectId,
      pressure: 0,
      tier: 'calm',
      last_escalation_at: new Date(0),
      last_changed_at: new Date(),
    };
    states.set(projectId, s);
  }
  return s;
}

export interface PressureTickInput {
  readonly project_id: string;
  /** Latest raw pressure reading (e.g., from uxPressureEscalation.computeUXPressure). */
  readonly new_raw_pressure: number;
  readonly half_life_min?: number;
}

export function tickPressure(input: PressureTickInput): ProjectPressureState {
  const state = get(input.project_id);
  const minutesSinceEscalation = Math.max(
    0,
    (Date.now() - state.last_escalation_at.getTime()) / (60 * 1000),
  );
  const decayed = decayPressure({
    previous_pressure: state.pressure,
    minutes_since_last_escalation: minutesSinceEscalation,
    new_raw_pressure: input.new_raw_pressure,
    half_life_min: input.half_life_min,
  });
  const newTier = tierOf(decayed.value, state.tier);

  const tierChanged = newTier !== state.tier;
  const valueChanged = Math.abs(decayed.value - state.pressure) >= 3;     // emit when material

  if (decayed.applied_escalation > 0.5) {
    state.last_escalation_at = new Date();
  }

  if (valueChanged || tierChanged) {
    const previousTier = state.tier;
    const previousValue = state.pressure;
    state.pressure = decayed.value;
    state.tier = newTier;
    state.last_changed_at = new Date();

    publishCognitiveEvent({
      kind: 'pressure.changed',
      project_id: input.project_id,
      severity: tierChanged ? (newTier === 'critical' || newTier === 'urgent' ? 'warning' : 'info') : 'info',
      payload: {
        previous_pressure: previousValue,
        pressure: decayed.value,
        previous_tier: previousTier,
        tier: newTier,
        applied_decay: decayed.applied_decay,
        applied_escalation: decayed.applied_escalation,
      },
    });
    if (tierChanged) {
      const tierOrder: PressureTier[] = ['calm', 'elevated', 'urgent', 'critical'];
      const isEscalation = tierOrder.indexOf(newTier) > tierOrder.indexOf(previousTier);
      publishCognitiveEvent({
        kind: isEscalation ? 'pressure.escalated' : 'pressure.decayed',
        project_id: input.project_id,
        severity: isEscalation && (newTier === 'urgent' || newTier === 'critical') ? 'warning' : 'info',
        payload: { previous_tier: previousTier, tier: newTier, pressure: decayed.value },
      });
    }
  }

  return state;
}

export function getPressureState(projectId: string): ProjectPressureState {
  return { ...get(projectId) };
}

export function _resetLivePressureForTests(): void {
  states.clear();
}
