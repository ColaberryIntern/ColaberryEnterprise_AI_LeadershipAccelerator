import { Activity, AdminUser } from '../models';

interface LogActivityParams {
  lead_id: number;
  admin_user_id?: string;
  type: string;
  subject?: string;
  body?: string;
  metadata?: Record<string, any>;
}

export async function logActivity(params: LogActivityParams): Promise<any> {
  return Activity.create({
    lead_id: params.lead_id,
    admin_user_id: params.admin_user_id || null,
    type: params.type,
    subject: params.subject || null,
    body: params.body || null,
    metadata: params.metadata || null,
  } as any);
}

export async function getLeadActivities(leadId: number, limit = 50, offset = 0) {
  return Activity.findAndCountAll({
    where: { lead_id: leadId },
    include: [{ model: AdminUser, as: 'adminUser', attributes: ['id', 'email'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
}

export async function logStageChange(
  leadId: number,
  adminUserId: string,
  fromStage: string,
  toStage: string
): Promise<any> {
  return logActivity({
    lead_id: leadId,
    admin_user_id: adminUserId,
    type: 'status_change',
    subject: `Pipeline stage changed: ${fromStage} → ${toStage}`,
    metadata: { from: fromStage, to: toStage },
  });
}
