import portalApi from '../utils/portalApi';

export type CommunityPresenceStatus = 'online' | 'away' | 'offline';

export interface CommunityPostMember {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface CommunityPost {
  id: string;
  body: string;
  media_urls: string[];
  category: string | null;
  pinned: boolean;
  like_count: number;
  comment_count: number;
  mentioned_member_ids: string[];
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

export async function fetchPosts(category?: string): Promise<CommunityPost[]> {
  const { data } = await portalApi.get<{ posts: CommunityPost[] }>('/api/portal/community/posts', {
    params: category ? { category } : undefined,
  });
  return data.posts;
}

export async function createPost(input: { body: string; category?: string; mentioned_member_ids?: string[] }): Promise<CommunityPost> {
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
