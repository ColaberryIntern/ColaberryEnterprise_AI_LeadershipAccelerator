import { Op } from 'sequelize';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMessage, { RoomMessageKind, RoomQuestionStatus } from '../../models/RoomMessage';
import RoomMembership from '../../models/RoomMembership';
import RoomResource from '../../models/RoomResource';
import { RoomAccessContext, canPost, canReadContent, canModerate } from './roomEntitlementService';
import { getOrCreateMember } from '../communityService';
import { recordContribution } from './roomRecognitionService';
import { notFoundError, forbiddenError, validationError, log } from './roomShared';

// Room conversation: post + list messages with presence, and the help-loop
// question-status transitions. Reuses communityService.getOrCreateMember for the
// sender display name (single source of truth for the member profile).

const MAX_CONTENT = 4000;
const PRESENCE_WINDOW_MS = 30_000;

async function loadRoom(roomId: string): Promise<CommunityRoom> {
  const room = await CommunityRoom.findByPk(roomId);
  if (!room) throw notFoundError('Room not found');
  return room;
}

function membershipFor(roomId: string, enrollmentId: string): Promise<RoomMembership | null> {
  return RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: enrollmentId } });
}

export interface PostMessageInput {
  content: string;
  kind?: RoomMessageKind;
  thread_root_id?: string;
  resource_id?: string;
  client_id?: string;
}

export async function postMessage(ctx: RoomAccessContext, roomId: string, input: PostMessageInput): Promise<RoomMessage> {
  const content = (input.content || '').trim();
  if (!content) throw validationError('Message content is required');
  if (content.length > MAX_CONTENT) throw validationError(`Message exceeds ${MAX_CONTENT} characters`);

  // Idempotent send: a client-generated UUID lets a retried request (flaky
  // connection, lost response) find the message it already sent instead of
  // creating a duplicate. Same JSONB-containment pattern as postSystemMessage's
  // marker check below.
  if (input.client_id) {
    const existing = await RoomMessage.findOne({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { room_id: roomId, metadata: { [Op.contains]: { client_id: input.client_id } } } as any,
    });
    if (existing) return existing;
  }

  const room = await loadRoom(roomId);
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  if (!canPost(room, ctx, membership)) throw forbiddenError('You cannot post in this room');

  // Chat file-attach: the client already uploaded via the Docs & Files
  // pipeline (POST .../resources/file, which does its own canUploadResource
  // check) and is now linking that resource into a chat message. Re-verify
  // here too — never trust a client-supplied id pairing (same rule the Docs &
  // Files service follows for booking/room pairing).
  let metadata: Record<string, unknown> = {};
  if (input.resource_id) {
    const resource = await RoomResource.findByPk(input.resource_id);
    if (!resource || resource.room_id !== roomId || resource.resource_type !== 'file') {
      throw validationError('That file could not be attached to this message');
    }
    metadata = { resource_id: resource.id };
  }
  if (input.client_id) metadata = { ...metadata, client_id: input.client_id };

  const member = await getOrCreateMember(ctx.enrollmentId);
  const message = await RoomMessage.create({
    room_id: roomId,
    enrollment_id: ctx.enrollmentId,
    sender_name: member.display_name,
    content,
    kind: input.kind || 'message',
    thread_root_id: input.thread_root_id ?? null,
    question_status: input.kind === 'question' ? 'open' : null,
    metadata,
  });
  return message;
}

// System notice posted into a room by "Commons" itself (reminders, waitlist
// promotions). No author, no entitlement check (the system is always allowed).
// Idempotent when a marker is supplied — a message carrying the same marker is
// never posted twice (belt-and-suspenders on top of the outbox's once-only
// delivery), so retries can't duplicate a notice.
export async function postSystemMessage(
  roomId: string,
  content: string,
  opts: { marker?: string; bookingId?: string } = {},
): Promise<RoomMessage | null> {
  if (opts.marker) {
    const existing = await RoomMessage.findOne({
      // JSONB containment (metadata @> {marker}). Sequelize's WhereOptions typing
      // doesn't model Op.contains on a JSONB object column, so this clause is cast
      // to any — the runtime object keeps the Op.contains symbol and emits `@>`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { room_id: roomId, kind: 'system', metadata: { [Op.contains]: { marker: opts.marker } } } as any,
    });
    if (existing) return existing;
  }
  return RoomMessage.create({
    room_id: roomId,
    booking_id: opts.bookingId ?? null,
    enrollment_id: null,
    sender_name: 'Commons',
    content,
    kind: 'system',
    metadata: opts.marker ? { marker: opts.marker } : {},
  });
}

export interface ListMessagesResult {
  messages: RoomMessage[];
  active_count: number;
}

export async function listMessages(
  ctx: RoomAccessContext,
  roomId: string,
  opts: { since?: string; limit?: number } = {},
): Promise<ListMessagesResult> {
  const room = await loadRoom(roomId);
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  if (!canReadContent(room, ctx, membership)) throw forbiddenError('You cannot read this room');

  const where: Record<string, unknown> = {
    room_id: roomId,
    deleted_at: null,
    moderation_state: { [Op.in]: ['visible', 'flagged'] },
  };
  const since = opts.since ? new Date(opts.since) : null;
  if (since && !isNaN(since.getTime())) where.created_at = { [Op.gt]: since };

  const messages = await RoomMessage.findAll({
    where,
    order: [['created_at', 'ASC']],
    limit: Math.min(opts.limit || 100, 200),
  });

  // Presence = distinct senders in the last 30s (same lite model as the existing
  // session chat), so no websocket is needed for the first release.
  const recent = await RoomMessage.findAll({
    where: { room_id: roomId, created_at: { [Op.gte]: new Date(Date.now() - PRESENCE_WINDOW_MS) }, enrollment_id: { [Op.ne]: null } },
    attributes: ['enrollment_id'],
    group: ['enrollment_id'],
  });

  return { messages, active_count: recent.length };
}

// Help loop: Open → Answered → Verified → Added to knowledge. The asker or a
// moderator can advance status.
export async function setQuestionStatus(
  ctx: RoomAccessContext,
  roomId: string,
  messageId: string,
  status: RoomQuestionStatus,
): Promise<RoomMessage> {
  const message = await RoomMessage.findOne({ where: { id: messageId, room_id: roomId } });
  if (!message) throw notFoundError('Message not found');
  const membership = await membershipFor(roomId, ctx.enrollmentId);
  const isAsker = message.enrollment_id === ctx.enrollmentId;
  if (!isAsker && !canModerate(ctx, membership)) throw forbiddenError('Not authorized to update this question');
  await message.update({ question_status: status });
  return message;
}

// Verified-help loop (Phase B #4): the asker (or a moderator) marks a specific
// reply as THE answer. That closes the question (status → verified), records
// which message answered it, and rewards the helper with community recognition.
// Idempotent per question — re-verifying never double-awards, and a member can
// never verify their own message (no self-farming).
export async function verifyAnswer(
  ctx: RoomAccessContext,
  roomId: string,
  questionMessageId: string,
  answerMessageId: string,
): Promise<{ question: RoomMessage; answer: RoomMessage }> {
  if (questionMessageId === answerMessageId) throw validationError('A message cannot answer itself');

  const question = await RoomMessage.findOne({ where: { id: questionMessageId, room_id: roomId } });
  if (!question || question.kind !== 'question') throw notFoundError('Question not found');

  const membership = await membershipFor(roomId, ctx.enrollmentId);
  const isAsker = question.enrollment_id === ctx.enrollmentId;
  if (!isAsker && !canModerate(ctx, membership)) throw forbiddenError('Only the asker or a moderator can verify an answer');

  const answer = await RoomMessage.findOne({ where: { id: answerMessageId, room_id: roomId, deleted_at: null } });
  if (!answer) throw notFoundError('Answer message not found');
  if (!answer.enrollment_id) throw validationError('A system message cannot be the answer');
  if (answer.enrollment_id === question.enrollment_id) throw validationError('You cannot mark your own message as the answer');

  await question.update({
    question_status: 'verified',
    metadata: {
      ...(question.metadata || {}),
      verified_answer_id: answer.id,
      verified_answer_by: answer.enrollment_id,
      verified_at: new Date().toISOString(),
    },
  });

  // Reward the helper. Best-effort + idempotent per question, so a recognition
  // failure never rolls back the verification the student just performed.
  try {
    await recordContribution(answer.enrollment_id, {
      category: 'helpful_guide',
      action: 'verified_answer',
      points: 15,
      roomId,
      messageId: answer.id,
      idempotencyKey: `verified_answer:${question.id}`,
    });
  } catch (e) {
    log('error', 'verify_answer_recognition_failed', { question_id: question.id, error: (e as Error).message });
  }

  return { question, answer };
}
