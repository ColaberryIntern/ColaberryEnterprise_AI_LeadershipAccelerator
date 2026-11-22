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
  /** CH9.5: set when this hub event manages an Eventbrite event; its title, times and link come from Eventbrite. */
  ccpp_event_id: string | null;
  /** CH9.5: when it was found missing from Eventbrite's public list, or null. */
  ccpp_missing_since: string | null;
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

/* Eventbrite events (CH9.2), read-only from the CCPP mirror: backend commsHubEventbriteRoutes.ts. */
export type EventbriteWindow = 'upcoming' | 'past';
export interface EventbriteEvent {
  ccpp_event_id: string;
  title: string;
  /** CH9.5: copied into the hub event when it is managed there. */
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_url: string | null;
  image_url: string | null;
  /** People registered (Eventbrite plus our site), or null when unknown. */
  registered: number | null;
  eventbrite_status: string;
  /** CH9.5: the hub event managing this Eventbrite event, or null. */
  adopted_event_id: string | null;
}

/** CH9.5 "Manage in the hub": creates (201) or finds (200) the hub event for this Eventbrite event. */
export async function adoptEventbriteEvent(ccppEventId: string): Promise<HubEvent> {
  if (!/^\d{1,20}$/.test(ccppEventId)) throw new Error('Not an Eventbrite event id.');
  const { data } = await api.post<{ event: HubEvent }>(`/api/admin/comms-hub/eventbrite-events/${ccppEventId}/adopt`);
  return data.event;
}
/** 'unavailable' and 'not_configured' are never shown as "no events". */
export interface EventbriteList { status: 'ok' | 'unavailable' | 'not_configured'; window: EventbriteWindow; events: EventbriteEvent[]; fetched_at: string }

export async function listEventbriteEvents(window: EventbriteWindow = 'upcoming'): Promise<EventbriteList> {
  const { data } = await api.get<EventbriteList>('/api/admin/comms-hub/eventbrite-events', { params: { window } });
  return data;
}

/* Registrants (CH9.3). People's names and emails: no query string ever (a "Report a problem"
   capture of a failed request keeps query strings), search happens on the loaded rows, and nothing
   here logs a registrant to the console. */
export interface Registrant { name: string; email: string; registered_at: string | null; sources: Array<'eventbrite' | 'site'>; has_account: boolean }
export interface RegistrantList {
  event: { ccpp_event_id: string; title: string; starts_at: string };
  eventbrite: 'ok' | 'unavailable' | 'not_configured';
  count: number;
  rows: Registrant[];
}

export function registrantsPath(ccppEventId: string, csv = false): string {
  if (!/^\d{1,20}$/.test(ccppEventId)) throw new Error('Not an Eventbrite event id.');
  return `/api/admin/comms-hub/eventbrite-events/${ccppEventId}/registrants${csv ? '.csv' : ''}`;
}

export async function getRegistrants(ccppEventId: string): Promise<RegistrantList> {
  const { data } = await api.get<RegistrantList>(registrantsPath(ccppEventId));
  return data;
}

/** The CSV as a file, plus the filename the server chose. */
export async function downloadRegistrantsCsv(ccppEventId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get<Blob>(registrantsPath(ccppEventId, true), { responseType: 'blob' });
  const disposition = String((res.headers as Record<string, unknown>)?.['content-disposition'] ?? '');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `registrants-${ccppEventId}.csv`;
  return { blob: res.data, filename };
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

/** What cancelling an event also did (CH7.3); null when it was already cancelled. */
export interface CancelCascade {
  messages_cancelled: number; deliveries_cancelled: number; sending_voided: number;
  broadcast: 'cancelled' | 'none' | 'failed'; draft_message_id: string | null;
}
export async function cancelHubEvent(id: string): Promise<{ event: HubEvent; cancellation: CancelCascade | null }> {
  const { data } = await api.post<{ event: HubEvent; cancellation: CancelCascade | null }>(`/api/admin/comms-hub/events/${id}/cancel`);
  return data;
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

/* Compose (CH6.5: backend/src/routes/admin/commsHubMessageRoutes.ts). */
export type MessageKind = 'announcement' | 'reminder' | 'starting_soon' | 'recording_thanks' | 'time_change' | 'cancellation' | 'update' | 'other';
export type Tone = 'friendly' | 'professional' | 'urgent';
export type Channel = 'community_post' | 'in_app';
export interface DraftView { id: string; channel: Channel; version: number; title: string | null; body: string; author: string; instruction: string | null; created_at: string }
/** CH9.6 'event_registrants': target_id is the hub event id of a managed Eventbrite event (in-app only). */
export interface DestinationView { id?: string; channel: Channel; target_type: 'cohort_feed' | 'in_app_audience' | 'event_registrants'; target_id: string; label: string | null; has_delivery?: boolean; reason?: string }
export interface MessageView {
  id: string; status: HubMessageStatus; kind: MessageKind; tone: Tone | null; notes: string | null; subject: string | null;
  include: { thumbnail?: boolean; join_link?: boolean; registration_link?: boolean }; send_at: string | null; created_by: string | null;
  plan_kind: PlanKind | null; occurrence_starts_at: string | null;
  event: { id: string; title: string; when: string; thumbnail_id: string | null } | null;
  drafts: Partial<Record<Channel, DraftView>>; versions: DraftView[]; destinations: DestinationView[];
  approval: { id: string; approved_by: string; approved_at: string } | null; problems: string[]; recommended: DestinationView[];
}
const messages = '/api/admin/comms-hub/messages';
const one = async (p: Promise<{ data: { message: MessageView } }>): Promise<MessageView> => (await p).data.message;

export async function createMessage(input: { event_id?: string | null; subject?: string | null; kind: MessageKind; tone?: Tone | null; notes?: string | null; include?: MessageView['include'] }): Promise<MessageView> {
  return one(api.post(messages, input));
}
export async function getMessage(id: string): Promise<MessageView> { return one(api.get(`${messages}/${id}`)); }
export async function regenerateMessage(id: string, instruction: 'shorter' | 'warmer' | 'more_detail'): Promise<MessageView> { return one(api.post(`${messages}/${id}/regenerate`, { instruction })); }
export async function editMessageDraft(id: string, channel: Channel, text: { title?: string | null; body: string }): Promise<MessageView> { return one(api.post(`${messages}/${id}/drafts`, { channel, ...text })); }
export async function setMessageDestinations(id: string, destinations: DestinationView[]): Promise<MessageView> {
  return one(api.put(`${messages}/${id}/destinations`, { destinations: destinations.map(({ channel, target_type, target_id, label }) => ({ channel, target_type, target_id, label })) }));
}
export async function setMessageSendTime(id: string, sendAt: string | null): Promise<MessageView> { return one(api.put(`${messages}/${id}/send-time`, { send_at: sendAt })); }
export async function messageAction(id: string, action: 'submit' | 'approve' | 'undo' | 'cancel'): Promise<MessageView> { return one(api.post(`${messages}/${id}/${action}`)); }
export async function rejectHubMessage(id: string, note: string | null): Promise<MessageView> { return one(api.post(`${messages}/${id}/reject`, { note })); }
/** CH9.6: with the message's event, a managed Eventbrite event's registrants are offered too. */
export async function getDestinationOptions(eventId: string | null = null): Promise<DestinationView[]> {
  const { data } = await api.get<{ destinations: DestinationView[] }>(`${messages}/destination-options`, eventId ? { params: { event_id: eventId } } : undefined);
  return data.destinations;
}

/** CH9.7: registered / watched live / watched the replay; each a number, or null with the reason it is not known. */
export interface HubCount { value: number | null; reason: string | null }
export interface HubEventCounts { registered: HubCount; watched_live: HubCount; watched_replay: HubCount }
export async function getEventCounts(hubEventId: string): Promise<HubEventCounts> {
  const { data } = await api.get<HubEventCounts>(`/api/admin/comms-hub/events/${encodeURIComponent(hubEventId)}/counts`);
  return data;
}

/** CH9.6: how many of an event's registrants have platform accounts (counts only, never people). */
export interface RegistrantReach { registrants: number; reachable: number; eventbrite: 'ok' | 'unavailable' | 'not_configured' }
export async function getRegistrantReach(hubEventId: string): Promise<RegistrantReach> {
  const { data } = await api.get<RegistrantReach>(`/api/admin/comms-hub/events/${encodeURIComponent(hubEventId)}/registrant-reach`);
  return data;
}
/** The validator's problems from a refused submit/approve, or []. */
export function apiProblems(err: unknown): string[] {
  const p = (err as { response?: { data?: { problems?: unknown } } })?.response?.data?.problems;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
}

/* Today and Schedule & history (CH7.4: backend/src/routes/admin/commsHubBoardRoutes.ts). */
export type BoardScope = 'approval' | 'schedule' | 'history';
export interface BoardRow {
  id: string; status: HubMessageStatus; kind: MessageKind; title: string;
  event: { id: string; title: string; thumbnail_id: string | null } | null;
  send_at: string | null; updated_at: string;
  destinations: Array<{ channel: Channel; label: string | null }>;
  preview: string | null;
  include: { thumbnail: boolean; join_link: boolean; registration_link: boolean };
  approved_by: string | null;
  deliveries: { total: number; sent: number; failed: number; pending: number; cancelled: number };
  failure: { reason: string; missed: string[]; attempts: number } | null;
}
export interface BoardFilter { status?: HubMessageStatus[]; channel?: Channel | null; event_id?: string | null; limit?: number }
export async function getBoard(scope: BoardScope, f: BoardFilter = {}): Promise<BoardRow[]> {
  const params: Record<string, string | number> = { scope };
  if (f.status?.length) params.status = f.status.join(',');
  if (f.channel) params.channel = f.channel;
  if (f.event_id) params.event_id = f.event_id;
  if (f.limit) params.limit = f.limit;
  const { data } = await api.get<{ rows: BoardRow[] }>('/api/admin/comms-hub/board', { params });
  return data.rows;
}
export interface HubSettings {
  sending_paused: boolean; quiet_hours: { start: string; end: string } | null; alert_recipients: string[];
  test_cohort: { id: string; name: string } | null; updated_at: string | null;
}
export async function getHubSettings(): Promise<HubSettings> { return (await api.get<HubSettings>('/api/admin/comms-hub/settings')).data; }
export async function saveHubSettings(patch: { quiet_hours?: HubSettings['quiet_hours']; alert_recipients?: string[]; test_cohort_id?: string | null }): Promise<HubSettings> {
  return (await api.put<HubSettings>('/api/admin/comms-hub/settings', patch)).data;
}
export async function setSendingPaused(paused: boolean): Promise<HubSettings> {
  return (await api.post<HubSettings>('/api/admin/comms-hub/settings/pause', { paused })).data;
}
export interface ActivityRow { id: string; at: string; who: string; did: string; about: string | null; entity_type: string; entity_id: string | null }
export async function getActivity(limit = 20): Promise<ActivityRow[]> {
  return (await api.get<{ activity: ActivityRow[] }>('/api/admin/comms-hub/activity', { params: { limit } })).data.activity;
}
/** Try the recipients that missed a partly sent or failed message again (CH7.2 route). */
export async function retryHubMessage(id: string): Promise<MessageView> { return one(api.post(`${messages}/${id}/retry`)); }

/** CH10.1: the WhatsApp channel's state. Never carries the token or the full number. */
export type WhatsAppState = 'not_configured' | 'connected' | 'waiting_for_qr' | 'disconnected';
export interface WhatsAppStatus { configured: boolean; enabled: boolean; state: WhatsAppState; number_last4: string | null; reason: string | null }
export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const { data } = await api.get<WhatsAppStatus>('/api/admin/comms-hub/whatsapp/status');
  return data;
}

/** CH10.2: the number's WhatsApp groups. Every group starts switched off. */
export interface WhatsAppGroup {
  id: string; name: string; participants_count: number; enabled: boolean; sendable: boolean; cant_send_reason: string | null; last_synced_at: string;
}
export interface WhatsAppSyncResult { listed: number; added: number; left: number }
export async function listWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  return (await api.get<{ groups: WhatsAppGroup[] }>('/api/admin/comms-hub/whatsapp/groups')).data.groups;
}
export async function syncWhatsAppGroups(): Promise<WhatsAppSyncResult> {
  return (await api.post<WhatsAppSyncResult>('/api/admin/comms-hub/whatsapp/groups/sync')).data;
}
export async function setWhatsAppGroupEnabled(id: string, enabled: boolean): Promise<WhatsAppGroup> {
  return (await api.put<{ group: WhatsAppGroup }>(`/api/admin/comms-hub/whatsapp/groups/${encodeURIComponent(id)}`, { enabled })).data.group;
}
