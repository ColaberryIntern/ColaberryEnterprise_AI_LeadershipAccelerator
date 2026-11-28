import api from '../utils/api';

/**
 * admissionsOpsApi: the Admissions & Ops Command Center's data calls (AO2.1 onward). Every call is under
 * /api/admin/admissions-ops, gated 'admissions_ops' on the server. Shapes mirror
 * backend/src/services/admissionsOps/todaySchema.ts exactly.
 */
export type SourceStatus = 'ok' | 'stale' | 'down' | 'not_connected';
export type SystemId = 'ghl' | 'app_colaberry' | 'retool' | 'tfc' | 'paysimple' | 'gmail' | 'zendesk' | 'sheets';
export type SectionId = 'admissions' | 'communications' | 'students' | 'payments' | 'compliance' | 'events';

export interface SystemState { id: SystemId; name: string; record_for: string; status: SourceStatus; synced_at: string | null }

export interface QueueItem {
  id: string;
  section: SectionId;
  when: 'today' | 'this_week';
  trigger: string;
  subject: { kind: 'student' | 'group'; label: string; ref: string | null };
  why: string;
  systems_checked: SystemId[];
  next_step: string;
  approval: 'read_only' | 'needs_approval' | 'bulk_needs_approval';
  pulled_at: string | null;
  down_systems: SystemId[];
}

export interface EnrollmentTarget {
  target: number; confirmed_paid: number; days_left: number; assumed_rate: number;
  remaining: number; daily_required: number; prospects_needed: number;
  source: SystemId; pulled_at: string | null;
}

export interface TodayPayload {
  sample: boolean;
  generated_at: string;
  briefing: { headline: string; start_with: string | null; detail: string };
  target: EnrollmentTarget;
  sections: Array<{ id: SectionId; label: string; count: number; systems: SystemId[] }>;
  queue: QueueItem[];
  may_do: Array<{ level: number; name: string; rule: string }>;
  systems: SystemState[];
}

export async function getToday(): Promise<TodayPayload> {
  const { data } = await api.get<TodayPayload>('/api/admin/admissions-ops/today');
  return data;
}
