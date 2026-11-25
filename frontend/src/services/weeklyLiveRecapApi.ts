import axios from 'axios';
import api from '../utils/api';

/**
 * Weekly Live recap (Basecamp WL1). Admin calls go through the authenticated client; the attendee's
 * recap page uses a plain client because it needs no login (the personal token in the link is the key).
 */
export interface RecapIdea { icon: string; title: string; text: string }
export interface RecapSummary {
  headline: string;
  intro: string;
  ideas: RecapIdea[];
  steps: string[];
  quote: string;
  homework: string;
}
export interface RecapViolation { field: string; rule: string; match: string }
export interface RecapDry { toSend: number; alreadySent: number; skipped: Record<string, number>; checkedIn: number }
export interface RecapState {
  session: { id: string; title: string; date: string };
  summary: RecapSummary;
  hasSavedSummary: boolean;
  nextEventUrl: string;
  testSentAt: string | null;
  counts: Record<'queued' | 'sending' | 'sent' | 'failed' | 'skipped', number>;
  dry: RecapDry;
}
export interface RecapSendResult { sent: number; failed: number; skippedNow: number; alreadySent: number }
export interface DraftResult { summary: RecapSummary; source: 'ai' | 'default'; violations: RecapViolation[]; errorClass?: string }

/** The error message and any content-rule violations from a failed admin call. */
export function recapError(e: unknown): { message: string; violations: RecapViolation[] } {
  const data = (e as { response?: { data?: { error?: string; violations?: RecapViolation[] } } })?.response?.data;
  return { message: data?.error || 'Something went wrong. Try again.', violations: data?.violations || [] };
}

export async function getRecap(sessionId: string): Promise<RecapState> {
  const { data } = await api.get(`/api/admin/live/sessions/${sessionId}/recap`);
  return data;
}
export async function saveRecap(sessionId: string, patch: { summary?: RecapSummary; nextEventUrl?: string }): Promise<{ violations: RecapViolation[] }> {
  const { data } = await api.put(`/api/admin/live/sessions/${sessionId}/recap`, patch);
  return data;
}
export async function draftRecap(sessionId: string): Promise<DraftResult> {
  const { data } = await api.post(`/api/admin/live/sessions/${sessionId}/recap/draft`, {});
  return data;
}
export async function sendRecap(sessionId: string, mode: 'dry'): Promise<RecapDry>;
export async function sendRecap(sessionId: string, mode: 'test'): Promise<{ to: string }>;
export async function sendRecap(sessionId: string, mode: 'send'): Promise<RecapSendResult>;
export async function sendRecap(sessionId: string, mode: 'dry' | 'test' | 'send'): Promise<unknown> {
  const { data } = await api.post(`/api/admin/live/sessions/${sessionId}/recap/send`, { mode }, { timeout: 300000 });
  return data;
}

const publicApi = axios.create({ baseURL: process.env.REACT_APP_API_URL || '', timeout: 20000 });

export interface PublicRecapChat { id: string; kind: 'attendee' | 'assistant'; name: string; content: string; at: string }
export interface PublicRecap {
  title: string;
  date: string;
  summary: RecapSummary;
  nextEventUrl: string | null;
  chat: PublicRecapChat[] | null;
  personal: boolean;
}
export async function getPublicRecap(sessionId: string, token: string | null): Promise<PublicRecap> {
  const { data } = await publicApi.get(`/api/live/recap/${sessionId}`, { params: token ? { t: token } : {} });
  return data;
}
