import crypto from 'crypto';
import { Readable } from 'stream';
import { env } from '../config/env';
import LiveSession from '../models/LiveSession';

// Zoom Server-to-Server OAuth + Cloud Recording access — replaces
// driveService.ts (Google Meet/Drive) as the class meeting/recording
// provider. See meetingService.ts for where meetings actually get created,
// and sessionRecordingService.ts for how a found recording gets attached to
// a session's Room. Mirrors driveService.ts's shape (findRecordingForSession
// / stream*File) so sessionRecordingService can dispatch to either provider
// through the same small interface.

const TOKEN_URL = 'https://zoom.us/oauth/token';
const API_BASE = 'https://api.zoom.us/v2';
const API_TIMEOUT_MS = 15_000; // small/fast calls only — the file stream below is unbounded, matching driveService.streamDriveFile

function assertConfigured(): void {
  if (!env.zoomAccountId || !env.zoomClientId || !env.zoomClientSecret || !env.zoomHostEmail) {
    throw new Error('Zoom not configured');
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- Server-to-Server OAuth ----
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  assertConfigured();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const basicAuth = Buffer.from(`${env.zoomClientId}:${env.zoomClientSecret}`).toString('base64');
  const res = await fetchWithTimeout(
    `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(env.zoomAccountId)}`,
    { method: 'POST', headers: { Authorization: `Basic ${basicAuth}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zoom OAuth token error ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedToken.token;
}

async function zoomApiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetchWithTimeout(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[Zoom] API error ${res.status} ${method} ${path}: ${errBody}`);
    throw new Error(`Zoom API error ${res.status}: ${errBody}`);
  }
  // PATCH/DELETE meeting calls return 204 with no body — res.json() would throw.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Whether the Zoom integration is configured in this env. */
export function isZoomConfigured(): boolean {
  return Boolean(env.zoomAccountId && env.zoomClientId && env.zoomClientSecret && env.zoomHostEmail);
}

// ---- Webhook verification ----
// Mirrors paysimpleService.verifyWebhookSignature's exact pattern: reject
// (not warn-and-accept) if the secret is configured but the request has no
// signature, and use a timing-safe, length-guarded compare. Zoom's scheme:
// message = "v0:{timestamp}:{raw_body}", HMAC-SHA256 with the webhook
// Secret Token (NOT the Client Secret), expected value prefixed "v0=".
export function verifyZoomWebhookSignature(
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  if (!env.zoomWebhookSecretToken) {
    console.warn('[Zoom] No webhook secret token configured — skipping signature check');
    return true;
  }
  if (!signature || !timestamp) {
    console.warn('[Zoom] Webhook secret IS configured but request is missing signature/timestamp headers — rejecting');
    return false;
  }

  const message = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', env.zoomWebhookSecretToken).update(message).digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// One-time challenge Zoom sends when the webhook endpoint URL is first
// registered (or changed) in the Marketplace app — the handler must answer
// with { plainToken, encryptedToken } within 3s for the subscription to save.
export function computeZoomWebhookEncryptedToken(plainToken: string): string {
  if (!env.zoomWebhookSecretToken) {
    throw new Error('Zoom webhook secret token not configured');
  }
  return crypto.createHmac('sha256', env.zoomWebhookSecretToken).update(plainToken).digest('hex');
}

// ---- Meeting creation ----
export interface ZoomMeetingResult {
  joinUrl: string;
  meetingId: string;
}

export interface CreateZoomMeetingInput {
  topic: string;
  agenda?: string;
  startDateTime: string; // e.g. "2026-08-04T18:30:00"
  durationMinutes: number;
  timezone?: string;
}

// Creates a meeting under ZOOM_HOST_EMAIL with cloud auto-recording, so
// capture never depends on a human remembering to click Record — the
// specific failure mode that left 2 real classes unrecorded under the old
// Google Meet flow. `auto_recording: 'cloud'` can silently no-op if the
// Zoom account's own "Automatic recording" admin setting is off (a
// documented Zoom quirk: the API call succeeds but doesn't actually apply)
// — that account-level toggle is a one-time prerequisite done outside code.
// The generic entry point — both meetingService.ts (official class sessions)
// and communityRooms/meetingProvider.ts's ZoomMeetAdapter (general Room
// bookings) go through this one function, so the settings that matter
// (auto_recording chief among them) can't drift between the two call sites.
export async function createMeeting(input: CreateZoomMeetingInput): Promise<ZoomMeetingResult> {
  assertConfigured();
  const data = await zoomApiRequest<any>('POST', `/users/${encodeURIComponent(env.zoomHostEmail)}/meetings`, {
    topic: input.topic,
    agenda: input.agenda || '',
    type: 2, // scheduled
    start_time: input.startDateTime,
    duration: input.durationMinutes,
    timezone: input.timezone || 'America/Chicago',
    settings: {
      auto_recording: 'cloud',
      join_before_host: true,
      waiting_room: false,
    },
  });
  return { joinUrl: data.join_url, meetingId: String(data.id) };
}

export async function createMeetingForSession(
  session: LiveSession,
  opts: { startDateTime: string; durationMinutes: number },
): Promise<ZoomMeetingResult> {
  return createMeeting({
    topic: `[Accelerator] ${session.title}`,
    agenda: session.description || `Session ${session.session_number}`,
    startDateTime: opts.startDateTime,
    durationMinutes: opts.durationMinutes,
  });
}

export interface UpdateZoomMeetingInput {
  topic?: string;
  agenda?: string;
  startDateTime?: string;
  durationMinutes?: number;
  timezone?: string;
}

// Reschedule/rename an existing meeting. Not currently called by anything in
// this codebase (the general Room-booking flow doesn't yet support editing a
// published booking's time) — implemented for MeetingProvider interface
// parity with GoogleMeetAdapter. Needs the `meeting:update:meeting:admin`
// scope added to the Zoom app before first real use.
export async function updateMeeting(meetingId: string, patch: UpdateZoomMeetingInput): Promise<void> {
  assertConfigured();
  const body: Record<string, unknown> = {};
  if (patch.topic !== undefined) body.topic = patch.topic;
  if (patch.agenda !== undefined) body.agenda = patch.agenda;
  if (patch.startDateTime !== undefined) body.start_time = patch.startDateTime;
  if (patch.durationMinutes !== undefined) body.duration = patch.durationMinutes;
  if (patch.timezone !== undefined) body.timezone = patch.timezone;
  await zoomApiRequest('PATCH', `/meetings/${encodeURIComponent(meetingId)}`, body);
}

// Not currently called by anything in this codebase (no "cancel booking also
// cancels the Zoom meeting" wiring exists yet). Interface parity with
// GoogleMeetAdapter; needs `meeting:delete:meeting:admin` scope before first
// real use.
export async function cancelMeeting(meetingId: string): Promise<void> {
  assertConfigured();
  await zoomApiRequest('DELETE', `/meetings/${encodeURIComponent(meetingId)}`);
}

// Not currently called by anything in this codebase — the join URL is
// already stored on the booking/session at creation time, so nothing needs
// to re-fetch it. Interface parity with GoogleMeetAdapter; needs
// `meeting:read:meeting:admin` scope before first real use.
export async function getMeetingJoinUrl(meetingId: string): Promise<string | null> {
  assertConfigured();
  const data = await zoomApiRequest<any>('GET', `/meetings/${encodeURIComponent(meetingId)}`);
  return data?.join_url || null;
}

// ---- Recording lookup ----
export interface ZoomRecordingMatch {
  downloadUrl: string;
  downloadToken?: string; // present when sourced from a webhook payload; absent when sourced from the polling backfill (uses the S2S bearer token instead)
  name: string;
  mimeType: string;
  sizeBytes: number | null;
}

interface ZoomRecordingFile {
  file_type: string;
  file_size: number;
  download_url: string;
}
interface ZoomRecordingMeeting {
  id: number;
  topic: string;
  recording_files: ZoomRecordingFile[];
}

// The recordings-list response is memoized per (from, to) window for ~90s —
// a cron sweeping several candidate sessions in the same tick would
// otherwise re-request the near-identical date range once per session.
let listCache: { key: string; expiresAt: number; meetings: ZoomRecordingMeeting[] } | null = null;

async function listRecordings(fromDate: string, toDate: string): Promise<ZoomRecordingMeeting[]> {
  const key = `${fromDate}:${toDate}`;
  const now = Date.now();
  if (listCache && listCache.key === key && listCache.expiresAt > now) return listCache.meetings;

  const data = await zoomApiRequest<any>(
    'GET',
    `/users/${encodeURIComponent(env.zoomHostEmail)}/recordings?from=${fromDate}&to=${toDate}&page_size=100`,
  );
  const meetings: ZoomRecordingMeeting[] = data.meetings || [];
  listCache = { key, expiresAt: now + 90_000, meetings };
  return meetings;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Matches by exact numeric Zoom meeting ID (set at creation time — see
// createMeetingForSession / meetingService.ts) instead of Drive's old
// timestamp-proximity guess. Never throws for "not found" — recording is
// still effectively a per-meeting setting that could be off; only real
// API/config failures throw. The generic entry point — both
// findRecordingForSession (official class sessions) and
// sessionRecordingService.ingestRecordingForBooking (general Room bookings)
// go through this, since matching only ever needs a meeting ID + a date to
// pick the right day-window, never the whole LiveSession/RoomBooking shape.
export async function findRecordingByMeetingId(
  meetingId: string,
  dateHint: string,
  fallbackName?: string,
): Promise<ZoomRecordingMatch | null> {
  const meetings = await listRecordings(dateHint, addDays(dateHint, 1));
  const meeting = meetings.find((m) => String(m.id) === meetingId);
  if (!meeting || !meeting.recording_files?.length) return null;

  const mp4s = meeting.recording_files.filter((f) => f.file_type === 'MP4');
  if (!mp4s.length) return null;
  // Pause/resume can produce more than one MP4 for the same meeting — the
  // largest file is the real one, not necessarily whichever comes first.
  const best = mp4s.reduce((a, b) => (b.file_size > a.file_size ? b : a));

  return {
    downloadUrl: best.download_url,
    name: `${meeting.topic || fallbackName || 'recording'}.mp4`,
    mimeType: 'video/mp4',
    sizeBytes: best.file_size ?? null,
  };
}

export async function findRecordingForSession(session: LiveSession): Promise<ZoomRecordingMatch | null> {
  if (!session.zoom_meeting_id) return null;
  return findRecordingByMeetingId(session.zoom_meeting_id, session.session_date, session.title);
}

// Streams a Zoom recording's bytes — never buffers the whole file in memory
// (mirrors driveService.streamDriveFile; the backend runs with a capped
// heap). A webhook-delivered match carries its own short-lived
// downloadToken (query-param auth, no extra OAuth round-trip); the
// backfill/polling path has no such token and falls back to the S2S bearer.
export async function streamZoomFile(match: ZoomRecordingMatch): Promise<Readable> {
  let url = match.downloadUrl;
  const headers: Record<string, string> = {};
  if (match.downloadToken) {
    url += `${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(match.downloadToken)}`;
  } else {
    headers.Authorization = `Bearer ${await getAccessToken()}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) {
    throw new Error(`Zoom recording download error ${res.status}`);
  }
  return Readable.fromWeb(res.body as any);
}
