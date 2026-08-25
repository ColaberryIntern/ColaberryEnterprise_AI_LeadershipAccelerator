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
import { intelligenceScopeForAdmin } from '../modules/tenancy/adminScopeBridge';
import { graphScopeWhere } from '../modules/tenancy/intelligenceScope';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

export async function handleIngest(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await ingestGraph()); } catch (e) { fail(res, e, next); }
}
// Every Memory Graph read below resolves the caller's tenancy scope first. The scope is
// a required argument on those services, so a route that forgets it fails to compile
// rather than quietly searching the whole ecosystem.
export async function handleStats(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await intelligenceScopeForAdmin(req.admin);
    res.json(await graphStats(scope));
  } catch (e) { fail(res, e, next); }
}
export async function handleSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await intelligenceScopeForAdmin(req.admin);
    res.json(await globalSearch(String(req.query.q || ''), scope));
  } catch (e) { fail(res, e, next); }
}
export async function handleNode(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await intelligenceScopeForAdmin(req.admin);
    res.json(await neighbors(String(req.params.id), scope));
  } catch (e) { fail(res, e, next); }
}
export async function handleExplain(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await intelligenceScopeForAdmin(req.admin);
    res.json(await explainNode(String(req.params.id), scope));
  } catch (e) { fail(res, e, next); }
}
export async function handleByType(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await intelligenceScopeForAdmin(req.admin);
    res.json({ nodes: await nodesByType(String(req.params.type), scope) });
  } catch (e) { fail(res, e, next); }
}
export async function handleReason(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await intelligenceScopeForAdmin(req.admin);
    res.json(await reason(String(req.params.domain), scope));
  } catch (e) { fail(res, e, next); }
}
// The timeline queries GraphEvent inline rather than through a service, so the compiler
// could not flag it when scope became required elsewhere. It is scoped by hand here,
// and it needed to be: an unscoped organizational timeline is the single most readable
// cross-tenant leak in the whole surface -- it narrates other tenants' activity in
// plain English, in chronological order.
export async function handleTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = await intelligenceScopeForAdmin(req.admin);
    const rows = await GraphEvent.findAll({
      where: graphScopeWhere(scope),
      order: [['created_at', 'DESC']],
      limit: 60,
    });
    res.json({ events: rows.map((r) => r.toJSON()) });
  } catch (e) { fail(res, e, next); }
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
