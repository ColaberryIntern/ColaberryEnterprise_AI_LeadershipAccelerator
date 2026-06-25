import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { env } from '../config/env';
import StudentSkilljarProgress from '../models/StudentSkilljarProgress';
import { isTrackedCourseUrl } from './lib/skilljarCourseMatch';

// ─── Skilljar API response shapes ─────────────────────────────────────────────

interface SkilljarUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface SkilljarUserListResponse {
  results: SkilljarUser[];
  next: string | null;
}

interface SkilljarCourseProgressItem {
  user_id: string;
  course_id: string;
  course_title: string;
  course_url: string;
  percent_complete: number;
  is_complete: boolean;
  date_completed: string | null;
}

interface SkilljarProgressListResponse {
  results: SkilljarCourseProgressItem[];
  next: string | null;
}

// ─── Public result types ───────────────────────────────────────────────────────

export interface SyncResult {
  email: string;
  skilljar_user_id: string | null;
  courses_synced: number;
  courses_completed: number;
  error: string | null;
}

export interface StudentCourseProgress {
  course_url: string;
  course_title: string | null;
  percent_complete: number;
  completed: boolean;
  completed_at: Date | null;
  last_synced_at: Date;
}

// ─── HTTP client ───────────────────────────────────────────────────────────────

function buildClient(): AxiosInstance {
  return axios.create({
    baseURL: env.skilljarBaseUrl,
    timeout: 15000,
    headers: {
      // Skilljar uses Token auth scoped to the org that hosts the courses.
      // Requires SKILLJAR_API_KEY from the Anthropic partner portal.
      Authorization: `Token ${env.skilljarApiKey}`,
      'Content-Type': 'application/json',
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  ctx: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'skilljarSyncService',
      event,
      ...ctx,
    }),
  );
}

function classifyError(err: unknown): string {
  const status = (err as any)?.response?.status;
  if (status === 401 || status === 403) return 'AuthError';
  if (status === 429) return 'RateLimitError';
  if (status >= 500) return 'UpstreamUnavailable';
  const msg = (err as Error)?.message || '';
  if (/timeout/i.test(msg)) return 'TimeoutError';
  return 'SkilljarApiError';
}

async function lookupSkilljarUser(
  client: AxiosInstance,
  email: string,
): Promise<SkilljarUser | null> {
  const resp = await client.get<SkilljarUserListResponse>('/users', {
    params: { email },
  });
  return resp.data.results[0] ?? null;
}

async function fetchUserProgress(
  client: AxiosInstance,
  skilljarUserId: string,
): Promise<SkilljarCourseProgressItem[]> {
  const all: SkilljarCourseProgressItem[] = [];
  let url: string | null = `/user-course-progress?user_id=${skilljarUserId}`;
  let page = 0;
  const MAX_PAGES = 50; // Failure-First: hard cap so a cyclic/misbehaving `next` link can't loop forever.

  while (url && page < MAX_PAGES) {
    const resp: AxiosResponse<SkilljarProgressListResponse> = await client.get<SkilljarProgressListResponse>(url);
    all.push(...resp.data.results);
    url = resp.data.next;
    page++;
  }

  if (url) {
    log('warn', 'skilljar_pagination_cap_hit', { skilljar_user_id: skilljarUserId, pages: page, max_pages: MAX_PAGES });
  }

  return all;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches Skilljar progress for one student and upserts into student_skilljar_progress.
 * Only the 5 tracked Anthropic course URLs are stored.
 * Idempotent: upserts on (email, course_url); safe to call repeatedly.
 *
 * Requires SKILLJAR_API_KEY (Token auth) from the Anthropic partner portal.
 */
export async function syncUserProgress(email: string): Promise<SyncResult> {
  if (!env.skilljarApiKey) {
    const error = 'SKILLJAR_API_KEY not set — contact Anthropic partner portal for credentials';
    log('warn', 'skilljar_sync_skipped', { outcome: 'failure', error_class: 'AuthError', email });
    return { email, skilljar_user_id: null, courses_synced: 0, courses_completed: 0, error };
  }

  const client = buildClient();

  let skilljarUser: SkilljarUser | null = null;
  try {
    skilljarUser = await lookupSkilljarUser(client, email);
  } catch (err) {
    const error_class = classifyError(err);
    log('error', 'skilljar_user_lookup_failed', { outcome: 'failure', error_class, email, message: (err as Error).message });
    return { email, skilljar_user_id: null, courses_synced: 0, courses_completed: 0, error: error_class };
  }

  if (!skilljarUser) {
    log('info', 'skilljar_user_not_found', { outcome: 'partial', email });
    return { email, skilljar_user_id: null, courses_synced: 0, courses_completed: 0, error: null };
  }

  let progressItems: SkilljarCourseProgressItem[] = [];
  try {
    progressItems = await fetchUserProgress(client, skilljarUser.id);
  } catch (err) {
    const error_class = classifyError(err);
    log('error', 'skilljar_progress_fetch_failed', { outcome: 'failure', error_class, email, skilljar_user_id: skilljarUser.id, message: (err as Error).message });
    return { email, skilljar_user_id: skilljarUser.id, courses_synced: 0, courses_completed: 0, error: error_class };
  }

  // Normalize before matching — the live API may return tracked courses with a
  // trailing slash / different casing / query param, which an exact-string match
  // would drop silently (courses_synced:0, error:null). See ./lib/skilljarCourseMatch.
  const tracked = progressItems.filter((p) => isTrackedCourseUrl(p.course_url));
  let synced = 0;
  let completed = 0;

  for (const item of tracked) {
    await StudentSkilljarProgress.upsert({
      email,
      skilljar_user_id: skilljarUser.id,
      course_url: item.course_url,
      course_title: item.course_title,
      percent_complete: Math.min(100, Math.max(0, Math.round(item.percent_complete))),
      completed: item.is_complete,
      completed_at: item.date_completed ? new Date(item.date_completed) : null,
      last_synced_at: new Date(),
      updated_at: new Date(),
    });
    synced++;
    if (item.is_complete) completed++;
  }

  log('info', 'skilljar_sync_complete', { outcome: 'success', email, skilljar_user_id: skilljarUser.id, courses_synced: synced, courses_completed: completed });

  return { email, skilljar_user_id: skilljarUser.id, courses_synced: synced, courses_completed: completed, error: null };
}

/**
 * Returns stored Skilljar progress rows for a student.
 * Returns an empty array if the student has never been synced — never throws.
 */
export async function getUserProgress(email: string): Promise<StudentCourseProgress[]> {
  try {
    const rows = await StudentSkilljarProgress.findAll({
      where: { email },
      attributes: ['course_url', 'course_title', 'percent_complete', 'completed', 'completed_at', 'last_synced_at'],
      order: [['course_url', 'ASC']],
    });

    return rows.map((r) => ({
      course_url: r.course_url,
      course_title: r.course_title,
      percent_complete: r.percent_complete,
      completed: r.completed,
      completed_at: r.completed_at,
      last_synced_at: r.last_synced_at,
    }));
  } catch (err) {
    log('warn', 'skilljar_progress_read_failed', { outcome: 'failure', error_class: 'DbError', email, message: (err as Error).message });
    return [];
  }
}
