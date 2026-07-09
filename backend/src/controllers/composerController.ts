/**
 * composerController — HTTP boundary for the Curriculum Composer. Admin-only.
 * Validates author input with Zod; delegates to the composer services + engines.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listBlueprints, getBlueprint, createBlueprint, updateBlueprint, deleteBlueprint,
  generateForBlueprint, validateBlueprint, assessPlan,
} from '../services/composer/blueprintService';
import { publishBlueprint } from '../services/composer/publishService';
import { generateCurriculum, fillCard, palette, scaffoldPlan } from '../services/composer/composerAi';
import { ARCHITECT_JOURNEY } from '../services/composer/architectJourney';
import { ComposerScope } from '../services/composer/types';

const SCOPES = ['lesson', 'session', 'day', 'week', 'sprint', 'month', 'certification_module', 'internship', 'program'] as const;
const scopeEnum = z.enum(SCOPES);

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

// ── palette + journey (static reference) ─────────────────────────────────────
export function handlePalette(_req: Request, res: Response) {
  res.json({ types: palette().map((t) => ({ slug: t.slug, label: t.label, student_label: t.student_label, bucket: t.bucket, render_band: t.render_band, difficulty: t.difficulty, learning_xp: t.learning_xp, builder_xp: t.builder_xp, community_xp: t.community_xp, competencies: t.competencies, evidence_required: t.evidence_required, github_required: t.github_required, portfolio_eligible: t.portfolio_eligible })) });
}
export function handleArchitectJourney(_req: Request, res: Response) { res.json({ stages: ARCHITECT_JOURNEY }); }

// ── quick generate (preview, not persisted) ──────────────────────────────────
const quickSchema = z.object({
  title: z.string().min(1), instruction: z.string().optional(), scope: scopeEnum.optional(),
  week: z.number().int().nullable().optional(), difficulty: z.string().optional(),
  competencies: z.array(z.string()).optional(), architect_domains: z.array(z.string()).optional(),
  learning_objectives: z.array(z.string()).optional(), purpose: z.string().optional(),
});
export async function handleQuickGenerate(req: Request, res: Response, next: NextFunction) {
  try {
    const b = quickSchema.parse(req.body);
    const scope = (b.scope || 'week') as ComposerScope;
    const result = await generateCurriculum(b, b.instruction || `Generate ${scope} for ${b.title}`, scope);
    const assessment = assessPlan(b as any, result.plan, result.ai_confidence);
    res.json({ plan: result.plan, source: result.source, cost_usd: result.cost_usd ?? 0, runtime_ms: result.runtime_ms ?? 0, assessment });
  } catch (e) { fail(res, e, next); }
}

// ── fill with AI ─────────────────────────────────────────────────────────────
const fillSchema = z.object({
  type: z.string().min(1), instruction: z.string().default(''),
  blueprint: z.object({ title: z.string().optional(), week: z.number().int().nullable().optional(), difficulty: z.string().optional(), competencies: z.array(z.string()).optional(), architect_domains: z.array(z.string()).optional(), learning_objectives: z.array(z.string()).optional() }).optional(),
});
export async function handleFillCard(req: Request, res: Response, next: NextFunction) {
  try {
    const b = fillSchema.parse(req.body);
    res.json(await fillCard(b.blueprint || {}, b.type, b.instruction));
  } catch (e) { fail(res, e, next); }
}

// ── blueprint CRUD ───────────────────────────────────────────────────────────
export async function handleListBlueprints(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ blueprints: await listBlueprints() }); } catch (e) { fail(res, e, next); }
}
export async function handleGetBlueprint(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getBlueprint(String(req.params.id))); } catch (e) { fail(res, e, next); }
}
export async function handleCreateBlueprint(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await createBlueprint(req.body || {})); } catch (e) { fail(res, e, next); }
}
export async function handleUpdateBlueprint(req: Request, res: Response, next: NextFunction) {
  try { res.json(await updateBlueprint(String(req.params.id), req.body || {})); } catch (e) { fail(res, e, next); }
}
export async function handleDeleteBlueprint(req: Request, res: Response, next: NextFunction) {
  try { res.json(await deleteBlueprint(String(req.params.id))); } catch (e) { fail(res, e, next); }
}

// ── generate / validate / publish (persisted) ────────────────────────────────
const genSchema = z.object({ instruction: z.string().optional(), scope: scopeEnum.optional(), model: z.string().optional() });
export async function handleGenerate(req: Request, res: Response, next: NextFunction) {
  try {
    const b = genSchema.parse(req.body || {});
    res.json(await generateForBlueprint(String(req.params.id), b.instruction || '', b.scope as ComposerScope | undefined, b.model));
  } catch (e) { fail(res, e, next); }
}
export async function handleValidate(req: Request, res: Response, next: NextFunction) {
  try { res.json(await validateBlueprint(String(req.params.id))); } catch (e) { fail(res, e, next); }
}
export async function handlePublish(req: Request, res: Response, next: NextFunction) {
  try { res.json(await publishBlueprint(String(req.params.id), req.query.force === 'true')); } catch (e) { fail(res, e, next); }
}

export { scaffoldPlan };
