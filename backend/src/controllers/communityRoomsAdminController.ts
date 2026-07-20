import { Request, Response } from 'express';
import { getCommunityRoomsHealth } from '../services/communityRooms/roomHealthService';
import * as moderation from '../services/communityRooms/roomModerationService';
import { ResolveReportSchema } from '../schemas/communityRoomsSchemas';
import { RoomReportStatus } from '../models/RoomReport';

// Admin-facing Community Rooms controller (health + moderation triage). Guarded
// by requireAdmin at the route layer; admin identity = req.admin.sub.

function fail(res: Response, err: any): void {
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({ error: err?.message || 'Internal error', error_class: err?.error_class });
}

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try { res.json(await getCommunityRoomsHealth()); }
  catch (err) { fail(res, err); }
}

export async function listReports(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query.status as RoomReportStatus | undefined;
    res.json({ reports: await moderation.listReports(status) });
  } catch (err) { fail(res, err); }
}

export async function resolveReport(req: Request, res: Response): Promise<void> {
  const parsed = ResolveReportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid resolution', issues: parsed.error.issues }); return; }
  try {
    const report = await moderation.resolveReport(req.admin!.sub, String(req.params.id), parsed.data.status, parsed.data.resolution);
    res.json({ report });
  } catch (err) { fail(res, err); }
}
