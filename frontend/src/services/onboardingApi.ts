import portalApi from '../utils/portalApi';

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
}

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
}

export interface OnboardingProfileView {
  prefill: Record<string, any>;
  linkedin_url: string | null;
  has_resume: boolean;
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
  return data;
}

export async function fetchSchedule(): Promise<OnboardingSchedule> {
  const { data } = await portalApi.get<OnboardingSchedule>('/api/portal/onboarding/schedule');
  return data;
}

export async function fetchOnboardingProfile(): Promise<OnboardingProfileView> {
  const { data } = await portalApi.get<OnboardingProfileView>('/api/portal/onboarding/profile');
  return data;
}

export async function rsvpOpenHouse(id: string): Promise<{ ok: boolean; awarded?: boolean; points?: number }> {
  const { data } = await portalApi.post(`/api/portal/open-house/${id}/rsvp`);
  return data;
}

export async function ingestBackground(
  body: { resume_text?: string; linkedin_url?: string },
): Promise<{ ok: boolean; parsed: boolean; prefill: Record<string, any>; linkedin_url: string | null }> {
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
