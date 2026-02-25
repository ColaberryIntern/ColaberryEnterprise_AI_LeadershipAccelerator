import { Request, Response, NextFunction } from 'express';
import { logActivity, getLeadActivities } from '../services/activityService';

export async function handleListActivities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const page = parseInt(req.query.page as string, 10) || 1;
    const offset = (page - 1) * limit;

    const { rows: activities, count: total } = await getLeadActivities(leadId, limit, offset);
    res.json({ activities, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
}

export async function handleCreateActivity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const { type, subject, body } = req.body;
    if (!type) {
      res.status(400).json({ error: 'Activity type is required' });
      return;
    }

    const adminUserId = req.admin?.sub || undefined;

    const activity = await logActivity({
      lead_id: leadId,
      admin_user_id: adminUserId,
      type,
      subject: subject || '',
      body: body || '',
    });

    res.status(201).json({ activity });
  } catch (error) {
    next(error);
  }
}
