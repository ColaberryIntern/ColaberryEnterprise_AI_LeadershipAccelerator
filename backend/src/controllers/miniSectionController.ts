import { Request, Response } from 'express';
import * as miniSectionService from '../services/miniSectionService';
import { syncAfterSave, getVariableMap } from '../services/synchronizationService';

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
    const syncReport = await syncAfterSave(req.params.lessonId as string).catch(() => null);
    res.status(201).json({ ...item.toJSON(), syncReport });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
}

export async function handleUpdateMiniSection(req: Request, res: Response) {
  try {
    const item = await miniSectionService.updateMiniSection(req.params.id as string, req.body);
    const syncReport = await syncAfterSave(item.lesson_id).catch(() => null);
    res.json({ ...item.toJSON(), syncReport });
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message }); }
}

export async function handleDeleteMiniSection(req: Request, res: Response) {
  try {
    const ms = await miniSectionService.getMiniSection(req.params.id as string);
    const lessonId = ms.lesson_id;
    const result = await miniSectionService.deleteMiniSection(req.params.id as string);
    const syncReport = await syncAfterSave(lessonId).catch(() => null);
    res.json({ ...result, syncReport });
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message }); }
}

export async function handleReorderMiniSections(req: Request, res: Response) {
  try {
    const items = await miniSectionService.reorderMiniSections(req.params.lessonId as string, req.body.ordered_ids);
    const syncReport = await syncAfterSave(req.params.lessonId as string).catch(() => null);
    res.json({ items, syncReport });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
}

export async function handleGetVariableMap(req: Request, res: Response) {
  try {
    const map = await getVariableMap(req.params.lessonId as string);
    res.json(map);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
}
