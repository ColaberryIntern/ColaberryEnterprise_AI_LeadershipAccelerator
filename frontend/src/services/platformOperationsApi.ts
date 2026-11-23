/**
 * The Platform Operations client.
 *
 * These types are the twin of `backend/src/services/platformOperations/fleetTypes.ts`. The
 * frontend cannot import backend code, so the shape is restated here deliberately — the same
 * arrangement `mgmtSectionGate`'s unlisted-path table has with `adminNav.ts`. If the two
 * drift, the page renders `undefined` where a status word belongs, so keep them together.
 */
import api from '../utils/api';

export type Tone = 'ok' | 'bad' | 'warn' | 'off';
export type Coverage = 'reporting' | 'never_reported';

export interface LiveFleetRow {
  agent_name: string;
  schedule: string;
  schedule_label: string;
  schedule_source: 'override' | 'registry';
  runs_in_window: number;
  last_fire_at: string | null;
  coverage: Coverage;
  status: string;
  tone: Tone;
}

export interface ProposedRegistryRow {
  agent_name: string;
  trigger_type: 'cron';
  schedule: string | null;
  enabled: false;
  reason: string;
}

export interface UntrackedTimerRow {
  location: string;
  kind: 'cron' | 'interval';
  schedule: string | null;
  reports_as: string | null;
  reason: 'reports under no name' | 'name is not in the registry';
  proposed_row: ProposedRegistryRow;
  status: string;
  tone: Tone;
}

export interface LastRunRow {
  agent_name: string;
  schedule: string;
  schedule_label: string;
  last_fire_at: string | null;
  duration_ms: number | null;
  outcome: 'OK' | 'Failed' | 'No record';
  error_class: string;
  trace_id: string | null;
  tone: Tone;
}

export interface SilentRow {
  agent_name: string;
  schedule: string;
  schedule_label: string;
  expected_interval_ms: number | null;
  last_success_at: string | null;
  silent_for_ms: number | null;
  overdue_factor: number | null;
  status: string;
  tone: Tone;
}

export interface FleetCoverage {
  lookback_days: number;
  registry_cron_agents: number;
  reporting: number;
  never_reported: number;
  timer_sites: number;
  untracked_sites: number;
}

export interface FleetPanels {
  window_hours: number;
  generated_at: string;
  coverage: FleetCoverage;
  live: LiveFleetRow[];
  untracked: UntrackedTimerRow[];
  runs: LastRunRow[];
  silent: SilentRow[];
}

/**
 * Deliberately NOT caught here.
 *
 * Most admin pages swallow a failed read and render an empty shell. On a health page empty
 * panels read as "nothing is scheduled", which is the most dangerous wrong answer this
 * surface can give. The caller is expected to catch and say the read failed.
 */
export async function getFleetPanels(params: { windowHours?: number } = {}): Promise<FleetPanels> {
  const res = await api.get<FleetPanels>('/api/admin/system/operations/fleet', {
    params: params.windowHours ? { window_hours: params.windowHours } : undefined,
  });
  return res.data;
}
