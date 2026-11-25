/**
 * Voice Studio: Call Explorer, Trust Center, Quality & Release, Costs & Operations (VS3.5).
 * Read-only, absent (404) unless VOICE_STUDIO_UI_ENABLED is on. No phone number, transcript text or
 * tool argument is returned.
 *
 *   GET /api/admin/voice-studio/calls?days&engine&state&test&limit
 *   GET /api/admin/voice-studio/calls/:id                  detail + trust timeline
 *   GET /api/admin/voice-studio/calls/:id/timeline.csv     audit export: requireFullAdmin, redacted
 *   GET /api/admin/voice-studio/quality                    rubric + evaluation runs
 *   GET /api/admin/voice-studio/costs?days                 actual vs estimated, caps, operations
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import * as Auth from '../../middlewares/authMiddleware';
import { loadVoiceConfig } from '../../services/voice/voiceConfig';
import * as Store from '../../services/voice/studio/evidenceStore';
import { buildTimeline, timelineCsv } from '../../services/voice/studio/trustTimeline';
import { DIMENSIONS } from '../../services/voice/testlab/grade';

export interface EvidenceDeps {
  enabled: () => boolean;
  config: () => Pick<ReturnType<typeof loadVoiceConfig>, 'VOICE_TEST_MAX_ATTEMPTS' | 'VOICE_TEST_MAX_DURATION_SECONDS' | 'VOICE_TEST_BUDGET_USD'>;
  store: Pick<typeof Store, 'listCalls' | 'getCallDetail' | 'listEvaluations' | 'loadCosts'>;
}
export const productionEvidenceDeps = (): EvidenceDeps => ({
  enabled: () => { const c = loadVoiceConfig(); return c.valid && c.VOICE_STUDIO_UI_ENABLED; },
  config: () => loadVoiceConfig(),
  store: Store,
});

const requireAdmin = (req: Request, res: Response, next: NextFunction): void => Auth.requireAdmin(req, res, next);
const requireFullAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (typeof Auth.requireFullAdmin !== 'function') { res.status(500).json({ error: 'AuthUnavailable' }); return; }
  Auth.requireFullAdmin(req, res, next);
};

const ListQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  engine: z.enum(['conversation_relay', 'openai_realtime', 'synthflow_legacy']).optional(),
  state: z.string().regex(/^[a-z_]{3,30}$/).optional(),
  test: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();
const DaysQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }).strict();
const Uuid = z.string().uuid();

export function buildVoiceStudioEvidenceRouter(deps: () => EvidenceDeps = productionEvidenceDeps): Router {
  const router = Router();
  const gate = (_req: Request, _res: Response, next: NextFunction) => (deps().enabled() ? next() : next('router'));
  const bad = (res: Response): void => { res.status(400).json({ error: 'ValidationError' }); };
  const fail = (res: Response, event: string, e: unknown): void => {
    const errorClass = (e as { name?: string })?.name || 'DatabaseError';
    console.warn(JSON.stringify({ level: 'error', service: 'voice-studio', event, outcome: 'failure', error_class: errorClass }));
    res.status(500).json({ error: errorClass });
  };

  router.get('/api/admin/voice-studio/calls', gate, requireAdmin, async (req, res) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) { bad(res); return; }
    try {
      const { test, ...rest } = q.data;
      res.json({ calls: await deps().store.listCalls({ ...rest, testMode: test === undefined ? undefined : test === 'true' }) });
    } catch (e) { fail(res, 'voice_calls_list_failed', e); }
  });

  router.get('/api/admin/voice-studio/calls/:id', gate, requireAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    if (!id.success) { bad(res); return; }
    try {
      const d = await deps().store.getCallDetail(id.data);
      if (!d) { res.status(404).json({ error: 'NotFound' }); return; }
      res.json({ call: d.row, turns: d.turns, usage: d.usage, reconciliation: d.reconciliation, timeline: buildTimeline(d) });
    } catch (e) { fail(res, 'voice_call_detail_failed', e); }
  });

  router.get('/api/admin/voice-studio/calls/:id/timeline.csv', gate, requireAdmin, requireFullAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    if (!id.success) { bad(res); return; }
    try {
      const d = await deps().store.getCallDetail(id.data);
      if (!d) { res.status(404).json({ error: 'NotFound' }); return; }
      console.log(JSON.stringify({ level: 'info', service: 'voice-studio', event: 'voice_audit_export', outcome: 'success', call_id: id.data, actor: req.admin?.sub ?? null }));
      res.status(200).type('text/csv').set('Cache-Control', 'no-store')
        .set('Content-Disposition', `attachment; filename="voice-call-${id.data}.csv"`).send(timelineCsv(buildTimeline(d)));
    } catch (e) { fail(res, 'voice_audit_export_failed', e); }
  });

  router.get('/api/admin/voice-studio/quality', gate, requireAdmin, async (_req, res) => {
    try {
      res.json({ rubric: DIMENSIONS.map(({ key, weight, critical }) => ({ key, weight, critical })), passMark: 90, runs: await deps().store.listEvaluations() });
    } catch (e) { fail(res, 'voice_quality_failed', e); }
  });

  router.get('/api/admin/voice-studio/costs', gate, requireAdmin, async (req, res) => {
    const q = DaysQuery.safeParse(req.query);
    if (!q.success) { bad(res); return; }
    try {
      const c = deps().config();
      res.json({
        days: q.data.days, ...(await deps().store.loadCosts(q.data.days)),
        caps: { testAttemptsPerRun: c.VOICE_TEST_MAX_ATTEMPTS, testMaxSeconds: c.VOICE_TEST_MAX_DURATION_SECONDS, testBudgetUsd: c.VOICE_TEST_BUDGET_USD },
      });
    } catch (e) { fail(res, 'voice_costs_failed', e); }
  });
  return router;
}

export default buildVoiceStudioEvidenceRouter();
