import { Request, Response } from 'express';
import * as miniSectionService from '../services/miniSectionService';

export async function handleListMiniSections(req: Request, res: Response) {
  try {
    const items = await miniSectionService.listMiniSections(req.params.lessonId as string);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
}

export async function handleGetMiniSection(req: Request, res: Response) {
  try {
    const item = await miniSectionService.getMiniSection(req.params.id as string);
    res.json(item);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message }); }
}

export async function handleCreateMiniSection(req: Request, res: Response) {
  try {
    const item = await miniSectionService.createMiniSection(req.params.lessonId as string, req.body);
    res.status(201).json(item);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
}

export async function handleUpdateMiniSection(req: Request, res: Response) {
  try {
    const item = await miniSectionService.updateMiniSection(req.params.id as string, req.body);
    res.json(item);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message }); }
}

export async function handleDeleteMiniSection(req: Request, res: Response) {
  try {
    const result = await miniSectionService.deleteMiniSection(req.params.id as string);
    res.json(result);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message }); }
}

export async function handleReorderMiniSections(req: Request, res: Response) {
  try {
    const items = await miniSectionService.reorderMiniSections(req.params.lessonId as string, req.body.ordered_ids);
    res.json(items);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
}
