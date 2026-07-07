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

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type ListPostsQueryInput = z.infer<typeof ListPostsQuerySchema>;
export type TogglePinInput = z.infer<typeof TogglePinSchema>;
