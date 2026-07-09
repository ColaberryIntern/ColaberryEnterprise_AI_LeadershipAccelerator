/**
 * timelineAdminController — HTTP boundary for the Orchestration Timeline editor.
 * Validates author input with Zod, delegates to timelineAdminService. Admin-only
 * (mounted behind requireAdmin). Service errors carry a `.status` for the client.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listTimeline, createCard, updateCard, deleteCard, reorderCards, cloneCard,
} from '../services/timeline/timelineAdminService';

const bucketEnum = z.enum(['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance']);
const visibilityEnum = z.enum(['draft', 'scheduled', 'published', 'archived']);
const difficultyEnum = z.enum(['intro', 'core', 'stretch']);
const pointsSchema = z.object({
  learning: z.number().int().min(0).optional(),
  builder: z.number().int().min(0).optional(),
  community: z.number().int().min(0).optional(),
}).optional();
const competenciesSchema = z.array(z.object({ domain_id: z.string(), weight: z.number() })).optional();
const videoSchema = z.object({
  url: z.string().max(2000).nullable().optional(),
  presenter: z.string().max(200).nullable().optional(),
  poster: z.string().max(2000).nullable().optional(),
}).nullable().optional();

const createSchema = z.object({
  type: z.string().min(1),
  title: z.string().max(500).optional(),
  subtitle: z.string().max(500).nullable().optional(),
  description: z.string().nullable().optional(),
  week: z.number().int().nullable().optional(),
  bucket: bucketEnum.optional(),
  difficulty: difficultyEnum.optional(),
  estimated_time: z.number().int().nullable().optional(),
  points: pointsSchema,
  competencies: competenciesSchema,
  visibility: visibilityEnum.optional(),
  release_date: z.string().datetime().nullable().optional(),
  program_id: z.string().uuid().nullable().optional(),
  video: videoSchema,
});

const updateSchema = z.object({
  title: z.string().max(500).optional(),
  subtitle: z.string().max(500).nullable().optional(),
  description: z.string().nullable().optional(),
  week: z.number().int().nullable().optional(),
  bucket: bucketEnum.optional(),
  difficulty: difficultyEnum.optional(),
  estimated_time: z.number().int().nullable().optional(),
  points: pointsSchema,
  competencies: competenciesSchema,
  visibility: visibilityEnum.optional(),
  release_date: z.string().datetime().nullable().optional(),
  priority: z.number().int().optional(),
  order: z.number().int().optional(),
  video: videoSchema,
}).strict();

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    order: z.number().int(),
    week: z.number().int().nullable().optional(),
    bucket: bucketEnum.optional(),
  })).min(1),
});

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

export async function handleListTimeline(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listTimeline());
  } catch (err) { fail(res, err, next); }
}

export async function handleCreateCard(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createSchema.parse(req.body);
    res.status(201).json(await createCard(input as any));
  } catch (err) { fail(res, err, next); }
}

export async function handleUpdateCard(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = updateSchema.parse(req.body);
    res.json(await updateCard(String(req.params.id), patch));
  } catch (err) { fail(res, err, next); }
}

export async function handleDeleteCard(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteCard(String(req.params.id));
    res.json({ deleted: true });
  } catch (err) { fail(res, err, next); }
}

export async function handleReorderCards(req: Request, res: Response, next: NextFunction) {
  try {
    const { items } = reorderSchema.parse(req.body);
    res.json(await reorderCards(items));
  } catch (err) { fail(res, err, next); }
}

export async function handleCloneCard(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await cloneCard(String(req.params.id)));
  } catch (err) { fail(res, err, next); }
}
