/**
 * Voice Studio: Voice Lab and Numbers & Routing API (VS3.4). Absent (404) unless
 * VOICE_STUDIO_UI_ENABLED is on. None of these routes places a call, buys, ports or releases a number.
 *
 *   GET  /api/admin/voice-studio/lab/catalog                   verified voices (voiceCatalog.ts)
 *   POST /api/admin/voice-studio/lab/preview                   { voice, text } -> audio/mpeg (rate-limited)
 *   POST /api/admin/voice-studio/lab/ab                        { voiceA, voiceB, text } -> blind trial (labels only)
 *   GET  /api/admin/voice-studio/lab/ab/:id                    the trial; names only after scoring
 *   GET  /api/admin/voice-studio/lab/ab/:id/clip/:label        audio for X or Y (rate-limited)
 *   POST /api/admin/voice-studio/lab/ab/:id/score              { preferred: X|Y|tie } -> reveals
 *   GET  /api/admin/voice-studio/numbers                       numbers we hold (never the number itself)
 *   GET  /api/admin/voice-studio/routes                        routes with 7-day call counts
 *   POST /api/admin/voice-studio/routes/validate               { routeId?, change } -> issues or impact + token
 *   POST /api/admin/voice-studio/routes/apply                  { routeId?, change, validationToken } (full admin)
 *
 * A route change without a matching, unexpired validation token is refused (409 validation_required /
 * validation_expired / validation_mismatch). Applying needs requireFullAdmin, like publishing.
 */
import { tapVoiceLog } from '../../services/voice/ops/opsMetrics';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import * as Auth from '../../middlewares/authMiddleware';
import { loadVoiceConfig } from '../../services/voice/voiceConfig';
import { voiceCatalog } from '../../services/voice/studio/voiceCatalog';
import { LabError, PreviewLimiter, PreviewSchema, clipVoice, createTrial, openAiSynth, publicTrial, scoreTrial, type Synth, type TrialStore } from '../../services/voice/studio/voiceLab';
import { RouteChangeSchema, checkValidationToken, describeImpact, mintValidationToken, validateRouteChange, type RouteChange } from '../../services/voice/studio/routeChange';
import * as LabStore from '../../services/voice/studio/labStore';

export interface LabDeps {
  enabled: () => boolean;
  relayVoice: () => string | undefined;
  synth: Synth;
  limiter: PreviewLimiter;
  trials: TrialStore;
  store: Pick<typeof LabStore, 'listNumbers' | 'listRoutes' | 'getRoute' | 'versionFacts' | 'applyRouteChange'>;
  tokenKey: () => Buffer;
  now: () => number;
}

let shared: LabDeps | null = null;
export function productionLabDeps(): LabDeps {
  if (shared) return shared;
  shared = {
    enabled: () => { const c = loadVoiceConfig(); return c.valid && c.VOICE_STUDIO_UI_ENABLED; },
    relayVoice: () => loadVoiceConfig().VOICE_RELAY_VOICE,
    synth: (voice, text) => openAiSynth(process.env.OPENAI_API_KEY)(voice, text),
    limiter: new PreviewLimiter(),
    trials: LabStore.sqlTrialStore,
    store: LabStore,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    tokenKey: () => (require('../../services/voice/twilio/correlationToken') as typeof import('../../services/voice/twilio/correlationToken')).correlationKey(),
    now: () => Date.now(),
  };
  return shared;
}

const requireAdmin = (req: Request, res: Response, next: NextFunction): void => Auth.requireAdmin(req, res, next);
const requireFullAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (typeof Auth.requireFullAdmin !== 'function') { res.status(500).json({ error: 'AuthUnavailable' }); return; }
  Auth.requireFullAdmin(req, res, next);
};

const Uuid = z.string().uuid();
const ValidateBody = z.object({ routeId: z.string().uuid().nullable().optional(), change: z.unknown() }).strict();
const ApplyBody = z.object({ routeId: z.string().uuid().nullable().optional(), change: z.unknown(), validationToken: z.string().max(200).optional() }).strict();

const STATUS: Record<string, number> = { ValidationError: 400, RateLimitError: 429, NotFound: 404, Conflict: 409, UpstreamUnavailable: 502, ConfigMissing: 503 };
function fail(res: Response, event: string, e: unknown): void {
  const errorClass = e instanceof LabError ? e.errorClass : (e as { name?: string })?.name || 'StudioError';
  const status = STATUS[errorClass] ?? 500;
  if (status >= 500) console.warn(JSON.stringify(tapVoiceLog({ level: 'error', service: 'voice-studio', event, outcome: 'failure', error_class: errorClass })));
  res.status(status).json({ error: errorClass, message: status >= 500 ? undefined : (e as Error).message });
}

export function buildVoiceStudioLabRouter(deps: () => LabDeps = productionLabDeps): Router {
  const router = Router();
  const gate = (_req: Request, _res: Response, next: NextFunction) => (deps().enabled() ? next() : next('router'));
  const actor = (req: Request): string => req.admin?.sub ?? '';
  const audio = (res: Response, buf: Buffer) => { res.status(200).type('audio/mpeg').set('Cache-Control', 'no-store').send(buf); };
  const limited = (req: Request, res: Response): boolean => {
    if (deps().limiter.take(actor(req) || 'unknown', deps().now())) return false;
    res.status(429).json({ error: 'RateLimitError', message: 'Preview limit reached for this hour. Try again later.' });
    return true;
  };

  router.get('/api/admin/voice-studio/lab/catalog', gate, requireAdmin, (_req, res) => { res.json({ voices: voiceCatalog(deps().relayVoice()) }); });

  router.post('/api/admin/voice-studio/lab/preview', gate, requireAdmin, async (req, res) => {
    const p = PreviewSchema.safeParse(req.body);
    if (!p.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    if (limited(req, res)) return;
    try { audio(res, await deps().synth(p.data.voice, p.data.text)); } catch (e) { fail(res, 'voice_lab_preview_failed', e); }
  });

  router.post('/api/admin/voice-studio/lab/ab', gate, requireAdmin, async (req, res) => {
    try { res.status(201).json(await createTrial(deps().trials, req.body, actor(req))); } catch (e) { fail(res, 'voice_lab_ab_create_failed', e); }
  });

  router.get('/api/admin/voice-studio/lab/ab/:id', gate, requireAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const t = await deps().trials.get(id.data);
      if (!t) { res.status(404).json({ error: 'NotFound' }); return; }
      res.json(publicTrial(t));
    } catch (e) { fail(res, 'voice_lab_ab_get_failed', e); }
  });

  router.get('/api/admin/voice-studio/lab/ab/:id/clip/:label', gate, requireAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const { voice, text } = await clipVoice(deps().trials, id.data, String(req.params.label));
      if (limited(req, res)) return;
      audio(res, await deps().synth(voice, text));
    } catch (e) { fail(res, 'voice_lab_ab_clip_failed', e); }
  });

  router.post('/api/admin/voice-studio/lab/ab/:id/score', gate, requireAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    if (!id.success || !actor(req)) { res.status(400).json({ error: 'ValidationError' }); return; }
    try { res.json(await scoreTrial(deps().trials, id.data, req.body, actor(req))); } catch (e) { fail(res, 'voice_lab_ab_score_failed', e); }
  });

  router.get('/api/admin/voice-studio/numbers', gate, requireAdmin, async (_req, res) => {
    try { res.json({ numbers: await deps().store.listNumbers() }); } catch (e) { fail(res, 'voice_numbers_list_failed', e); }
  });

  router.get('/api/admin/voice-studio/routes', gate, requireAdmin, async (_req, res) => {
    try { res.json({ routes: await deps().store.listRoutes() }); } catch (e) { fail(res, 'voice_routes_list_failed', e); }
  });

  const check = async (routeId: string | null, change: unknown) => {
    const d = deps();
    // Shape first: nothing unvalidated reaches the database (a bad version id was a 500, not an issue).
    const shape = RouteChangeSchema.safeParse(change);
    if (!shape.success) return { status: 200 as const, current: null, v: validateRouteChange(change, { versionPublished: false }) };
    const current = routeId ? await d.store.getRoute(routeId) : null;
    if (routeId && !current) return { status: 404 as const };
    const facts = await d.store.versionFacts(shape.data.versionId);
    return { status: 200 as const, current, v: validateRouteChange(shape.data, { versionPublished: facts.versionPublished }) };
  };

  router.post('/api/admin/voice-studio/routes/validate', gate, requireAdmin, async (req, res) => {
    const b = ValidateBody.safeParse(req.body);
    if (!b.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const routeId = b.data.routeId ?? null;
      const r = await check(routeId, b.data.change);
      if (r.status === 404) { res.status(404).json({ error: 'NotFound' }); return; }
      if (!r.v.ok) { res.json({ ok: false, issues: r.v.issues }); return; }
      const impact = describeImpact(r.current?.mode ?? null, r.v.change, r.current?.calls_7d ?? 0);
      res.json({ ok: true, impact, validationToken: mintValidationToken(deps().tokenKey(), routeId, r.v.change, deps().now()) });
    } catch (e) { fail(res, 'voice_route_validate_failed', e); }
  });

  router.post('/api/admin/voice-studio/routes/apply', gate, requireAdmin, requireFullAdmin, async (req, res) => {
    const b = ApplyBody.safeParse(req.body);
    if (!b.success || !actor(req)) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const routeId = b.data.routeId ?? null;
      const r = await check(routeId, b.data.change);
      if (r.status === 404) { res.status(404).json({ error: 'NotFound' }); return; }
      // Validity is re-checked at apply time: a version retired since validation is caught here.
      if (!r.v.ok) { res.status(400).json({ error: 'ValidationError', issues: r.v.issues }); return; }
      const t = checkValidationToken(deps().tokenKey(), b.data.validationToken, routeId, r.v.change as RouteChange, deps().now());
      if (!t.ok) { res.status(409).json({ error: t.reason, message: 'Validate this exact change first, then apply it within 10 minutes.' }); return; }
      const applied = await deps().store.applyRouteChange(routeId, r.v.change, actor(req));
      if (!applied) { res.status(409).json({ error: 'Conflict', message: 'Another route already uses this path key.' }); return; }
      console.log(JSON.stringify(tapVoiceLog({ level: 'info', service: 'voice-studio', event: 'voice_route_applied', outcome: 'success', route_id: applied.id, mode: r.v.change.mode, canary_percent: r.v.change.canaryPercent })));
      res.json({ ok: true, routeId: applied.id });
    } catch (e) { fail(res, 'voice_route_apply_failed', e); }
  });

  return router;
}

export default buildVoiceStudioLabRouter();
