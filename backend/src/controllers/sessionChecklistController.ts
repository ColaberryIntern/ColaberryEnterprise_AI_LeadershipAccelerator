import { Request, Response } from 'express';
import * as sessionChecklistService from '../services/sessionChecklistService';

export async function handleListChecklistItems(req: Request, res: Response) {
  try {
    const items = await sessionChecklistService.listChecklistItems(req.params.sessionId as string);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
}

export async function handleCreateChecklistItem(req: Request, res: Response) {
  try {
    const item = await sessionChecklistService.createChecklistItem(req.params.sessionId as string, req.body);
    res.status(201).json(item);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
}

export async function handleUpdateChecklistItem(req: Request, res: Response) {
  try {
    const item = await sessionChecklistService.updateChecklistItem(req.params.id as string, req.body);
    res.json(item);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message }); }
}

export async function handleDeleteChecklistItem(req: Request, res: Response) {
  try {
    const result = await sessionChecklistService.deleteChecklistItem(req.params.id as string);
    res.json(result);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message }); }
}
