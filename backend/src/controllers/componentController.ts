/**
 * componentController — HTTP boundary for the Experience Builder. Admin-only.
 * Validates author input with Zod; delegates to the components services.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { listComponents, getComponent, updateComponent, createComponent, listVersions, restoreVersion, exportComponent, importComponent } from '../services/components/componentService';
import { seedAnalytics, getAnalytics, analyticsOverview } from '../services/components/componentAnalyticsService';
import { setDependencies, dependencyGraph } from '../services/components/dependencyService';
import { compareVersions } from '../services/components/versionDiffService';
import { generateThumbnail, backfillThumbnails } from '../services/components/thumbnailService';
import { renderSurface, backfillRenderers, RENDERER_SURFACES, RendererSurface } from '../services/components/rendererService';
import { componentLifecycle, setLifecycle, LIFECYCLE_STATES } from '../services/components/lifecycleService';
import { testPrompt, PromptKind, PROMPT_KINDS } from '../services/components/promptTesterService';
import { estimateComponent } from '../services/components/costEstimationService';
import { backfillComponents } from '../services/components/componentBackfill';
import { generateComponent, coDesignComponent, runtimePreview } from '../services/components/componentAiService';
import { CAPABILITY_MODULES } from '../services/components/capabilityRegistry';
import { RECIPES } from '../services/components/recipeRegistry';
import CurriculumTypeDefinition from '../models/CurriculumTypeDefinition';

const testSchema = z.object({
  kind: z.enum(PROMPT_KINDS),
  variables: z.record(z.string(), z.string()).optional(),
  model: z.string().optional(),
});

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}
const author = (req: Request) => (req as any).admin?.email || (req as any).admin?.id || 'admin';

export async function handleListComponents(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ components: await listComponents() }); } catch (e) { fail(res, e, next); }
}

export async function handleGetComponent(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getComponent(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}

export async function handleUpdateComponent(req: Request, res: Response, next: NextFunction) {
  try {
    const note = typeof req.body?._note === 'string' ? req.body._note : undefined;
    res.json(await updateComponent(String(req.params.slug), req.body || {}, author(req), note));
  } catch (e) { fail(res, e, next); }
}

export async function handleTestComponentPrompt(req: Request, res: Response, next: NextFunction) {
  try {
    const { kind, variables, model } = testSchema.parse(req.body);
    res.json(await testPrompt(String(req.params.slug), kind as PromptKind, variables || {}, model));
  } catch (e) { fail(res, e, next); }
}

export async function handleEstimateComponent(req: Request, res: Response, next: NextFunction) {
  try {
    const c = await CurriculumTypeDefinition.findOne({ where: { slug: String(req.params.slug) } });
    if (!c) return res.status(404).json({ error: 'Component not found' });
    res.json(estimateComponent(c.toJSON() as any, typeof req.query.model === 'string' ? req.query.model : undefined));
  } catch (e) { fail(res, e, next); }
}

export async function handleListVersions(req: Request, res: Response, next: NextFunction) {
  try { res.json({ versions: await listVersions(String(req.params.slug)) }); } catch (e) { fail(res, e, next); }
}

export async function handleRestoreVersion(req: Request, res: Response, next: NextFunction) {
  try { res.json(await restoreVersion(String(req.params.slug), Number(req.params.version), author(req))); } catch (e) { fail(res, e, next); }
}

export async function handleBackfillComponents(req: Request, res: Response, next: NextFunction) {
  try { res.json(await backfillComponents(req.query.force === 'true')); } catch (e) { fail(res, e, next); }
}

// ── Experience Studio (AI-native) ────────────────────────────────────────────
const genSchema = z.object({ description: z.string().min(3), recipe: z.string().optional(), model: z.string().optional() });
const previewSchema = z.object({ variables: z.record(z.string(), z.string()).optional(), model: z.string().optional() });

export async function handleGenerateComponent(req: Request, res: Response, next: NextFunction) {
  try {
    const { description, recipe, model } = genSchema.parse(req.body);
    res.json(await generateComponent(description, recipe, model));
  } catch (e) { fail(res, e, next); }
}

export async function handleCreateComponent(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await createComponent(req.body || {})); } catch (e) { fail(res, e, next); }
}

export async function handleCoDesign(req: Request, res: Response, next: NextFunction) {
  try { res.json(await coDesignComponent(String(req.params.slug), typeof req.body?.model === 'string' ? req.body.model : undefined)); } catch (e) { fail(res, e, next); }
}

export async function handleRuntimePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const { variables, model } = previewSchema.parse(req.body || {});
    res.json(await runtimePreview(String(req.params.slug), variables || {}, model));
  } catch (e) { fail(res, e, next); }
}

export function handleListCapabilities(_req: Request, res: Response) { res.json({ capabilities: CAPABILITY_MODULES }); }
export function handleListRecipes(_req: Request, res: Response) { res.json({ recipes: RECIPES }); }

// ── Foundation: analytics, dependencies, version-compare, thumbnails, export ──
export async function handleAnalyticsOverview(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await analyticsOverview()); } catch (e) { fail(res, e, next); }
}
export async function handleComponentAnalytics(req: Request, res: Response, next: NextFunction) {
  try { res.json(await getAnalytics(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleSeedAnalytics(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await seedAnalytics()); } catch (e) { fail(res, e, next); }
}
export async function handleDependencyGraph(req: Request, res: Response, next: NextFunction) {
  try { res.json(await dependencyGraph(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleSetDependencies(req: Request, res: Response, next: NextFunction) {
  try {
    const deps = z.array(z.string()).parse(req.body?.dependencies ?? []);
    res.json(await setDependencies(String(req.params.slug), deps));
  } catch (e) { fail(res, e, next); }
}
export async function handleCompareVersions(req: Request, res: Response, next: NextFunction) {
  try {
    const norm = (v: string) => (v === 'current' ? 'current' : Number(v)) as number | 'current';
    res.json(await compareVersions(String(req.params.slug), norm(String(req.params.a)), norm(String(req.params.b))));
  } catch (e) { fail(res, e, next); }
}
export async function handleGenerateThumbnail(req: Request, res: Response, next: NextFunction) {
  try { res.json(await generateThumbnail(String(req.params.slug), req.body?.source === 'custom' ? 'custom' : 'template', req.body?.url)); } catch (e) { fail(res, e, next); }
}
export async function handleBackfillThumbnails(req: Request, res: Response, next: NextFunction) {
  try { res.json(await backfillThumbnails(req.query.force === 'true')); } catch (e) { fail(res, e, next); }
}
export async function handleExportComponent(req: Request, res: Response, next: NextFunction) {
  try { res.json(await exportComponent(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleImportComponent(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await importComponent(req.body)); } catch (e) { fail(res, e, next); }
}

// ── Renderer Engine + Lifecycle ──────────────────────────────────────────────
export async function handleRenderSurface(req: Request, res: Response, next: NextFunction) {
  try {
    const surface = String(req.params.surface) as RendererSurface;
    if (!RENDERER_SURFACES.includes(surface)) return res.status(400).json({ error: 'Unknown surface' });
    res.json(await renderSurface(String(req.params.slug), surface, req.body?.variables || {}, req.body?.model));
  } catch (e) { fail(res, e, next); }
}
export async function handleBackfillRenderers(req: Request, res: Response, next: NextFunction) {
  try { res.json(await backfillRenderers(req.query.force === 'true')); } catch (e) { fail(res, e, next); }
}
export function handleRendererSurfaces(_req: Request, res: Response) { res.json({ surfaces: RENDERER_SURFACES, lifecycle_states: LIFECYCLE_STATES }); }
export async function handleGetLifecycle(req: Request, res: Response, next: NextFunction) {
  try { res.json(await componentLifecycle(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleSetLifecycle(req: Request, res: Response, next: NextFunction) {
  try { res.json(await setLifecycle(String(req.params.slug), String(req.body?.state))); } catch (e) { fail(res, e, next); }
}

// ── Curriculum-inclusion approval ────────────────────────────────────────────
export async function handleSetApproval(req: Request, res: Response, next: NextFunction) {
  try {
    const approved = req.body?.approved === true || req.body?.approved === 'true';
    const c = await CurriculumTypeDefinition.findOne({ where: { slug: String(req.params.slug) } });
    if (!c) return res.status(404).json({ error: 'Component not found' });
    await c.update({ approved, approved_at: approved ? new Date() : null, approved_by: approved ? author(req) : null });
    res.json({ slug: c.slug, approved: c.approved, approved_at: c.approved_at, approved_by: c.approved_by });
  } catch (e) { fail(res, e, next); }
}
