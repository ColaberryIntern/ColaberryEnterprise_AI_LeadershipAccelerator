import axios from 'axios';
import api from '../utils/api';

/**
 * The Enterprise intake's public endpoints (W28). The token is the intake's own random id,
 * returned once by `createIntake`, and is what the page keeps in its URL so a reload, or a
 * link we email later, picks the interview back up.
 */

export interface CreatedIntake {
  token: string;
  callAvailable: boolean;
}

export interface InterviewTurn {
  role: 'user' | 'assistant';
  text: string;
}

export type TurnResult =
  | { done: false; message: string; exchanges?: number }
  | { done: true; message: string; understood: boolean };

export type CallResult =
  | { status: 'calling' | 'already_calling'; callId: string | null }
  | { status: 'not_allowed' | 'unavailable' | 'blocked' | 'failed'; reason: string };

export type CallState = 'none' | 'in_progress' | 'ended' | 'writing_up' | 'done';

export interface IntakeStatus {
  status: string;
  interviewed: boolean;
  call: CallState;
  callAvailable: boolean;
  company: string;
  peopleCount: number | null;
  hoursPerWeek: number | null;
  /** v2: the plan they made, so a reload or an emailed link resumes at the right step. */
  interviewMode?: 'now' | 'later' | null;
  interviewScheduledFor?: string | null;
  interviewVia?: 'chat' | 'call' | null;
  meeting?: Meeting | null;
  /** The first instant a meeting can start (the business day after the AI interview). */
  earliestMeeting?: string;
  files?: SharedFile[];
}

export interface Meeting {
  start: string;
  end: string;
  link: string | null;
}

export interface SharedFile {
  name: string;
  size: number;
}

export interface Slot {
  start: string;
  end: string;
}

export interface OfferedSlots {
  earliest: string;
  timezone: string;
  dates: Array<{ date: string; slots: Slot[] }>;
}

const path = (token: string): string => `/api/enterprise/intake/${encodeURIComponent(token)}`;

export async function createIntake(body: Record<string, unknown>): Promise<CreatedIntake> {
  return (await api.post('/api/enterprise/intake', body)).data;
}

export async function interviewTurn(token: string, turns: InterviewTurn[]): Promise<TurnResult> {
  return (await api.post(`${path(token)}/interview`, { turns })).data;
}

/** A refusal (409/502) still carries a body that says why, so it is returned, not thrown. */
export async function requestCall(token: string): Promise<CallResult> {
  try {
    return (await api.post(`${path(token)}/call`)).data;
  } catch (err: any) {
    if (err?.response?.data?.status) return err.response.data;
    throw err;
  }
}

export async function getIntakeStatus(token: string): Promise<IntakeStatus> {
  return (await api.get(path(token))).data;
}

// --- v2: plan the AI interview, book the meeting with Ali, share research ---

/** The message the server gave for a refusal, or a plain fallback. */
export function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' && data.error.length < 300 ? data.error : fallback;
}

export async function getMeetingSlots(token: string): Promise<OfferedSlots> {
  return (await api.get(`${path(token)}/slots`)).data;
}

export async function setInterviewPlan(
  token: string,
  plan: { mode: 'now' | 'later'; at?: string; via?: 'chat' | 'call' },
): Promise<{ mode: 'now' | 'later'; at: string | null; via: 'chat' | 'call' }> {
  return (await api.post(`${path(token)}/interview-plan`, plan)).data;
}

export async function bookMeeting(token: string, start: string): Promise<{ status: 'booked' | 'already_booked'; meeting: Meeting }> {
  return (await api.post(`${path(token)}/meeting`, { start })).data;
}

export async function uploadResearchFile(token: string, file: File): Promise<{ files: SharedFile[] }> {
  const body = new FormData();
  body.append('file', file);
  // The shared client defaults to JSON; multipart must be said explicitly (axios adds the boundary).
  return (await api.post(`${path(token)}/files`, body, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
}

// --- W32: the client's own view of their pilot (/my-pilot) ---

export interface ClientStep {
  label: string;
  done: boolean;
  at: string | null;
}

export interface ClientStatus {
  company: string;
  firstName: string;
  steps: ClientStep[];
  options: string[];
  next: string;
  closed: 'signed' | 'lost' | null;
  /** v2: the meeting with Ali they booked, if any. */
  meeting?: { start: string; link: string | null } | null;
}

/**
 * Its own client, not the shared `api`: that one stamps the ADMIN token onto Authorization
 * whenever one is in localStorage, which would replace the client's sign-in token for anyone
 * (Ali, testing) who is also signed in to admin.
 */
const clientApi = axios.create({ baseURL: process.env.REACT_APP_API_URL || '', headers: { 'Content-Type': 'application/json' } });

export async function requestClientLink(email: string): Promise<void> {
  await clientApi.post('/api/enterprise/client/request-link', { email });
}

export async function getClientStatus(token: string): Promise<ClientStatus> {
  return (await clientApi.get('/api/enterprise/client/status', { headers: { Authorization: `Bearer ${token}` } })).data;
}
