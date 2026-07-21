/**
 * timelineAdminController — HTTP boundary for the Orchestration Timeline editor.
 * Validates author input with Zod, delegates to timelineAdminService. Admin-only
 * (mounted behind requireAdmin). Service errors carry a `.status` for the client.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listTimeline, createCard, updateCard, deleteCard, reorderCards, cloneCard,
  getSectionRules, setSectionRule,
} from '../services/timeline/timelineAdminService';
import { generateCardContent } from '../services/timeline/cardContentService';
import { generateVideoDraft } from '../services/timeline/videoDraftService';
import { generateCourseDraft } from '../services/timeline/courseDraftService';
import { getBlueprintContext } from '../services/timeline/blueprintContext';
import { buildWorkspacePreviewUrl } from '../services/timeline/workspacePreviewService';

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
// AI-generated student content saved onto the card (metadata.content).
const contentSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  body_html: z.string().optional(),
  questions: z.array(z.string()).optional(),
  reflection: z.string().optional(),
}).nullable().optional();
// Anthropic Skills Course (skills_jar) — class name + SkillsJar link.
const courseSchema = z.object({
  name: z.string().max(300).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
}).nullable().optional();
// The item's OWN display image (blog cover etc.) — metadata.image.
const imageSchema = z.string().max(2000).nullable().optional();
// Testimonials type: link mode plays a specific video; random mode picks a
// matched testimonial per student from the network_videos library.
const testimonialSchema = z.object({
  mode: z.enum(['link', 'random']).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
}).nullable().optional();
// Podcast type: link mode plays a pasted episode/video; random mode picks a matched
// episode per student from the Buzzsprout `podcasts` catalog (blank category = whole catalog).
const podcastSourceSchema = z.object({
  mode: z.enum(['link', 'random']).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
}).nullable().optional();
// Blog type: link mode shows one specific post; random mode auto-matches a post per
// student (profile + the week they're on) from the training-site `blog_posts` library.
const blogSourceSchema = z.object({
  mode: z.enum(['link', 'random']).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
}).nullable().optional();
// Gating: per-card unlock predicates. Loose here (all fields optional); the
// service's normalizeRules() enforces the per-kind required fields and drops junk.
const unlockPredicateSchema = z.object({
  kind: z.enum(['card_complete', 'section_complete', 'type_complete']),
  card_id: z.string().optional(),
  bucket: bucketEnum.optional(),
  type: z.string().optional(),
  scope: z.enum(['week', 'all']).optional(),
  label: z.string().max(200).optional(),
});
const unlockRulesSchema = z.array(unlockPredicateSchema).max(30).optional();

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
  unlock_rules: unlockRulesSchema,
  video: videoSchema,
  content: contentSchema,
  course: courseSchema,
  image: imageSchema,
  testimonial: testimonialSchema,
  podcast: podcastSourceSchema,
  blog: blogSourceSchema,
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
  unlock_rules: unlockRulesSchema,
  video: videoSchema,
  content: contentSchema,
  course: courseSchema,
  image: imageSchema,
  testimonial: testimonialSchema,
  podcast: podcastSourceSchema,
  blog: blogSourceSchema,
}).strict();

// Section gating: set/replace one section's (bucket's) unlock predicates.
const sectionRuleSchema = z.object({
  program_id: z.string().uuid(),
  bucket: bucketEnum,
  rules: z.array(unlockPredicateSchema).max(30).default([]),
});

// One-click: build a full video-card draft from a title (find a real video +
// write the copy/content). Returned to the editor as a draft to review + save.
const videoDraftSchema = z.object({
  type: z.string().min(1),
  title: z.string().max(500).nullable().optional(),
  subtitle: z.string().max(500).nullable().optional(),
  description: z.string().nullable().optional(),
  program_id: z.string().uuid().nullable().optional(),
  week: z.number().int().nullable().optional(),
  video: videoSchema,
  anchor: z.enum(['title', 'video']).optional(),
});
// One-click for a Skills Course: from just the SkillsJar link, fill everything.
const courseDraftSchema = z.object({
  type: z.string().min(1),
  url: z.string().min(1).max(2000),
  program_id: z.string().uuid().nullable().optional(),
  week: z.number().int().nullable().optional(),
});

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

export async function handleListTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listTimeline((req.query.program_id as string) || undefined));
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

// Generate the student-facing content for this card and save it onto the card
// (metadata.content) — so what the author previews is exactly what students see.
export async function handleGenerateCardContent(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await generateCardContent(String(req.params.id)));
  } catch (err) { fail(res, err, next); }
}

// One-click: from a title (no saved card needed), find a real video and write
// the subtitle/description/poster/presenter + lesson content. Returns a DRAFT —
// nothing is persisted; the editor merges it and the author saves.
export async function handleGenerateVideoDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const b = videoDraftSchema.parse(req.body);
    res.json(await generateVideoDraft(b));
  } catch (err) { fail(res, err, next); }
}

// One-click for the Anthropic Skills Course: from just the SkillsJar link, fill
// the class name, description, XP, minutes, and lesson content. Returns a draft.
export async function handleGenerateCourseDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const b = courseDraftSchema.parse(req.body);
    res.json(await generateCourseDraft(b));
  } catch (err) { fail(res, err, next); }
}

// Read-only: the week's Blueprint context that gets auto-injected into every
// generator for this (course, week). Powers the grayed-out "week context" block.
export async function handleGetBlueprintContext(req: Request, res: Response, next: NextFunction) {
  try {
    const programId = (req.query.program_id as string) || undefined;
    const week = req.query.week != null && req.query.week !== '' ? Number(req.query.week) : undefined;
    res.json(await getBlueprintContext(programId, week));
  } catch (err) { fail(res, err, next); }
}

// Gating: list a program's per-section rules; upsert one section's rules.
export async function handleGetSectionRules(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ sectionRules: await getSectionRules((req.query.program_id as string) || null) });
  } catch (err) { fail(res, err, next); }
}
export async function handleSetSectionRule(req: Request, res: Response, next: NextFunction) {
  try {
    const b = sectionRuleSchema.parse(req.body);
    res.json(await setSectionRule(b.program_id, b.bucket, b.rules));
  } catch (err) { fail(res, err, next); }
}

// Read-only "open the workspace" — mints a read_only test-student session and
// returns a /portal/view-as deep-link into the live runtime for this card.
export async function handleGetWorkspacePreviewUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const admin: any = (req as any).admin;
    const impersonatedBy = admin?.email || admin?.sub || 'admin';
    const url = await buildWorkspacePreviewUrl(String(req.params.cardId), String(impersonatedBy));
    res.json({ url });
  } catch (err) { fail(res, err, next); }
}
