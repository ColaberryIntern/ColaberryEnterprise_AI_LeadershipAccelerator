import { Op } from 'sequelize';
import LiveSession from '../models/LiveSession';
import SessionChatMessage from '../models/SessionChatMessage';

export async function getSessionChatMessages(sessionId: string, cohortId: string, since?: string) {
  // Verify session belongs to cohort
  const session = await LiveSession.findOne({ where: { id: sessionId, cohort_id: cohortId } });
  if (!session) return null;

  // Build where clause
  const where: any = { session_id: sessionId };
  if (since) {
    where.created_at = { [Op.gt]: since };
  }

  // Get messages
  const messages = await SessionChatMessage.findAll({
    where,
    order: [['created_at', 'ASC']],
    limit: 100,
  });

  // Get active participants (sent a message in last 30 seconds)
  const thirtySecondsAgo = new Date(Date.now() - 30_000);
  const recentMessages = await SessionChatMessage.findAll({
    where: {
      session_id: sessionId,
      created_at: { [Op.gt]: thirtySecondsAgo },
    },
    attributes: ['enrollment_id'],
  });

  const uniqueEnrollmentIds = new Set(recentMessages.map((m) => m.enrollment_id));

  return { messages, active_count: uniqueEnrollmentIds.size };
}

export async function postSessionChatMessage(
  sessionId: string,
  enrollmentId: string,
  cohortId: string,
  senderName: string,
  content: string
) {
  // Validate content length
  if (content.length > 500) {
    throw new Error('Message content must be 500 characters or fewer');
  }

  // Verify session belongs to cohort
  const session = await LiveSession.findOne({ where: { id: sessionId, cohort_id: cohortId } });
  if (!session) return null;

  // Create message
  const message = await SessionChatMessage.create({
    session_id: sessionId,
    enrollment_id: enrollmentId,
    sender_name: senderName,
    content,
  });

  return message;
}
