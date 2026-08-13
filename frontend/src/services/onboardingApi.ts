import portalApi from '../utils/portalApi';
import { getParticipantToken } from '../utils/participantToken';
import type { Band } from './bandLadder';

// Re-export the pure 5-band mirror so callers have one import surface for the
// ladder. The pure module (bandLadder.ts) stays network-free for its unit test.
export type { Band } from './bandLadder';
export { BAND_RUNGS, bandRungForPoints, bandRungForLevel, bandHudNext } from './bandLadder';

// ── Shapes returned by the Phase-1 onboarding endpoints (S1–S5) ──────────────

export interface PointsEvent {
  event_type: string;
  event_key: string;
  points: number;
  created_at: string;
  metadata: any;
}
export interface PointsSummary {
  total: number;
  events: PointsEvent[];
  // Additive (present once the backend exposes them; older clients ignore them).
  // The frontend only reads `band` when `fiveBandUiEnabled` is true.
  band?: Band;
  fiveBandUiEnabled?: boolean;
}

// Runtime cache of the 5-band UI flag, populated whenever the HUD fetches points
// (fetchPoints below). Lets flag-unaware presentational components (e.g.
// LevelBadge, rendered deep in community lists that never fetch points) switch at
// runtime without prop-drilling or a rebuild. Seeded from localStorage for a
// flash-free first paint; defaults false so flag-off is byte-identical.
function readCachedFiveBand(): boolean {
  try { return localStorage.getItem('te_five_band_ui') === '1'; } catch { return false; }
}
let fiveBandUi: boolean = readCachedFiveBand();
export function isFiveBandUiEnabled(): boolean { return fiveBandUi; }

export interface OpenHouseView {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  timezone: string;
  registration_url: string | null;
  meeting_link: string | null;
}
export interface FirstClassView {
  start_date: string;
  core_day: string | null;
  core_time: string | null;
  timezone: string | null;
  cohort_name: string | null;
  source: 'my_cohort' | 'next_open_cohort';
}
export interface OnboardingSchedule {
  next_open_house: OpenHouseView | null;
  my_rsvp: boolean;
  first_class: FirstClassView | null;
  is_explorer?: boolean;      // free Explorer tier — drives the Today conversion funnel
  is_staff?: boolean;         // community_members.role === 'staff' — never gated by <PageGate>
  has_full_access?: boolean;  // page-level paywall signal (separate flag from is_explorer) — see useEntitlement
}

export interface ResumeProfileFields {
  full_name?: string; title?: string; company?: string; company_size?: string; phone?: string; linkedin_url?: string;
}
export interface ResumePersonalization {
  industry?: string; role?: string; seniority?: string; years_experience?: string; skills?: string; goals?: string; location?: string; ai_maturity_level?: string;
}
export interface OnboardingProfileView {
  prefill: Record<string, any>;
  profile?: ResumeProfileFields;
  personalization?: ResumePersonalization;
  linkedin_url: string | null;
  has_resume: boolean;
  has_referral: boolean;
}

export interface SubmitReferralsResult { count: number; points_awarded: number; }

/** Submit 1+ friend recommendations (the "recommend a friend" onboarding step). */
export async function submitReferrals(friends: Array<{ name: string; email: string }>): Promise<SubmitReferralsResult> {
  const { data } = await portalApi.post<SubmitReferralsResult>('/api/portal/onboarding/referrals', { friends });
  return data;
}

export interface FreeSignupResult {
  jwt: string;
  enrollment: { id: string; full_name: string; email: string; tier: string };
  created: boolean;
}

/** Public: create (or reuse) a free guest account and get a participant session JWT. */
export async function freeSignup(body: { full_name: string; email: string }): Promise<FreeSignupResult> {
  const { data } = await portalApi.post<FreeSignupResult>('/api/portal/free-signup', body);
  return data;
}

export async function fetchPoints(): Promise<PointsSummary> {
  const { data } = await portalApi.get<PointsSummary>('/api/portal/points');
  // Cache the runtime UI flag for flag-unaware components (see isFiveBandUiEnabled).
  if (typeof data.fiveBandUiEnabled === 'boolean') {
    fiveBandUi = data.fiveBandUiEnabled;
    try { localStorage.setItem('te_five_band_ui', data.fiveBandUiEnabled ? '1' : '0'); } catch { /* ignore */ }
  }
  return data;
}

// ── Daily streak (server-authoritative, escalating) ──────────────────────────
export interface StreakDay { date: string; label: string; hit: boolean; is_today: boolean; }
export interface StreakView {
  count: number;
  claimed_today: boolean;
  week: StreakDay[];            // last 7 Central days, oldest → today
  total_streak_points: number;
  next_points: number;         // what a claim right now would award (0 if claimed)
}
export async function fetchStreak(): Promise<StreakView> {
  const { data } = await portalApi.get<StreakView>('/api/portal/streak');
  return data;
}

// ── Points drill-down: three lenses (engagement / skill XP / readiness) ───────
export interface DrilldownView {
  engagement: {
    total: number;
    streak_days: number;
    streak_points: number;
    recent: Array<{ event_type: string; points: number; created_at: string }>;
  };
  skill_xp: { learning: number; builder: number; community: number; total: number } | null;
  readiness: {
    pct: number;
    level: string;
    rank: number;
    next_level: string | null;
    at_max: boolean;
    gaps: string[];
  } | null;
}
export async function fetchPointsDrilldown(): Promise<DrilldownView> {
  const { data } = await portalApi.get<DrilldownView>('/api/portal/points/drilldown');
  return data;
}
export async function claimDailyStreak(): Promise<{ awarded: boolean; points: number; streak: StreakView }> {
  const { data } = await portalApi.post('/api/portal/streak/claim');
  return data;
}

export async function fetchSchedule(): Promise<OnboardingSchedule> {
  const { data } = await portalApi.get<OnboardingSchedule>('/api/portal/onboarding/schedule');
  return data;
}

// ── Next live class session (server-picked from live_sessions) ───────────────
export interface NextLiveSession {
  id: string;
  session_number: number;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'live';
  meeting_link: string | null;
  meeting_provider: string | null;
  timezone: string | null; // cohort IANA zone (e.g. America/Chicago) for the time label
  room_id: string | null; // linked Colaberry Commons room (the class's waiting room), if provisioned
}
/** The student's next scheduled/live class session, or null if none is upcoming. */
export async function getNextSession(): Promise<NextLiveSession | null> {
  const { data } = await portalApi.get<{ next_session: NextLiveSession | null }>('/api/portal/next-session');
  return data.next_session ?? null;
}

// ── A specific class session's detail — used by a Colaberry Commons room to
// render its class banner (countdown / live+join / recap) when the room is
// linked to an official class via CommunityRoom.linked_live_session_id. Same
// backing endpoint PortalSessionDetailPage uses. ──────────────────────────────
export interface ClassSessionInfo {
  id: string;
  session_number: number;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  meeting_link: string | null;
  recording_url: string | null;
}
export async function fetchClassSessionDetail(sessionId: string): Promise<ClassSessionInfo> {
  const { data } = await portalApi.get<{ session: ClassSessionInfo }>(`/api/portal/sessions/${sessionId}`);
  return data.session;
}

// ── The full list of the student's own cohort sessions — used by the Rooms
// page's "Your Classes" rail section so students can reach any class's room
// (completed or upcoming) without leaving Rooms. Same backing endpoint
// PortalSessionsPage uses. ────────────────────────────────────────────────
export interface MySession {
  id: string;
  session_number: number;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  room_id: string | null;
}
export async function fetchMySessions(): Promise<MySession[]> {
  const { data } = await portalApi.get<{ sessions: MySession[] }>('/api/portal/sessions');
  return data.sessions ?? [];
}

// ── Join a live session (records attendance + awards session_attended once) ───
export interface JoinSessionResult { ok: true; status: 'present' | 'late'; awarded: boolean; points: number; }
/** Record attendance for a live session. Idempotent — safe to call on every join
 *  click; awards the session_attended points only the first time. `source`
 *  only affects the instructor deck's presence-ticker copy (classroom check-in
 *  vs the portal's Join Meeting click) — attendance credit is identical either way. */
export async function joinSession(sessionId: string, source: 'classroom' | 'meet' = 'classroom'): Promise<JoinSessionResult> {
  const { data } = await portalApi.post<JoinSessionResult>(`/api/portal/sessions/${sessionId}/join`, { source });
  return data;
}

/** Best-effort "left the call tab" beacon, fired on page hide/unload. Uses a
 * manual keepalive fetch (not axios) so the request can survive the page
 * unloading — this is a proxy signal for the deck's ticker, not a reliable
 * presence system (no real join/leave webhook is wired up for this). */
export function leaveMeetingBeacon(sessionId: string): void {
  const token = getParticipantToken();
  if (!token) return;
  const base = process.env.REACT_APP_API_URL || '';
  fetch(`${base}/api/portal/sessions/${sessionId}/leave-meet`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }).catch(() => { /* best-effort */ });
}

/** Live class pulse state a student can broadcast from their phone. */
export type PulseState = 'here' | 'building' | 'stuck' | 'finished';

/** Set the student's live status for a session (lights up the instructor's deck). */
export async function setSessionPulse(sessionId: string, state: PulseState): Promise<void> {
  await portalApi.post(`/api/portal/sessions/${sessionId}/pulse`, { state });
}

/** Ask a question during class — reuses the session chat so it reaches the deck. */
export async function askSessionQuestion(sessionId: string, text: string): Promise<void> {
  await portalApi.post(`/api/portal/sessions/${sessionId}/chat`, { content: text });
}

/** A coding prompt broadcast to student phones during Build Mode. */
export interface BroadcastPrompt {
  label: string;
  prompt: string;
  pasteWhere?: string;
  ccMode?: string;
  expectedResult?: string;
  stopCondition?: string;
  rescue?: string;
}

/** The live view the student's phone should show — mirrors the instructor deck. */
export interface CompanionState {
  phase: 'status' | 'question' | 'broadcast' | 'prompt';
  title: string;
  question: {
    key: string;
    kind: 'prediction' | 'poll' | 'trivia';
    q: string;
    options: string[];
    answer: number | null;
    revealed: boolean;
    my_choice: number | null;
    /** Present only for "Live Decision Theater" full-screen moments — the phone
     * must not let a student vote (or re-vote) once the instructor has locked it. */
    theater?: { state: 'voting' | 'locked' | 'revealed' };
  } | null;
  broadcast_prompts?: string[];
  prompt?: BroadcastPrompt | null;
  my_pulse: PulseState | null;
}

export async function getCompanionState(sessionId: string): Promise<CompanionState> {
  const { data } = await portalApi.get<CompanionState>(`/api/portal/sessions/${sessionId}/companion-state`);
  return data;
}

/** Answer the live poll/prediction/trivia currently on the instructor's screen. */
export async function submitPollResponse(sessionId: string, pollKey: string, choice: number): Promise<void> {
  await portalApi.post(`/api/portal/sessions/${sessionId}/poll-response`, { poll_key: pollKey, choice });
}

/** Upcoming public events (Open Houses) from CCPP, for the portal calendar. */
export async function fetchPublicEvents(days = 30): Promise<OpenHouseView[]> {
  const { data } = await portalApi.get<{ events: OpenHouseView[] }>(`/api/portal/events?days=${days}`);
  return data.events || [];
}

export async function fetchOnboardingProfile(): Promise<OnboardingProfileView> {
  const { data } = await portalApi.get<OnboardingProfileView>('/api/portal/onboarding/profile');
  return data;
}

// ── Portal feature flags (server-authoritative; picks the Today experience) ──
// cape_today_plan — CAPE Phase 5 (design doc §16 Phase 5). Default false;
// when true, TodayShell mounts the finite Today Plan + real filter chips +
// skill-detail drawer. See backend/src/services/portalFlagsService.ts.
export interface PortalFlags { today_redesign: boolean; cape_today_plan?: boolean; }
export async function fetchPortalFlags(): Promise<PortalFlags> {
  const { data } = await portalApi.get<PortalFlags>('/api/portal/flags');
  return data;
}

// ── "Open on your phone" QR handoff ──────────────────────────────────────────
export interface HandoffCreate { url: string; qrSvg: string; expiresAt: string; ttlMs: number; }
/** Authed: mint a single-use QR to open Today on the phone. */
export async function createPhoneHandoff(): Promise<HandoffCreate> {
  const { data } = await portalApi.post<HandoffCreate>('/api/portal/handoff');
  return data;
}
/** Public: the phone trades a one-time code for a participant session JWT. */
export async function exchangePhoneHandoff(token: string): Promise<string> {
  const { data } = await portalApi.get<{ jwt: string }>(`/api/portal/handoff/exchange?token=${encodeURIComponent(token)}`);
  return data.jwt;
}

export async function rsvpOpenHouse(id: string): Promise<{ ok: boolean; awarded?: boolean; points?: number }> {
  const { data } = await portalApi.post(`/api/portal/open-house/${id}/rsvp`);
  return data;
}

export async function ingestBackground(
  body: { resume_text?: string; linkedin_url?: string },
): Promise<{ ok: boolean; parsed: boolean; prefill: Record<string, any>; profile?: ResumeProfileFields; personalization?: ResumePersonalization; linkedin_url: string | null }> {
  const { data } = await portalApi.post('/api/portal/onboarding/ingest-background', body);
  return data;
}

// ── Points → level (presentational; mirrors the Design E ladder) ─────────────

export const LEVELS = [
  { name: 'Apprentice', min: 0 },
  { name: 'Builder', min: 150 },
  { name: 'Architect', min: 400 },
  { name: 'Principal', min: 900 },
];

export function levelFor(points: number): { name: string; min: number; next: { name: string; min: number } | null; pct: number } {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (points >= l.min) cur = l;
  const next = LEVELS.find((l) => l.min > cur.min) || null;
  const hi = next ? next.min : cur.min + 1;
  const pct = next ? Math.max(4, Math.min(100, Math.round(((points - cur.min) / (hi - cur.min)) * 100))) : 100;
  return { name: cur.name, min: cur.min, next, pct };
}
