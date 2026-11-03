import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { LANDING_SOURCES } from '../../services/marketing/acquisitionFunnel';
import { getAdProfitability } from '../../services/marketing/adSpend/adProfitabilityService';
import { getSyncStatus, syncMetaSpend, centralToday, shiftDay } from '../../services/marketing/adSpend/metaSpendSync';
import { parseSpendCsv } from '../../services/marketing/adSpend/spendCsv';
import { PLATFORMS, SpendInputSchema } from '../../services/marketing/adSpend/spendInput';
import { countSpend, deleteSpend, knownCampaigns, listSpend, upsertSpend } from '../../services/marketing/adSpend/spendLedger';

/**
 * Ad spend: record it (typed, imported, or pulled from Meta) and read the profitability report.
 * Admin only, like every other /api/admin/marketing route. Every input is parsed with Zod before
 * it reaches a service; a bad body is a 400 naming the field, never a 500.
 */

const router = Router();

const fail = (res: Response, err: unknown, what: string, errorClass = 'InternalError') => {
  console.error(JSON.stringify({
    level: 'error', service: 'backend', event: 'ad_spend_route_failed', outcome: 'failure', error_class: errorClass,
    context: { what, message: err instanceof Error ? err.message : String(err) },
  }));
  res.status(500).json({ error: `Failed to ${what}`, error_class: errorClass });
};

const badRequest = (res: Response, error: z.ZodError) =>
  res.status(400).json({
    error: 'Invalid input',
    error_class: 'ValidationError',
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });

const who = (req: Request) => req.admin?.email ?? null;

const DaysQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });
const RangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const IdParam = z.object({ id: z.coerce.number().int().positive() });
const ImportBody = z.object({
  csv: z.string().min(1, 'The file is empty').max(2_000_000, 'The file is larger than 2 MB'),
  platform: z.enum(PLATFORMS).default('meta'),
  dryRun: z.boolean().default(true),
});
const SyncBody = z.object({ days: z.number().int().min(1).max(90).default(30) }).default({ days: 30 });

router.get('/api/admin/marketing/ad-profitability', requireAdmin, async (req: Request, res: Response) => {
  const q = DaysQuery.safeParse(req.query);
  if (!q.success) return badRequest(res, q.error);
  try {
    res.json(await getAdProfitability(q.data.days));
  } catch (err) {
    fail(res, err, 'load ad profitability');
  }
});

router.get('/api/admin/marketing/ad-spend', requireAdmin, async (req: Request, res: Response) => {
  const q = RangeQuery.safeParse(req.query);
  if (!q.success) return badRequest(res, q.error);
  const to = q.data.to ?? centralToday();
  const from = q.data.from ?? shiftDay(to, -89);
  try {
    const [records, total, sync, campaigns] = await Promise.all([
      listSpend(from, to, 500), countSpend(from, to), getSyncStatus(), knownCampaigns(LANDING_SOURCES),
    ]);
    res.json({ from, to, records, total, sync, knownCampaigns: campaigns });
  } catch (err) {
    fail(res, err, 'load ad spend');
  }
});

router.post('/api/admin/marketing/ad-spend', requireAdmin, async (req: Request, res: Response) => {
  const body = SpendInputSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  try {
    const written = await upsertSpend([body.data], 'manual', who(req));
    res.status(201).json({ written });
  } catch (err) {
    fail(res, err, 'save ad spend');
  }
});

router.delete('/api/admin/marketing/ad-spend/:id', requireAdmin, async (req: Request, res: Response) => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) return badRequest(res, p.error);
  try {
    const removed = await deleteSpend(p.data.id);
    if (!removed) return res.status(404).json({ error: 'No such spend row', error_class: 'NotFound' });
    res.json({ removed: true });
  } catch (err) {
    fail(res, err, 'delete ad spend');
  }
});

/**
 * Import an export. `dryRun: true` (the default) parses and returns what WOULD be written, with
 * every rejected line, and writes nothing; the page shows that preview and the person confirms.
 * A real import writes all valid rows in one transaction, so it lands whole or not at all.
 */
router.post('/api/admin/marketing/ad-spend/import', requireAdmin, async (req: Request, res: Response) => {
  const body = ImportBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  const parsed = parseSpendCsv(body.data.csv, body.data.platform);
  const totalCents = parsed.rows.reduce((t, r) => t + r.amountCents, 0);
  const summary = {
    rows: parsed.rows.length, totalCents, errors: parsed.errors, skippedTotals: parsed.skippedTotals,
    mapping: parsed.mapping, preview: parsed.rows.slice(0, 20),
  };
  if (body.data.dryRun || parsed.rows.length === 0) return res.json({ ...summary, written: 0, dryRun: true });
  try {
    const written = await upsertSpend(parsed.rows, 'csv', who(req));
    res.json({ ...summary, written, dryRun: false });
  } catch (err) {
    fail(res, err, 'import ad spend');
  }
});

router.post('/api/admin/marketing/ad-spend/sync-meta', requireAdmin, async (req: Request, res: Response) => {
  const body = SyncBody.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);
  try {
    const result = await syncMetaSpend({ days: body.data.days, triggeredBy: who(req) ?? 'admin' });
    // A skipped or failed sync is a normal answer, not a server error: the page shows its reason.
    res.json(result);
  } catch (err) {
    fail(res, err, 'sync spend from Meta');
  }
});

export default router;
