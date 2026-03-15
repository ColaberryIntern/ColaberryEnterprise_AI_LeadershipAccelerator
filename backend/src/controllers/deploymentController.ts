import { Request, Response, NextFunction } from 'express';
import {
  listLandingPages,
  updateLandingPage,
  listDeployments,
  createDeployment,
  updateDeployment,
  deleteDeployment,
} from '../services/deploymentService';

// ── Landing Pages ───────────────────────────────────────────────────────

export async function handleListLandingPages(req: Request, res: Response, next: NextFunction) {
  try {
    const marketingOnly = req.query.marketing === 'true';
    const pages = await listLandingPages(marketingOnly);
    res.json(pages);
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateLandingPage(req: Request, res: Response, next: NextFunction) {
  try {
    const page = await updateLandingPage(req.params.id as string, req.body);
    res.json(page);
  } catch (err: any) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}

// ── Deployments ─────────────────────────────────────────────────────────

export async function handleListDeployments(req: Request, res: Response, next: NextFunction) {
  try {
    const deployments = await listDeployments();
    res.json(deployments);
  } catch (err) {
    next(err);
  }
}

export async function handleCreateDeployment(req: Request, res: Response, next: NextFunction) {
  try {
    const deployment = await createDeployment(req.body);
    res.status(201).json(deployment);
  } catch (err: any) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}

export async function handleUpdateDeployment(req: Request, res: Response, next: NextFunction) {
  try {
    const deployment = await updateDeployment(req.params.id as string, req.body);
    res.json(deployment);
  } catch (err: any) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}

export async function handleDeleteDeployment(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteDeployment(req.params.id as string);
    res.json({ success: true });
  } catch (err: any) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}
