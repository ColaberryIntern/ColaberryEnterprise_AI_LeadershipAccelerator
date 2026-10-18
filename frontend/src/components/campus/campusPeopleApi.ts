import axios from 'axios';
import { getParticipantToken } from '../../utils/participantToken';
import { CAMPUS_FLAGS_TIMEOUT_MS } from './campusApi';
import type { DmConversation } from '../../services/dmApi';

/**
 * Campus C5 client: AI staff desks, waving, and the quiet inbox read behind the "new message" toast.
 *
 * Same rules as campusApi.ts (C2): own requests with the token attached and NO redirect interceptor, so a campus read
 * can never end a session or bounce a page. Reads THROW on failure so the UI can tell "failed" from "empty".
 */
const base = () => process.env.REACT_APP_API_URL || '';
const headers = (): Record<string, string> => {
  const token = getParticipantToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export type DeskId = 'reese' | 'dara' | 'maya';
export interface StaffDesk {
  id: DeskId;
  name: string;
  title: string;
  building: string;
  ai: true;
  on_duty: boolean;
  enrollment_id: string | null;
  opens: string | null;
  prompts: string[];
}

const isDesk = (d: unknown): d is StaffDesk => {
  const x = d as Partial<StaffDesk> | null;
  return !!x && (x.id === 'reese' || x.id === 'dara' || x.id === 'maya') && typeof x.name === 'string' && typeof x.building === 'string'
    && typeof x.on_duty === 'boolean' && Array.isArray(x.prompts);
};

export async function fetchStaffDesks(): Promise<StaffDesk[]> {
  const { data } = await axios.get<unknown>(`${base()}/api/portal/campus/staff-desks`, { headers: headers(), timeout: CAMPUS_FLAGS_TIMEOUT_MS });
  const desks = data && typeof data === 'object' ? (data as { desks?: unknown }).desks : undefined;
  if (!Array.isArray(desks) || !desks.every(isDesk)) throw new Error('Malformed staff desks response');
  return desks;
}

export type WaveOutcome = { sent: boolean; reason: 'sent' | 'already_waved' };

/** Wave at someone. Resolves with the server's outcome; rejects with the server's own message when it refuses. */
export async function postWave(to: string): Promise<WaveOutcome> {
  try {
    const { data } = await axios.post<WaveOutcome>(`${base()}/api/portal/campus/wave`, { to }, { headers: headers(), timeout: CAMPUS_FLAGS_TIMEOUT_MS });
    return { sent: data.sent === true, reason: data.reason === 'already_waved' ? 'already_waved' : 'sent' };
  } catch (err) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    throw new Error(msg || 'Could not send the wave');
  }
}

/** My DM conversations, read quietly for the toast (the Messages button keeps using dmApi). Throws on failure. */
export async function fetchConversationsQuiet(): Promise<DmConversation[]> {
  const { data } = await axios.get<unknown>(`${base()}/api/portal/dm/conversations`, { headers: headers(), timeout: CAMPUS_FLAGS_TIMEOUT_MS });
  const list = data && typeof data === 'object' ? (data as { conversations?: unknown }).conversations : undefined;
  if (!Array.isArray(list)) throw new Error('Malformed conversations response');
  return list as DmConversation[];
}
