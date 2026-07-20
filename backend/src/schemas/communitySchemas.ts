import { z } from 'zod';

export const CreatePostSchema = z.object({
  body: z.string().min(1, 'Post body cannot be empty').max(10000),
  category: z.string().min(1).max(100).optional(),
  // http(s) URL (pasted link / YouTube) OR an uploaded community-media path.
  media_urls: z.array(
    z.string().refine(
      (s) => /^https?:\/\//.test(s) || s.startsWith('/api/portal/community/media/'),
      'must be an http(s) URL or an uploaded community media path'
    )
  ).max(10).optional(),
  mentioned_member_ids: z.array(z.string().uuid()).max(20).optional(),
  min_level: z.number().int().min(0).max(10).optional(),
});

export const LeaderboardQuerySchema = z.object({
  period: z.enum(['7d', '30d', 'all_time']).optional().default('all_time'),
});

export const ListPostsQuerySchema = z.object({
  category: z.string().min(1).max(100).optional(),
  // Opaque keyset cursor from a prior page's next_cursor (Phase 4 pagination).
  cursor: z.string().min(1).max(500).optional(),
  // Page size — coerced from the query string; capped in the service too.
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const TogglePinSchema = z.object({
  pinned: z.boolean(),
});

export const PostIdParamSchema = z.object({
  postId: z.string().uuid('Invalid post id'),
});

export const CommentIdParamSchema = z.object({
  commentId: z.string().uuid('Invalid comment id'),
});

export const MemberIdParamSchema = z.object({
  memberId: z.string().uuid('Invalid member id'),
});

export const NotificationIdParamSchema = z.object({
  notificationId: z.string().uuid('Invalid notification id'),
});

export const CreateCommentSchema = z.object({
  body: z.string().min(1, 'Comment body cannot be empty').max(5000),
  parent_comment_id: z.string().uuid().optional(),
});

export const ReportPostSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const UpdateProfileSchema = z
  .object({
    display_name: z.string().min(1).max(255).optional(),
    avatar_url: z.string().url().max(500).optional(),
    bio: z.string().max(2000).optional(),
  })
  .refine((v) => v.display_name !== undefined || v.avatar_url !== undefined || v.bio !== undefined, {
    message: 'At least one field (display_name, avatar_url, bio) is required',
  });

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type LeaderboardQueryInput = z.infer<typeof LeaderboardQuerySchema>;
export type ListPostsQueryInput = z.infer<typeof ListPostsQuerySchema>;
export type TogglePinInput = z.infer<typeof TogglePinSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export type ReportPostInput = z.infer<typeof ReportPostSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
