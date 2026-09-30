import RoomReport, { RoomReportStatus, RoomReportTargetType } from '../../models/RoomReport';
import RoomMessage from '../../models/RoomMessage';
import RoomMembership from '../../models/RoomMembership';
import { RoomAccessContext, canModerate } from './roomEntitlementService';
import { notFoundError, forbiddenError, validationError, log } from './roomShared';

// Room moderation: report a target (idempotent per reporter+target), admin
// triage/resolution, and moderator message hiding. Separate from the existing
// post-specific communityModerationService (that covers CommunityPost only).

export interface ReportInput {
  target_type: RoomReportTargetType;
  target_id: string;
  reason: string;
  detail?: string;
}

export async function reportTarget(ctx: RoomAccessContext, input: ReportInput): Promise<RoomReport> {
  if (!input.reason || !input.reason.trim()) throw validationError('A reason is required');
  const idempotency_key = `${ctx.enrollmentId}:${input.target_type}:${input.target_id}`;
  const [report] = await RoomReport.findOrCreate({
    where: { idempotency_key },
    defaults: {
      reporter_enrollment_id: ctx.enrollmentId,
      target_type: input.target_type,
      target_id: input.target_id,
      reason: input.reason.trim(),
      detail: input.detail ?? null,
      status: 'open',
      idempotency_key,
    },
  });
  log('info', 'room_report_filed', { target_type: input.target_type, target_id: input.target_id });
  return report;
}

// Admin-facing triage queue.
export async function listReports(status?: RoomReportStatus): Promise<RoomReport[]> {
  return RoomReport.findAll({
    where: status ? { status } : {},
    order: [['created_at', 'DESC']],
    limit: 200,
  });
}

export async function resolveReport(
  adminId: string,
  reportId: string,
  status: RoomReportStatus,
  resolution?: string,
): Promise<RoomReport> {
  const report = await RoomReport.findByPk(reportId);
  if (!report) throw notFoundError('Report not found');
  await report.update({
    status,
    resolution: resolution ?? report.resolution,
    resolved_by: adminId,
    resolved_at: new Date(),
  });
  return report;
}

// Moderator/host hides a message in their room.
export async function hideMessage(ctx: RoomAccessContext, roomId: string, messageId: string): Promise<void> {
  const membership = await RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: ctx.enrollmentId } });
  if (!canModerate(ctx, membership)) throw forbiddenError('Not authorized to moderate this room');
  const message = await RoomMessage.findOne({ where: { id: messageId, room_id: roomId } });
  if (!message) throw notFoundError('Message not found');
  await message.update({ moderation_state: 'hidden' });
}
