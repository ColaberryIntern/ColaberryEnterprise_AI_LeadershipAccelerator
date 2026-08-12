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
  // Zoom returns these on every recording file; they were simply not declared
  // here before, which is part of why selection had no notion of WHEN a
  // recording happened and could not tell a pre-class test from the class.
  recording_start?: string;
  recording_end?: string;
}
interface ZoomRecordingMeeting {
  id: number;
  uuid: string;
  topic: string;
  recording_files: ZoomRecordingFile[];
  start_time?: string;
  duration?: number; // minutes
}

/** When a recording instance actually ran, preferring per-file timings. */
function instanceTiming(meeting: ZoomRecordingMeeting): { startedAt: Date | null; endedAt: Date | null } {
  const files = (meeting.recording_files || []).filter((f) => f.recording_start || f.recording_end);
  const starts = files.map((f) => f.recording_start).filter(Boolean).map((s) => new Date(s as string).getTime());
  const ends = files.map((f) => f.recording_end).filter(Boolean).map((s) => new Date(s as string).getTime());

  let startMs = starts.length ? Math.min(...starts) : NaN;
  let endMs = ends.length ? Math.max(...ends) : NaN;

  // Fall back to the meeting-level start_time + duration when the files carry
  // no timings of their own.
  if (Number.isNaN(startMs) && meeting.start_time) startMs = new Date(meeting.start_time).getTime();
  if (Number.isNaN(endMs) && !Number.isNaN(startMs) && typeof meeting.duration === 'number') {
    endMs = startMs + meeting.duration * 60_000;
  }

  return {
    startedAt: Number.isNaN(startMs) ? null : new Date(startMs),
    endedAt: Number.isNaN(endMs) ? null : new Date(endMs),
  };
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
function toRecordingMatch(meeting: ZoomRecordingMeeting, fallbackName?: string): ZoomRecordingMatch | null {
  if (!meeting.recording_files?.length) return null;
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

export async function findRecordingByMeetingId(
  meetingId: string,
  dateHint: string,
  fallbackName?: string,
): Promise<ZoomRecordingMatch | null> {
  const meetings = await listRecordings(dateHint, addDays(dateHint, 1));
  const meeting = meetings.find((m) => String(m.id) === meetingId);
  return meeting ? toRecordingMatch(meeting, fallbackName) : null;
}

export async function findRecordingForSession(session: LiveSession): Promise<ZoomRecordingMatch | null> {
  if (!session.zoom_meeting_id) return null;
  return findRecordingByMeetingId(session.zoom_meeting_id, session.session_date, session.title);
}

export interface ZoomRecordingInstance {
  uuid: string;
  match: ZoomRecordingMatch;
  /** When this instance's recording actually started/ended (UTC). */
  startedAt?: Date | null;
  endedAt?: Date | null;
}

/**
 * Does a recording instance overlap the scheduled class window?
 *
 * This is the selection rule that stops a pre-class test start being mistaken
 * for the class. Real incident (Week 2 Build Day, 2026-08-06, a 6:30-8:30pm CT
 * class): Zoom held SIX instances for the meeting — four throwaway starts
 * between 5:27 and 6:00pm, then the class itself in two parts because the
 * meeting was restarted at the break. The old selector took the first match by
 * meeting id, so it stored a 5-minute 0.8MB test and the 93MB + 178MB real
 * recordings were never ingested.
 *
 * The rule is: the recording must overlap the (generously padded) class period
 * by at least `minOverlapMs`. The minimum-overlap requirement is what actually
 * does the work; the padding only stops a legitimate early start or an
 * overrunning class from being discarded.
 *
 * Bare interval overlap is NOT enough, which is worth recording because it is
 * the obvious first answer and it is wrong. One of the throwaway starts above
 * ran 23:00:57 -> 23:01:25 UTC against a 23:30 class start; with any early
 * grace of 30 minutes or more it touches the padded window and would be
 * selected on a technicality. Requiring real overlap separates the cases by a
 * wide margin rather than by a tuned boundary — on the real data the four
 * tests score 0 and 0.5 minutes while the two class parts score 71 and 83.
 *
 * Padding is asymmetric on purpose:
 *   - before: Part 1 began 14 minutes BEFORE the scheduled start, so a
 *     "starts inside the window" rule would have dropped half the class.
 *   - after: Part 2 ran 23 minutes past the scheduled end, and a class that
 *     overruns and gets restarted should still be captured.
 *
 * Trade-off accepted and documented: a genuinely short clip (say an instructor
 * recording only the last 5 minutes) scores below the floor and is skipped.
 * That is the safer failure — it lands as "no recording", which is visible,
 * rather than as a wrong recording presented to students as the class.
 */
export function recordingOverlapsWindow(
  instance: Pick<ZoomRecordingInstance, 'startedAt' | 'endedAt'>,
  windowStart: Date,
  windowEnd: Date,
  opts: { graceBeforeMs?: number; graceAfterMs?: number; minOverlapMs?: number } = {},
): boolean {
  const start = instance.startedAt;
  const end = instance.endedAt ?? instance.startedAt;
  // No timing from the provider — cannot prove it belongs to this class, and
  // guessing is exactly what caused the incident. Excluded, not included.
  if (!start || !end) return false;

  const graceBefore = opts.graceBeforeMs ?? 30 * 60 * 1000;
  const graceAfter = opts.graceAfterMs ?? 60 * 60 * 1000;
  const minOverlap = opts.minOverlapMs ?? 10 * 60 * 1000;

  const from = windowStart.getTime() - graceBefore;
  const to = windowEnd.getTime() + graceAfter;

  const overlapMs = Math.min(end.getTime(), to) - Math.max(start.getTime(), from);
  return overlapMs >= minOverlap;
}

// Same numeric meeting ID matching as findRecordingByMeetingId, but returns
// EVERY completed recording instance in the window instead of the first —
// needed for always-open Rooms (see sessionRecordingService.ingestRecordingForRoom),
// whose meeting_link is reused indefinitely (joinVideoRoom mints it once and
// every join reuses it), so "one meeting ID" can legitimately have many
// distinct recordings over time, each with its own `uuid`. Callers dedupe by
// uuid — this function does not, since it has no notion of "already ingested."
export async function findRecordingInstancesByMeetingId(
  meetingId: string,
  fromDate: string,
  toDate: string,
  fallbackName?: string,
): Promise<ZoomRecordingInstance[]> {
  const meetings = await listRecordings(fromDate, toDate);
  const out: ZoomRecordingInstance[] = [];
  for (const meeting of meetings) {
    if (String(meeting.id) !== meetingId) continue;
    const match = toRecordingMatch(meeting, fallbackName);
    if (match) out.push({ uuid: meeting.uuid, match, ...instanceTiming(meeting) });
  }
  return out;
}

/**
 * Every recording instance that plausibly IS this class, earliest first.
 *
 * Replaces "first instance whose meeting id matches" for the session path.
 * Two changes, both load-bearing:
 *   - filters by recordingOverlapsWindow, so pre-class test starts are not
 *     mistaken for the class (see that function for the incident);
 *   - returns ALL matches, because a class restarted at the break is genuinely
 *     two recordings and returning one silently loses half of it.
 *
 * The date range is widened a day either side of the session date so a class
 * that runs past midnight UTC — every evening Central class does — is not cut
 * in half by the list-API's date filtering.
 */
export async function findClassRecordingInstances(
  meetingId: string,
  sessionDate: string,
  windowStart: Date,
  windowEnd: Date,
  fallbackName?: string,
): Promise<ZoomRecordingInstance[]> {
  const instances = await findRecordingInstancesByMeetingId(
    meetingId, addDays(sessionDate, -1), addDays(sessionDate, 1), fallbackName,
  );
  return instances
    .filter((i) => recordingOverlapsWindow(i, windowStart, windowEnd))
    .sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
}

// Pulls the numeric Zoom meeting ID out of a join URL like
// https://colaberry.zoom.us/j/89581408269?pwd=... — CommunityRoom has no
// separate "meeting_provider" column (only RoomBooking does), so for
// always-open Rooms the URL shape IS the provider signal.
export function extractZoomMeetingId(meetingLink: string | null | undefined): string | null {
  if (!meetingLink) return null;
  const match = meetingLink.match(/zoom\.us\/j\/(\d+)/);
  return match ? match[1] : null;
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
