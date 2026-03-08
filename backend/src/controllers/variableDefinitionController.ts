import { Request, Response } from 'express';
import * as variableDefinitionService from '../services/variableDefinitionService';

export async function handleListVariableDefinitions(req: Request, res: Response) {
  try {
    const items = await variableDefinitionService.listVariableDefinitions(req.query.program_id as string);
    res.json(items);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
}

export async function handleGetVariableDefinition(req: Request, res: Response) {
  try {
    const item = await variableDefinitionService.getVariableDefinition(req.params.id as string);
    res.json(item);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message }); }
}

export async function handleCreateVariableDefinition(req: Request, res: Response) {
  try {
    const item = await variableDefinitionService.createVariableDefinition(req.body);
    res.status(201).json(item);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
}

export async function handleUpdateVariableDefinition(req: Request, res: Response) {
  try {
    const item = await variableDefinitionService.updateVariableDefinition(req.params.id as string, req.body);
    res.json(item);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message }); }
}

export async function handleDeleteVariableDefinition(req: Request, res: Response) {
  try {
    const result = await variableDefinitionService.deleteVariableDefinition(req.params.id as string);
    res.json(result);
  } catch (err: any) { res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message }); }
}
