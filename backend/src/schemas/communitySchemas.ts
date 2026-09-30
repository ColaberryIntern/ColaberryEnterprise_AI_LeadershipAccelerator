import { z } from 'zod';
import { checkReply, checkPost, MIN_REPLY_WORDS, MIN_POST_WORDS } from '../services/community/contributionQuality';

export const CreatePostSchema = z.object({
  // Free-text community posts. Ritual posts do NOT come through this route —
  // they are gated in peerWinsService against the student's OWN answers rather
  // than the composed body, whose heading and field labels would otherwise pad
  // a one-word answer past the bar.
  body: z.string().min(1, 'Post body cannot be empty').max(10000)
    .refine((b) => checkPost(b).ok, {
      message: `Posts need at least ${MIN_POST_WORDS} words — give the cohort something they can use.`,
    }),
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
  // Curriculum tether (Community Rituals). Not set by the public composer — the
  // ritual service derives these from the card server-side and passes them through
  // createPost so a ritual post gets the same points/notifications as any post.
  program_id: z.string().uuid().nullish(),
  week: z.number().int().min(0).max(52).nullish(),
  source_card_id: z.string().uuid().nullish(),
  ritual_meta: z
    .object({
      ritual: z.string().max(64),
      values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    })
    .nullish(),
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
  // A reply must be a real contribution, not a one-word point claim. The rule
  // lives in contributionQuality so the composer can enforce the SAME bar live
  // as the student types; this is the authority, since a client-only gate is
  // decoration. See MIN_REPLY_WORDS for why the floor is words, not characters.
  body: z.string().min(1, 'Comment body cannot be empty').max(5000)
    .refine((b) => checkReply(b).ok, {
      message: `Replies need at least ${MIN_REPLY_WORDS} words — say what you tried, asked, or noticed.`,
    }),
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
