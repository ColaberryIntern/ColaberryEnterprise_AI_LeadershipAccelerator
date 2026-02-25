import { Request, Response, NextFunction } from 'express';
import { getAllSettings, setMultipleSettings } from '../services/settingsService';
import { listEvents, getEventTypes } from '../services/ledgerService';

export async function handleGetSettings(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const settings = await getAllSettings();
    res.json({ settings });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.admin?.sub || undefined;
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No settings provided' });
      return;
    }

    await setMultipleSettings(updates, adminId);
    const settings = await getAllSettings();
    res.json({ settings });
  } catch (error) {
    next(error);
  }
}

export async function handleListEvents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { eventType, entityType, actor, from, to, page, limit } = req.query;
    const result = await listEvents({
      eventType: eventType as string,
      entityType: entityType as string,
      actor: actor as string,
      from: from as string,
      to: to as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleGetEventTypes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const types = await getEventTypes();
    res.json({ types });
  } catch (error) {
    next(error);
  }
}
