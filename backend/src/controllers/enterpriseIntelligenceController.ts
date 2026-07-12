/**
 * enterpriseIntelligenceController — HTTP boundary for the Enterprise
 * Intelligence Layer (the platform "brain"). Admin-only, /api/admin/brain/*
 * (namespaced away from the existing Cory /api/admin/intelligence). Exposes the
 * Memory Graph, global search, evidence-backed reasoning, the Decision Engine,
 * and the one organizational timeline.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import GraphEvent from '../models/GraphEvent';
import { ingestGraph } from '../services/intelligence/ingestService';
import { graphStats, neighbors, nodesByType } from '../services/intelligence/graphService';
import { globalSearch } from '../services/intelligence/searchService';
import { reason, explainNode } from '../services/intelligence/reasoningService';
import { fromRecommendation, listDecisions, updateDecision, traceDecision } from '../services/intelligence/decisionService';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

export async function handleIngest(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await ingestGraph()); } catch (e) { fail(res, e, next); }
}
export async function handleStats(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await graphStats()); } catch (e) { fail(res, e, next); }
}
export async function handleSearch(req: Request, res: Response, next: NextFunction) {
  try { res.json(await globalSearch(String(req.query.q || ''))); } catch (e) { fail(res, e, next); }
}
export async function handleNode(req: Request, res: Response, next: NextFunction) {
  try { res.json(await neighbors(String(req.params.id))); } catch (e) { fail(res, e, next); }
}
export async function handleExplain(req: Request, res: Response, next: NextFunction) {
  try { res.json(await explainNode(String(req.params.id))); } catch (e) { fail(res, e, next); }
}
export async function handleByType(req: Request, res: Response, next: NextFunction) {
  try { res.json({ nodes: await nodesByType(String(req.params.type)) }); } catch (e) { fail(res, e, next); }
}
export async function handleReason(req: Request, res: Response, next: NextFunction) {
  try { res.json(await reason(String(req.params.domain))); } catch (e) { fail(res, e, next); }
}
export async function handleTimeline(_req: Request, res: Response, next: NextFunction) {
  try { const rows = await GraphEvent.findAll({ order: [['created_at', 'DESC']], limit: 60 }); res.json({ events: rows.map((r) => r.toJSON()) }); } catch (e) { fail(res, e, next); }
}
export async function handleListDecisions(req: Request, res: Response, next: NextFunction) {
  try { res.json({ decisions: await listDecisions(typeof req.query.status === 'string' ? req.query.status : undefined) }); } catch (e) { fail(res, e, next); }
}
const createDecision = z.object({ rec_key: z.string().min(1), decided_by: z.string().optional() });
export async function handleCreateDecision(req: Request, res: Response, next: NextFunction) {
  try { const b = createDecision.parse(req.body || {}); res.status(201).json(await fromRecommendation(b.rec_key, b.decided_by)); } catch (e) { fail(res, e, next); }
}
const updateDecisionSchema = z.object({ status: z.enum(['proposed', 'reviewed', 'approved', 'rejected', 'implemented', 'measured']).optional(), actual_outcome: z.string().optional(), lessons: z.string().optional() });
export async function handleUpdateDecision(req: Request, res: Response, next: NextFunction) {
  try { res.json(await updateDecision(String(req.params.id), updateDecisionSchema.parse(req.body || {}))); } catch (e) { fail(res, e, next); }
}
export async function handleTraceDecision(req: Request, res: Response, next: NextFunction) {
  try { res.json(await traceDecision(String(req.params.id))); } catch (e) { fail(res, e, next); }
}
