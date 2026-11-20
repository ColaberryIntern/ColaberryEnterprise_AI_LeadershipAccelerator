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

/** The instance defaults to JSON; axios fills in the multipart boundary when told the body is a form. */
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

/* Event pictures (CH4.1: backend/src/routes/admin/commsHubPhotoRoutes.ts). */
export interface HubPhoto { id: string; media_asset_id: string; alt_text: string | null; width: number | null; height: number | null; url: string | null }

export async function listEventPhotos(eventId: string): Promise<HubPhoto[]> {
  const { data } = await api.get<{ photos: HubPhoto[] }>(`/api/admin/comms-hub/events/${eventId}/photos`);
  return data.photos;
}
export async function addEventPhoto(eventId: string, file: File, altText: string): Promise<HubPhoto[]> {
  const form = new FormData();
  form.append('alt_text', altText);
  form.append('file', file);
  const { data } = await api.post<{ photos: HubPhoto[] }>(`/api/admin/comms-hub/events/${eventId}/photos`, form, MULTIPART);
  return data.photos;
}
export async function removeEventPhoto(eventId: string, photoId: string): Promise<HubPhoto[]> {
  const { data } = await api.delete<{ photos: HubPhoto[] }>(`/api/admin/comms-hub/events/${eventId}/photos/${photoId}`);
  return data.photos;
}

/* Thumbnail studio (CH4.4: backend/src/routes/admin/commsHubThumbnailRoutes.ts). */
export type ThumbSize = '16x9' | '1x1' | '3x1';
export type TemplateStyle = 'bold_cherry' | 'berry_night' | 'clean_white';
export type AiStyle = 'A_dark_tech' | 'B_staged_headshot' | 'C_open_house' | 'D_weekly_live' | 'E_infographic';
export type StudioStyle = 'templates' | TemplateStyle | AiStyle;
export interface ThumbOption {
  id: string; source: 'template' | 'upload' | 'ai'; style: string | null; style_label: string;
  prompt: string | null; headline: string | null; supporting: string | null; show_when: boolean;
  cost_usd: number | null; created_at: string; chosen: boolean; cropped: ThumbSize[];
  previews: Record<ThumbSize, string | null>;
}
export interface StudioView { options: ThumbOption[]; chosen_id: string | null; ai: { enabled: boolean; used_today: number; daily_limit: number; batch: number } }
export interface ThumbJob { id: string; event_id: string; kind: 'ai' | 'template'; status: 'running' | 'done' | 'failed'; option_ids: string[]; notice: string | null; error: string | null }

const studio = (eventId: string): string => `/api/admin/comms-hub/events/${eventId}/thumbnails`;

export async function listThumbnails(eventId: string): Promise<StudioView> {
  const { data } = await api.get<StudioView>(studio(eventId));
  return data;
}
export async function generateThumbnails(eventId: string, input: { style: StudioStyle; headline: string; supporting: string | null; show_when: boolean }): Promise<ThumbJob> {
  const { data } = await api.post<{ job: ThumbJob }>(`${studio(eventId)}/generate`, input);
  return data.job;
}
export async function getThumbnailJob(eventId: string, jobId: string): Promise<ThumbJob> {
  const { data } = await api.get<{ job: ThumbJob }>(`${studio(eventId)}/jobs/${jobId}`);
  return data.job;
}
export async function changeThumbnail(eventId: string, thumbId: string, request: string): Promise<{ job: ThumbJob; summary: string }> {
  const { data } = await api.post<{ job: ThumbJob; summary: string }>(`${studio(eventId)}/${thumbId}/change`, { request });
  return data;
}
export async function chooseThumbnail(eventId: string, thumbId: string): Promise<string> {
  const { data } = await api.post<{ thumbnail_id: string }>(`${studio(eventId)}/${thumbId}/use`);
  return data.thumbnail_id;
}
export async function downloadThumbnail(eventId: string, thumbId: string, size: ThumbSize): Promise<Blob> {
  const { data } = await api.get<Blob>(`${studio(eventId)}/${thumbId}/download`, { params: { size }, responseType: 'blob' });
  return data;
}
export async function uploadThumbnail(eventId: string, file: File, altText: string): Promise<string> {
  const form = new FormData();
  form.append('alt_text', altText);
  form.append('file', file);
  const { data } = await api.post<{ id: string }>(`${studio(eventId)}/upload`, form, MULTIPART);
  return data.id;
}

/* Live panel (CH5.2: backend/src/routes/admin/commsHubLiveRoutes.ts). */
export interface LiveCommand { command: 'enter_backstage' | 'return_to_scheduled' | 'go_live' | 'end'; available: boolean; reason?: string }
export interface LivePanelView {
  input_configured: boolean;
  occurrence: { id: string; editorial_state: string; provider_health: string; version: number; scheduled_start_at: string | null; content_started_at: string | null; ended_at: string | null } | null;
  commands: LiveCommand[];
  input_held_by: { occurrence_id: string; title: string; state: string } | null;
}
const live = (eventId: string): string => `/api/admin/comms-hub/events/${eventId}/live`;

export async function getLivePanel(eventId: string): Promise<LivePanelView> {
  const { data } = await api.get<LivePanelView>(live(eventId));
  return data;
}
export async function prepareLiveStream(eventId: string, startsAt: string | null = null): Promise<LivePanelView> {
  const { data } = await api.post<LivePanelView>(`${live(eventId)}/prepare`, { starts_at: startsAt });
  return data;
}
export async function sendLiveCommand(eventId: string, command: 'go_live' | 'end' | 'return_to_scheduled', expectedVersion: number): Promise<LivePanelView> {
  const { data } = await api.post<LivePanelView>(`${live(eventId)}/command`, { command, expected_version: expectedVersion });
  return data;
}
/** The Zoom push details. Only fetched when the organizer asks for them; never stored. */
export async function getLiveIngest(eventId: string): Promise<{ rtmps_url: string; stream_key: string }> {
  const { data } = await api.get<{ rtmps_url: string; stream_key: string }>(`${live(eventId)}/ingest`);
  return data;
}

/* Promotion plan (CH6.4: backend/src/routes/admin/commsHubPlanRoutes.ts). */
export type PlanKind = 'announcement' | 'reminder' | 'starting_soon' | 'recording_thanks';
export type HubMessageStatus = 'draft' | 'needs_approval' | 'approved' | 'scheduled' | 'sending' | 'sent' | 'partially_failed' | 'failed' | 'cancelled';
export interface PlanRow {
  kind: PlanKind; label: string; timing: string; channels: string; ticked: boolean;
  next: { message_id: string; status: HubMessageStatus; send_at: string | null; occurrence: string } | null;
}
export interface PlanView { event_id: string; rows: PlanRow[] }
export interface PlanResult { created: number; existing: number; skipped: Array<{ kind: PlanKind; occurrence: string; reason: string }> }

export async function getPromotionPlan(eventId: string): Promise<PlanView> {
  const { data } = await api.get<PlanView>(`/api/admin/comms-hub/events/${eventId}/plan`);
  return data;
}
export async function savePromotionPlan(eventId: string, kinds: PlanKind[]): Promise<PlanView & { result: PlanResult }> {
  const { data } = await api.put<PlanView & { result: PlanResult }>(`/api/admin/comms-hub/events/${eventId}/plan`, { kinds });
  return data;
}
