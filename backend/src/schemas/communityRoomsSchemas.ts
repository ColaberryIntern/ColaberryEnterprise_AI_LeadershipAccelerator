import { z } from 'zod';

// Zod request schemas for the Community Rooms API. Zod v4 — callers use
// safeParse and read parsed.error.issues on failure. Named *Rooms* to avoid
// colliding with the existing communitySchemas.ts (feed layer).

const roomCategory = z.enum([
  'start_here', 'your_cohort', 'build_together', 'career_cert',
  'live_now', 'demos_events', 'social', 'private_rooms', 'library',
]);
const roomPrivacy = z.enum(['public', 'cohort', 'invite_only', 'private']);
const bookingVariant = z.enum([
  'study', 'build_room', 'demo', 'office_hours',
  'architecture_review', 'cert_prep', 'accountability', 'networking',
]);
const notificationPref = z.enum(['all', 'mentions', 'highlights', 'muted']);
const rsvpState = z.enum(['none', 'going', 'waitlisted', 'declined', 'invited']);
const questionStatus = z.enum(['open', 'answered', 'verified', 'added_to_kb']);
const reportTargetType = z.enum(['room', 'message', 'member', 'booking']);

export const UuidParam = z.string().uuid();

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(200),
  category: roomCategory.optional(),
  privacy: roomPrivacy.optional(),
  description: z.string().max(5000).optional(),
  topic: z.string().max(255).optional(),
  capacity: z.number().int().positive().optional(),
  linked_project_id: z.string().uuid().optional(),
  linked_module_id: z.string().uuid().optional(),
  is_video: z.boolean().optional(),
  emoji: z.string().max(16).optional(),
});
export type CreateRoomBody = z.infer<typeof CreateRoomSchema>;

export const UpdateRoomSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  topic: z.string().max(255).nullable().optional(),
  category: roomCategory.optional(),
  privacy: roomPrivacy.optional(),
  capacity: z.number().int().positive().nullable().optional(),
  status: z.enum(['active', 'archived', 'locked']).optional(),
});
export type UpdateRoomBody = z.infer<typeof UpdateRoomSchema>;

export const ListRoomsQuerySchema = z.object({
  category: roomCategory.optional(),
});

export const NotificationPrefSchema = z.object({ notification_pref: notificationPref });

export const PostMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  kind: z.enum(['message', 'question']).optional(),
  thread_root_id: z.string().uuid().optional(),
});
export type PostMessageBody = z.infer<typeof PostMessageSchema>;

export const ListMessagesQuerySchema = z.object({
  since: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const QuestionStatusSchema = z.object({ question_status: questionStatus });

export const VerifyAnswerSchema = z.object({ answer_message_id: z.string().uuid() });

export const CreateBookingSchema = z.object({
  room_id: z.string().uuid().optional(),
  variant: bookingVariant.optional(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  outcome: z.string().max(2000).optional(),
  agenda: z.string().max(5000).optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  timezone: z.string().max(60).optional(),
  privacy: roomPrivacy.optional(),
  capacity: z.number().int().positive().optional(),
  approval_required: z.boolean().optional(),
  meeting_provider: z.string().max(30).optional(),
  related_module_id: z.string().uuid().optional(),
  related_live_session_id: z.string().uuid().optional(),
  related_project_id: z.string().uuid().optional(),
  skill_tags: z.array(z.string().max(40)).max(20).optional(),
  co_hosts: z.array(z.string().uuid()).max(10).optional(),
  rsvp_deadline: z.string().optional(),
  reflection_prompt: z.string().max(2000).optional(),
  artifact_prompt: z.string().max(2000).optional(),
  idempotency_key: z.string().max(160).optional(),
});
export type CreateBookingBody = z.infer<typeof CreateBookingSchema>;

export const RsvpSchema = z.object({ rsvp_state: rsvpState });

export const ReportSchema = z.object({
  target_type: reportTargetType,
  target_id: z.string().uuid(),
  reason: z.string().min(1).max(60),
  detail: z.string().max(2000).optional(),
});
export type ReportBody = z.infer<typeof ReportSchema>;

export const ResolveReportSchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed']),
  resolution: z.string().max(2000).optional(),
});

export const InviteSchema = z.object({ enrollment_ids: z.array(z.string().uuid()).min(1).max(50) });
export const PresenceSchema = z.object({ in_video: z.boolean().optional() });

// --- Docs & Files (room_resources) ---
const roomResourceType = z.enum(['link', 'file', 'recording', 'recap', 'pin', 'note']);
// 'file' goes through the multipart upload endpoint; 'pin' is a pre-existing
// enum value out of scope for this feature (no creation path added for it).
const createResourceType = z.enum(['link', 'recording', 'recap', 'note']);

export const ListRoomResourcesQuerySchema = z.object({
  booking_id: z.union([z.string().uuid(), z.literal('none')]).optional(),
  resource_type: roomResourceType.optional(),
});

export const CreateRoomResourceSchema = z.object({
  booking_id: z.string().uuid().nullable().optional(),
  resource_type: createResourceType,
  title: z.string().max(255).optional(),
  url: z.string().max(1000).url().optional(),
  body: z.string().max(20000).optional(),
}).refine(
  (v) => (v.resource_type !== 'link' && v.resource_type !== 'recording') || !!v.url,
  { message: 'A URL is required', path: ['url'] },
).refine(
  (v) => (v.resource_type !== 'recap' && v.resource_type !== 'note') || !!v.body,
  { message: 'Body text is required', path: ['body'] },
);
export type CreateRoomResourceBody = z.infer<typeof CreateRoomResourceSchema>;

export const UploadRoomResourceFieldsSchema = z.object({
  booking_id: z.string().uuid().optional(),
  title: z.string().max(255).optional(),
});
