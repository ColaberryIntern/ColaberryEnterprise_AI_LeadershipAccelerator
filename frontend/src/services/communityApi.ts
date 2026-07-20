import portalApi from '../utils/portalApi';

export type CommunityPresenceStatus = 'online' | 'away' | 'offline';

export interface CommunityPostMember {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface CommunityPost {
  id: string;
  body: string | null;
  media_urls: string[];
  category: string | null;
  pinned: boolean;
  like_count: number;
  comment_count: number;
  // Server-authenticated per-viewer like state (Phase 4). Render the like
  // button from this, not from a client-side default — the previous code reset
  // every post to "not liked" on load, silently losing the viewer's likes.
  viewer_has_liked: boolean;
  mentioned_member_ids: string[];
  min_level: number;
  locked: boolean;
  created_at: string;
  member: CommunityPostMember;
}

export interface CommunityComment {
  id: string;
  body: string;
  parent_comment_id: string | null;
  like_count: number;
  viewer_has_liked: boolean;
  created_at: string;
  member: CommunityPostMember;
  replies: CommunityComment[];
}

export interface CommunityMemberProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  level: number;
  points: number;
  presence: CommunityPresenceStatus;
  created_at: string;
}

export const COMMUNITY_CATEGORIES = ['General', 'Wins', 'Support', 'Introductions'] as const;

export type LeaderboardPeriod = '7d' | '30d' | 'all_time';

export interface LeaderboardEntry {
  member_id: string;
  display_name: string;
  points: number;
  rank: number;
}

// Level thresholds mirror communityService.ts's LEVEL_TIERS (backend source of
// truth). Tier names are a frontend-only display layer over the 4 numeric
// levels the API actually exposes (approved by Ali, BC #9985689739, 2026-07-16).
export const LEVEL_TIERS = [
  { level: 1, min: 0, name: 'Apprentice' },
  { level: 2, min: 1500, name: 'Builder' },
  { level: 3, min: 2700, name: 'Architect' },
  { level: 4, min: 4200, name: 'Principal Architect' },
] as const;

export function levelName(level: number): string {
  return LEVEL_TIERS.find((t) => t.level === level)?.name ?? `Level ${level}`;
}

// Returns null when already at the max level (nothing left to progress toward).
export function levelProgress(points: number): { current: typeof LEVEL_TIERS[number]; next: typeof LEVEL_TIERS[number] | null; pctToNext: number } {
  const current = [...LEVEL_TIERS].reverse().find((t) => points >= t.min) ?? LEVEL_TIERS[0];
  const next = LEVEL_TIERS.find((t) => t.level === current.level + 1) ?? null;
  const pctToNext = next ? Math.min(100, Math.round(((points - current.min) / (next.min - current.min)) * 100)) : 100;
  return { current, next, pctToNext };
}

export async function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  const { data } = await portalApi.get<{ period: LeaderboardPeriod; entries: LeaderboardEntry[] }>('/api/portal/community/leaderboard', {
    params: { period },
  });
  return data.entries;
}

export interface CommunityFeedPage {
  posts: CommunityPost[];
  next_cursor: string | null;
}

// Cursor-paginated feed (Phase 4). Pass the previous page's next_cursor to page
// forward; omit it for the first page. `next_cursor` is null when the feed is
// exhausted.
export async function fetchPosts(
  params: { category?: string; cursor?: string | null; limit?: number } = {}
): Promise<CommunityFeedPage> {
  const query: Record<string, string | number> = {};
  if (params.category) query.category = params.category;
  if (params.cursor) query.cursor = params.cursor;
  if (params.limit) query.limit = params.limit;
  const { data } = await portalApi.get<{ posts: CommunityPost[]; next_cursor?: string | null }>(
    '/api/portal/community/posts',
    { params: Object.keys(query).length ? query : undefined }
  );
  return { posts: data.posts, next_cursor: data.next_cursor ?? null };
}

export async function createPost(input: {
  body: string;
  category?: string;
  media_urls?: string[];
  mentioned_member_ids?: string[];
}): Promise<CommunityPost> {
  const { data } = await portalApi.post<{ post: CommunityPost }>('/api/portal/community/posts', input);
  return data.post;
}

export async function togglePin(postId: string, pinned: boolean): Promise<CommunityPost> {
  const { data } = await portalApi.patch<{ post: CommunityPost }>(`/api/portal/community/posts/${postId}/pin`, { pinned });
  return data.post;
}

export async function fetchComments(postId: string): Promise<CommunityComment[]> {
  const { data } = await portalApi.get<{ comments: CommunityComment[] }>(`/api/portal/community/posts/${postId}/comments`);
  return data.comments;
}

export async function createComment(postId: string, body: string, parentCommentId?: string): Promise<CommunityComment> {
  const { data } = await portalApi.post<{ comment: CommunityComment }>(`/api/portal/community/posts/${postId}/comments`, {
    body,
    parent_comment_id: parentCommentId,
  });
  return data.comment;
}

export async function togglePostLike(postId: string): Promise<{ liked: boolean; like_count: number }> {
  const { data } = await portalApi.post(`/api/portal/community/posts/${postId}/like`);
  return data;
}

export async function toggleCommentLike(commentId: string): Promise<{ liked: boolean; like_count: number }> {
  const { data } = await portalApi.post(`/api/portal/community/comments/${commentId}/like`);
  return data;
}

export async function fetchMyProfile(): Promise<CommunityMemberProfile> {
  const { data } = await portalApi.get<{ profile: CommunityMemberProfile }>('/api/portal/community/members/me');
  return data.profile;
}

export async function fetchMembers(): Promise<CommunityMemberProfile[]> {
  const { data } = await portalApi.get<{ members: CommunityMemberProfile[] }>('/api/portal/community/members');
  return data.members;
}

export async function pingPresence(): Promise<{ presence: CommunityPresenceStatus }> {
  const { data } = await portalApi.post('/api/portal/community/presence/ping');
  return data;
}

// Upload a small image from the student's computer; returns a relative media
// URL to add to a post's media_urls. The backend validates type + size (8MB).
export async function uploadCommunityMedia(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await portalApi.post<{ url: string }>('/api/portal/community/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.url;
}

// Cohort-scoped member profile lookup for the profile drawer. The backend
// returns 404 (not 403) for a member in another cohort, preserving the
// anti-enumeration behavior — the drawer surfaces that as "member not found".
export async function fetchMemberProfile(memberId: string): Promise<CommunityMemberProfile> {
  const { data } = await portalApi.get<{ profile: CommunityMemberProfile }>(
    `/api/portal/community/members/${memberId}`
  );
  return data.profile;
}

export type CommunityEventSource = 'live_session' | 'open_house' | 'community_event';

export interface CommunityEvent {
  id: string;
  source: CommunityEventSource;
  title: string;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  meeting_link: string | null;
}

// Upcoming cohort events (live sessions + open houses + ad-hoc community
// events), already merged and sorted soonest-first by the backend.
export async function fetchCalendar(): Promise<CommunityEvent[]> {
  const { data } = await portalApi.get<{ events: CommunityEvent[] }>('/api/portal/community/calendar');
  return data.events;
}
