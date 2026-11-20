import api from '../utils/api';

/**
 * commsHubApi: the Communications Hub's data calls (CH1.3 onward). Every call is under
 * /api/admin/comms-hub, gated 'comms_hub' on the server. Shapes mirror
 * backend/src/services/commsHub/commsHubSchemas.ts exactly.
 */

/** The Today tiles and the header's pause state. An empty hub is all zeros. */
export interface CommsHubSummary {
  awaiting_approval: number;
  scheduled_next_7_days: number;
  upcoming_events: number;
  events_missing_thumbnail: number;
  needs_attention: number;
  sending_paused: boolean;
}

export async function getCommsHubSummary(): Promise<CommsHubSummary> {
  const { data } = await api.get<CommsHubSummary>('/api/admin/comms-hub/summary');
  return data;
}

/* Events (CH2.2 contract: backend/src/services/commsHub/eventSchemas.ts and eventInput.ts). */
export type HubEventType = 'session' | 'open_house' | 'office_hours' | 'workshop' | 'other';
export type HubEventStatus = 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled';
export type HubAudience = { kind: 'all_members' } | { kind: 'cohorts'; cohort_ids: string[] };
export interface HubRepeat { freq: 'weekly' | 'biweekly' | 'monthly'; until: string }
export interface HubPlacement { calendar: boolean; events_page: boolean; campus_rail: boolean }
export interface HubHost { name: string; role?: string }

export interface HubEvent {
  id: string;
  title: string;
  event_type: HubEventType;
  audience: HubAudience;
  status: HubEventStatus;
  starts_at: string;
  ends_at: string | null;
  /** The same moment on the Central clock: date YYYY-MM-DD, times HH:MM, label with the zone written out. */
  central: { date: string; start_time: string; end_time: string | null; label: string };
  repeat_rule: HubRepeat | null;
  next_occurrence_at: string | null;
  upcoming_preview: string[];
  join_url: string | null;
  registration_url: string | null;
  hosts: HubHost[];
  description: string | null;
  placement: HubPlacement;
  thumbnail_id: string | null;
  broadcast_occurrence_id: string | null;
  created_at: string;
  updated_at: string;
}

/** What the event form sends. Date and times are Central; the server turns them into instants. */
export interface HubEventInput {
  title: string;
  event_type: HubEventType;
  audience: HubAudience;
  date: string;
  start_time: string;
  end_time?: string | null;
  repeat?: HubRepeat | null;
  join_url?: string | null;
  registration_url?: string | null;
  hosts: HubHost[];
  description?: string | null;
  placement: HubPlacement;
  status: 'draft' | 'scheduled';
}

export type HubEventScope = 'upcoming' | 'past' | 'cancelled' | 'all';

export async function listHubEvents(scope: HubEventScope = 'upcoming'): Promise<HubEvent[]> {
  const { data } = await api.get<{ events: HubEvent[] }>('/api/admin/comms-hub/events', { params: { scope } });
  return data.events;
}

export async function createHubEvent(input: HubEventInput): Promise<HubEvent> {
  const { data } = await api.post<{ event: HubEvent }>('/api/admin/comms-hub/events', input);
  return data.event;
}

export async function updateHubEvent(id: string, input: HubEventInput): Promise<HubEvent> {
  const { data } = await api.put<{ event: HubEvent }>(`/api/admin/comms-hub/events/${id}`, input);
  return data.event;
}

export async function duplicateHubEvent(id: string): Promise<HubEvent> {
  const { data } = await api.post<{ event: HubEvent }>(`/api/admin/comms-hub/events/${id}/duplicate`);
  return data.event;
}

export async function cancelHubEvent(id: string): Promise<HubEvent> {
  const { data } = await api.post<{ event: HubEvent }>(`/api/admin/comms-hub/events/${id}/cancel`);
  return data.event;
}

export async function getHubEvent(id: string): Promise<HubEvent> {
  const { data } = await api.get<{ event: HubEvent }>(`/api/admin/comms-hub/events/${id}`);
  return data.event;
}

export interface HubCohort { id: string; name: string; status: 'open' | 'closed' | 'completed'; start_date: string | null }

export async function listHubCohorts(): Promise<HubCohort[]> {
  const { data } = await api.get<{ cohorts: HubCohort[] }>('/api/admin/comms-hub/cohorts');
  return data.cohorts;
}

/** "Write with AI": a description with no dates, times, links or prices (the server strips any). */
export async function describeHubEvent(input: { title: string; event_type: HubEventType; hosts: string[]; notes?: string | null }): Promise<string> {
  const { data } = await api.post<{ description: string }>('/api/admin/comms-hub/events/describe', input);
  return data.description;
}

/** The server's plain-language reason from a failed call, or a generic one. Never a stack or status code. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === 'string' && msg.length > 0 && msg.length < 400 ? msg : fallback;
}
