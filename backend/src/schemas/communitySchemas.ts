import { z } from 'zod';

export const CreatePostSchema = z.object({
  body: z.string().min(1, 'Post body cannot be empty').max(10000),
  category: z.string().min(1).max(100).optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
  mentioned_member_ids: z.array(z.string().uuid()).max(20).optional(),
});

export const ListPostsQuerySchema = z.object({
  category: z.string().min(1).max(100).optional(),
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
export type ListPostsQueryInput = z.infer<typeof ListPostsQuerySchema>;
export type TogglePinInput = z.infer<typeof TogglePinSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export type ReportPostInput = z.infer<typeof ReportPostSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
