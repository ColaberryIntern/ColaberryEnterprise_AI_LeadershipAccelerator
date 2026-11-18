/**
 * OH1i (T3): the review desk for Maya's AI-fact and build-prompt shelves (maya_brain_items).
 *
 * GET  /api/admin/maya-brain/items                    list (filter by kind, status)
 * POST /api/admin/maya-brain/items                    add an AI fact as a DRAFT
 * POST /api/admin/maya-brain/items/:id/approve        approve (gated: CLM-nnn or public source for a
 *                                                     fact; a passed test-build for a prompt)
 * POST /api/admin/maya-brain/items/:id/retire         take it off the shelf
 * POST /api/admin/maya-brain/items/:id/test-build     record a person's test-build: passed | failed
 *
 * Reading needs requireAdmin. Every write needs requireFullAdmin, because approving is the step
 * that puts content in front of learners. Bodies and params are Zod-validated; a refused
 * approval returns 422 with the reasons in plain words.
 *
 * The gate is path-scoped (see agentOrphanRoutes.ts for why a router-wide `use` is wrong here).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, requireFullAdmin } from '../../middlewares/authMiddleware';
import {
  listItems, createDraft, approveItem, retireItem, markTestBuild, BrainItemError,
} from '../../services/mayaBrain/mayaBrainItems';

const router = Router();
const BASE = '/api/admin/maya-brain';
router.use(BASE, requireAdmin);

const ListQuery = z.object({
  kind: z.enum(['ai_fact', 'build_prompt']).optional(),
  status: z.enum(['draft', 'approved', 'retired']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const IdParams = z.object({ id: z.string().uuid() });

const CreateFactBody = z.object({
  kind: z.literal('ai_fact'),
  title: z.string().trim().min(3).max(300),
  body: z.string().trim().min(10).max(2000),
  source_url: z.string().url().max(1000).nullable().optional(),
  source_label: z.string().trim().max(300).nullable().optional(),
}).strict();

const ApproveBody = z.object({
  expires_at: z.coerce.date().nullable().optional(),
  source_label: z.string().trim().max(300).nullable().optional(),
  source_url: z.string().url().max(1000).nullable().optional(),
}).strict();

const TestBuildBody = z.object({
  result: z.enum(['passed', 'failed']),
  notes: z.string().trim().min(10).max(3000),
}).strict();

function who(req: Request): string {
  return (req as any).admin?.email || (req as any).admin?.sub || 'admin';
}

function fail(res: Response, e: any): void {
  if (e instanceof BrainItemError) {
    res.status(e.code === 'not_found' ? 404 : 422).json({ error: e.message, problems: e.problems });
    return;
  }
  res.status(500).json({ error: e?.message || 'maya_brain_failed' });
}

router.get(`${BASE}/items`, async (req: Request, res: Response) => {
  const parsed = ListQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'invalid query', issues: parsed.error.flatten() }); return; }
  try {
    res.json({ items: await listItems(parsed.data) });
  } catch (e: any) { fail(res, e); }
});

router.post(`${BASE}/items`, requireFullAdmin, async (req: Request, res: Response) => {
  const parsed = CreateFactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid body', issues: parsed.error.flatten() }); return; }
  try {
    const item = await createDraft({ ...parsed.data });
    res.status(201).json({ item });
  } catch (e: any) { fail(res, e); }
});

router.post(`${BASE}/items/:id/approve`, requireFullAdmin, async (req: Request, res: Response) => {
  const p = IdParams.safeParse(req.params);
  const b = ApproveBody.safeParse(req.body ?? {});
  if (!p.success || !b.success) {
    res.status(400).json({ error: 'invalid request', issues: (p.success ? b : p).error?.flatten() }); return;
  }
  try {
    const item = await approveItem(p.data.id, who(req), {
      expiresAt: b.data.expires_at ?? null,
      ...(b.data.source_label !== undefined ? { sourceLabel: b.data.source_label } : {}),
      ...(b.data.source_url !== undefined ? { sourceUrl: b.data.source_url } : {}),
    });
    res.json({ item });
  } catch (e: any) { fail(res, e); }
});

router.post(`${BASE}/items/:id/retire`, requireFullAdmin, async (req: Request, res: Response) => {
  const p = IdParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: 'invalid id' }); return; }
  try {
    res.json({ item: await retireItem(p.data.id) });
  } catch (e: any) { fail(res, e); }
});

router.post(`${BASE}/items/:id/test-build`, requireFullAdmin, async (req: Request, res: Response) => {
  const p = IdParams.safeParse(req.params);
  const b = TestBuildBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: 'invalid request', issues: (p.success ? b : p).error?.flatten() }); return;
  }
  try {
    res.json({ item: await markTestBuild(p.data.id, b.data.result, b.data.notes, who(req)) });
  } catch (e: any) { fail(res, e); }
});

export default router;
