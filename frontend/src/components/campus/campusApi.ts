import axios from 'axios';
import { getParticipantToken, decodeParticipantClaims } from '../../utils/participantToken';

/**
 * Client for the Colaberry Campus endpoints. C1 has one: whether the campus is
 * on for the signed-in participant.
 *
 * FAIL CLOSED. The campus is an opt-in navigation change, so a timeout, a 401,
 * a 404 from an older backend, or a malformed body all read as "off" and the
 * learner keeps the classic portal. That is the opposite of usePortalFlags'
 * fail-open Today redesign on purpose: there the flag exists for rollback,
 * here it exists for rollout.
 *
 * DELIBERATELY NOT the shared `portalApi` instance (Campus C2). portalApi's 401
 * interceptor deletes the stored token and sends the browser to /portal/login.
 * CampusProvider sits in the portal layout, which also wraps the login, signup,
 * verify, handoff and class-checkin pages, so one 401 from this read could loop
 * the login page or bounce a signed-out student even with the campus off (the
 * 2026-08-03 and 2026-08-24 incidents were this class). A feature-flag read must
 * never be able to end a session: this request carries the token itself and has
 * no interceptor, and CampusProvider skips it entirely when signed out.
 */
export const CAMPUS_FLAGS_TIMEOUT_MS = 10_000;

export interface CampusFlags { campus: boolean }

export async function fetchCampusFlags(): Promise<CampusFlags> {
  const token = getParticipantToken();
  if (!token) return { campus: false };
  try {
    const { data } = await axios.get<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/flags`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: CAMPUS_FLAGS_TIMEOUT_MS,
    });
    const campus = !!data && typeof data === 'object' && (data as { campus?: unknown }).campus === true;
    return { campus };
  } catch {
    return { campus: false };
  }
}

// ---- C4: presence by building (same rules: own request, token attached, no redirect interceptor) ----

export interface CampusPerson {
  enrollment_id: string; display_name: string; avatar_url: string | null;
  /** C5: may I message them (the DM rule). Absent from an older server = no. */ can_message?: boolean;
  /** C9: their level (band rung) and the gear others may see. Absent when unknown. */ rung_name?: string; gear?: Record<string, string>;
}
export type CampusPresenceEntry = CampusPerson | { anonymous: true };
export interface CampusAreaPresence { count: number; people: CampusPresenceEntry[] }
export type CampusPresence = Record<string, CampusAreaPresence>;

const authHeaders = (): Record<string, string> => {
  const token = getParticipantToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** True for an admin's read-only "view as" session: it may read presence but never record it. */
export function isReadOnlySession(): boolean {
  return decodeParticipantClaims(getParticipantToken())?.read_only === true;
}

/** "I am in this building now." Throws on failure; the caller decides it is non-fatal. */
export async function postCampusHere(area: string): Promise<void> {
  await axios.post(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/here`, { area }, {
    headers: authHeaders(), timeout: CAMPUS_FLAGS_TIMEOUT_MS,
  });
}

/**
 * Who is in each building now. THROWS on any failure (network, 403, 500, malformed body) so the UI
 * can show "We can't load who's online" - a failure must never look like an empty campus.
 */
export async function fetchCampusPresence(): Promise<CampusPresence> {
  const { data } = await axios.get<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/presence`, {
    headers: authHeaders(), timeout: CAMPUS_FLAGS_TIMEOUT_MS,
  });
  const areas = data && typeof data === 'object' ? (data as { areas?: unknown }).areas : undefined;
  if (!areas || typeof areas !== 'object') throw new Error('Malformed campus presence response');
  return areas as CampusPresence;
}

// ---- C7: the Explorer tour's opt-in (same rules: own request, token attached, no redirect interceptor) ----

export type TourCompleteReason = 'created' | 'already_open' | 'closed' | 'disabled' | 'unavailable';
export interface TourCompleteAnswer { handoff: boolean; reason: TourCompleteReason }
export const TOUR_COMPLETE_TIMEOUT_MS = 15_000;
const TOUR_REASONS: readonly string[] = ['created', 'already_open', 'closed', 'disabled', 'unavailable'];

/** "Have admissions reach out to me." THROWS on any failure or a malformed answer; the caller treats that as not confirmed. */
export async function postTourComplete(): Promise<TourCompleteAnswer> {
  const { data } = await axios.post<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/tour/complete`, { tour: 'explorer' }, {
    headers: authHeaders(), timeout: TOUR_COMPLETE_TIMEOUT_MS,
  });
  const d = data && typeof data === 'object' ? (data as { handoff?: unknown; reason?: unknown }) : {};
  if (typeof d.handoff !== 'boolean' || typeof d.reason !== 'string' || !TOUR_REASONS.includes(d.reason)) throw new Error('Malformed tour answer');
  return { handoff: d.handoff, reason: d.reason as TourCompleteReason };
}

// ---- C9: My look (same rules: own request, token attached, no redirect interceptor) ----

export interface LookItem { id: string; name: string; slot: 'head' | 'face' | 'body' | 'neck' | 'ride'; threshold: number; unlocked: boolean }
export interface CampusLook { points: number; rung_name: string; catalog: LookItem[]; equipped: Record<string, string> }

function asLook(data: unknown): CampusLook {
  const d = data && typeof data === 'object' ? (data as Partial<CampusLook>) : {};
  if (typeof d.points !== 'number' || !Array.isArray(d.catalog) || !d.equipped || typeof d.equipped !== 'object') throw new Error('Malformed look');
  return { points: d.points, rung_name: typeof d.rung_name === 'string' ? d.rung_name : '', catalog: d.catalog, equipped: d.equipped };
}

/** My points, level, the gear catalog with what I have earned, and what I wear. THROWS on any failure. */
export async function fetchLook(): Promise<CampusLook> {
  const { data } = await axios.get<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/look`, { headers: authHeaders(), timeout: CAMPUS_FLAGS_TIMEOUT_MS });
  return asLook(data);
}

/** Save the COMPLETE set (a slot not present = nothing worn there). THROWS with the server message on a refusal. */
export async function putLook(equipped: Record<string, string | null>): Promise<CampusLook> {
  try {
    const { data } = await axios.put<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/look`, { equipped }, { headers: authHeaders(), timeout: CAMPUS_FLAGS_TIMEOUT_MS });
    return asLook(data);
  } catch (err) {
    const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    throw new Error(typeof msg === 'string' && msg ? msg : 'We could not save your look. Try again.');
  }
}
