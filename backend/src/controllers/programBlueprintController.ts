import { Request, Response } from 'express';
import * as programBlueprintService from '../services/programBlueprintService';

export async function handleListPrograms(req: Request, res: Response) {
  try {
    const programs = await programBlueprintService.listPrograms();
    res.json(programs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetProgram(req: Request, res: Response) {
  try {
    const program = await programBlueprintService.getProgram(req.params.id as string);
    res.json(program);
  } catch (err: any) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
}

export async function handleCreateProgram(req: Request, res: Response) {
  try {
    const program = await programBlueprintService.createProgram(req.body);
    res.status(201).json(program);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleUpdateProgram(req: Request, res: Response) {
  try {
    const program = await programBlueprintService.updateProgram(req.params.id as string, req.body);
    res.json(program);
  } catch (err: any) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
}

export async function handleDeleteProgram(req: Request, res: Response) {
  try {
    const result = await programBlueprintService.deleteProgram(req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
}

export async function handleCloneProgram(req: Request, res: Response) {
  try {
    const clone = await programBlueprintService.cloneProgram(req.params.id as string);
    res.status(201).json(clone);
  } catch (err: any) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
}
