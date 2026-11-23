/**
 * OH1i (T3): the review desk for Maya's AI-fact and build-prompt shelves (maya_brain_items).
 *
 * GET  /api/admin/maya-brain/items                    list (filter by kind, status)
 * POST /api/admin/maya-brain/items                    add an AI fact as a DRAFT
 * POST /api/admin/maya-brain/items/:id/approve        approve (gated: CLM-nnn or public source for a
 *                                                     fact; a passed test-build for a prompt)
 * POST /api/admin/maya-brain/items/:id/retire         take it off the shelf
 * POST /api/admin/maya-brain/items/:id/test-build     record a person's test-build: passed | failed
 * GET  /api/admin/maya-brain/control                  OH1o: the Brain tab's read (rules, inventory, given)
 * PUT  /api/admin/maya-brain/rules                    OH1o: save the brain rules (validated)
 * POST /api/admin/maya-brain/sample                   OH1o: real drafts, nothing written or sent
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

/*
 * OH1o: the Brain tab (Explorer Growth). One read of everything the brain can choose from and the
 * rules in force; one write of the rules (validated, full admin); one sample that renders real
 * drafts with every write switched off (full admin, because it spends model calls).
 *
 * GET  /api/admin/maya-brain/control     rules + inventory + what each Explorer was given
 * PUT  /api/admin/maya-brain/rules       save the rules (422 with every problem; nothing saved)
 * POST /api/admin/maya-brain/sample      { people 1-5, emails_each 1-3 } -> drafts, nothing written or sent
 */
/**
 * Optional brand scope on the read and the write.
 *
 * ABSENT MEANS THE GLOBAL SET, not "any brand". That is the behaviour every
 * existing caller already gets, so this parameter cannot change what an
 * un-updated client sees.
 *
 * `.strict()` so a typo like `?brandId=` is a 400 rather than silently editing
 * the global rules while the operator believes they are editing one brand's.
 */
const BrandQuery = z.object({ brand_id: z.string().uuid().optional() }).strict();

const SampleBody = z.object({
  people: z.coerce.number().int().min(1).max(5).optional(),
  emails_each: z.coerce.number().int().min(1).max(3).optional(),
}).strict();

const RulesBody = z.object({
  explorerVoice: z.string().max(6000),
  neverSay: z.array(z.string().max(60)).max(50),
  rotation: z.array(z.object({ piece: z.string().max(40), enabled: z.boolean() }).strict()).max(10),
  brainPickMinHours: z.coerce.number().int(),
  weekAhead: z.boolean(),
  openHouseHold: z.literal(true).optional(),
}).strict();

router.get(`${BASE}/control`, async (req: Request, res: Response) => {
  const q = BrandQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'invalid query', issues: q.error.flatten() }); return; }
  try {
    const { getBrainControl } = await import('../../services/explorerGrowth/brainControl');
    res.json(await getBrainControl(q.data.brand_id ?? null));
  } catch (e: any) { fail(res, e); }
});

router.put(`${BASE}/rules`, requireFullAdmin, async (req: Request, res: Response) => {
  const parsed = RulesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid body', issues: parsed.error.flatten() }); return; }
  const q = BrandQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: 'invalid query', issues: q.error.flatten() }); return; }
  try {
    const { saveBrainRules, BrainRulesError } = await import('../../services/explorerGrowth/brainRules');
    try {
      // The brand is echoed back, so a client cannot show "saved" against a
      // brand it did not actually write to.
      const saved = await saveBrainRules(parsed.data, who(req), q.data.brand_id ?? null);
      res.json({ rules: saved, brand_id: q.data.brand_id ?? null });
    } catch (e: any) {
      if (e instanceof BrainRulesError) { res.status(422).json({ error: e.message, problems: e.problems }); return; }
      throw e;
    }
  } catch (e: any) { fail(res, e); }
});

router.post(`${BASE}/sample`, requireFullAdmin, async (req: Request, res: Response) => {
  const parsed = SampleBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'invalid body', issues: parsed.error.flatten() }); return; }
  try {
    const { renderBrainSample } = await import('../../services/explorerGrowth/drafts/brainSample');
    res.json(await renderBrainSample({ people: parsed.data.people, emailsEach: parsed.data.emails_each }));
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
