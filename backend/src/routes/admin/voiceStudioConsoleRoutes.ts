/**
 * Voice Studio console API (VS3.3): Overview and Agents. None of these routes exist (404) unless
 * VOICE_STUDIO_UI_ENABLED is on, and none of them places a call.
 *
 *   GET  /api/admin/voice-studio/overview?days=7&mode=live|test     KPIs with provenance + denominators
 *   GET  /api/admin/voice-studio/agents                              agent cards
 *   GET  /api/admin/voice-studio/agents/:profileId/versions          versions (newest first)
 *   POST /api/admin/voice-studio/agents/:profileId/versions          save a DRAFT (idempotent on content)
 *   POST /api/admin/voice-studio/agents/:profileId/validate          dry check of content: schema, rendered
 *                                                                    preview, effective tools. Writes nothing.
 *   POST /api/admin/voice-studio/versions/:versionId/:action         approve | publish | retire
 *
 * Auth: requireAdmin on every route (route-auth lint). approve/publish/retire additionally need
 * requireFullAdmin: a scoped staff role (mentor, support, organizer) also carries role 'admin', so
 * requireAdmin alone would let it publish what a phone agent says. Author and approver must differ
 * (four eyes, enforced in versionContent.transition).
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import * as Auth from '../../middlewares/authMiddleware';
import { loadVoiceConfig } from '../../services/voice/voiceConfig';
import { computeOverview } from '../../services/voice/studio/overviewMetrics';
import * as Q from '../../services/voice/studio/studioQueries';
import * as Store from '../../services/voice/profiles/profileStore';
import { VersionContentSchema, renderCall, contentHash, normalizeContent } from '../../services/voice/profiles/versionContent';
import { effectiveVoiceTools } from '../../services/voice/profiles/voiceToolPolicy';
import { nextOpenSlotsTool } from '../../services/voice/engines/toolBroker';
import { admissionsKnowledgeTool } from '../../services/voice/profiles/knowledgeTool';

export interface ConsoleDeps {
  queries: Pick<typeof Q, 'loadOverviewRows' | 'listAgentCards' | 'listVersions' | 'getProfile'>;
  store: Pick<typeof Store, 'createDraftVersion' | 'changeVersionStatus'>;
  enabled: () => boolean;
  config: () => ReturnType<typeof loadVoiceConfig>;
}

export const productionConsoleDeps = (): ConsoleDeps => ({
  queries: Q, store: Store, config: () => loadVoiceConfig(),
  enabled: () => { const c = loadVoiceConfig(); return c.valid && c.VOICE_STUDIO_UI_ENABLED; },
});

const OverviewQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(7), mode: z.enum(['live', 'test']).default('live') }).strict();
const Uuid = z.string().uuid();
const Action = z.enum(['approve', 'publish', 'retire']);
const DraftBody = z.object({ content: z.unknown() }).strict();
const ValidateBody = z.object({ content: z.unknown(), samplePrompt: z.string().max(4_000).optional() }).strict();

/** Tool definitions only matter for the policy preview; their sources are never called here. */
const PREVIEW_TOOLS = [nextOpenSlotsTool(async () => ({ dates: [], timezone: 'America/Chicago' })), admissionsKnowledgeTool(async () => [])];

const fail = (res: Response, event: string, e: unknown): void => {
  const errorClass = (e as { errorClass?: string; name?: string })?.errorClass ?? (e as { name?: string })?.name ?? 'StudioError';
  const status = errorClass === 'ValidationError' ? 400 : errorClass === 'NotFound' ? 404 : errorClass === 'LifecycleError' ? 409 : 500;
  if (status === 500) console.warn(JSON.stringify({ level: 'error', service: 'voice-studio', event, outcome: 'failure', error_class: errorClass }));
  res.status(status).json({ error: errorClass, message: status === 500 ? undefined : (e as Error).message });
};

/**
 * Resolved per request, not at import: several existing route tests replace authMiddleware with a
 * partial mock, and a guard captured at import would be undefined there and break module load for
 * every router that composes this one. A missing guard at request time fails CLOSED (500, no handler).
 */
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => Auth.requireAdmin(req, res, next);
const requireFullAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (typeof Auth.requireFullAdmin !== 'function') { res.status(500).json({ error: 'AuthUnavailable' }); return; }
  Auth.requireFullAdmin(req, res, next);
};

export function buildVoiceStudioConsoleRouter(deps: () => ConsoleDeps = productionConsoleDeps): Router {
  const router = Router();
  const gate = (_req: Request, _res: Response, next: NextFunction) => (deps().enabled() ? next() : next('router'));
  const actor = (req: Request): string => req.admin?.sub ?? '';

  router.get('/api/admin/voice-studio/overview', gate, requireAdmin, async (req, res) => {
    const q = OverviewQuery.safeParse(req.query);
    if (!q.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const d = deps();
      const c = d.config();
      const rows = await d.queries.loadOverviewRows(q.data.mode, q.data.days);
      res.json(computeOverview({ mode: q.data.mode, windowDays: q.data.days, ...rows,
        flags: { studioEnabled: c.VOICE_STUDIO_ENABLED, testEnabled: c.VOICE_TEST_ENABLED, gatewayLegacyEnabled: c.VOICE_GATEWAY_LEGACY_ENABLED, engineDefault: c.VOICE_ENGINE_DEFAULT } }));
    } catch (e) { fail(res, 'voice_studio_overview_failed', e); }
  });

  router.get('/api/admin/voice-studio/agents', gate, requireAdmin, async (_req, res) => {
    try { res.json({ agents: await deps().queries.listAgentCards() }); } catch (e) { fail(res, 'voice_studio_agents_failed', e); }
  });

  router.get('/api/admin/voice-studio/agents/:profileId/versions', gate, requireAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.profileId);
    if (!id.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const v = await deps().queries.listVersions(id.data);
      if (!v) { res.status(404).json({ error: 'NotFound' }); return; }
      res.json({ versions: v });
    } catch (e) { fail(res, 'voice_studio_versions_failed', e); }
  });

  router.post('/api/admin/voice-studio/agents/:profileId/versions', gate, requireAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.profileId);
    const body = DraftBody.safeParse(req.body);
    if (!id.success || !body.success || !actor(req)) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const r = await deps().store.createDraftVersion(id.data, body.data.content, actor(req));
      res.status(r.created ? 201 : 200).json(r);
    } catch (e) { fail(res, 'voice_studio_draft_failed', e); }
  });

  router.post('/api/admin/voice-studio/agents/:profileId/validate', gate, requireAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.profileId);
    const body = ValidateBody.safeParse(req.body);
    if (!id.success || !body.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const profile = await deps().queries.getProfile(id.data);
      if (!profile) { res.status(404).json({ error: 'NotFound' }); return; }
      const parsed = VersionContentSchema.safeParse(body.data.content);
      if (!parsed.success) { res.json({ valid: false, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }); return; }
      const content = normalizeContent(parsed.data);
      const tools = effectiveVoiceTools({ agentKey: profile.agent_key, brandSlug: profile.brand_slug, versionPermissions: content.tool_permissions, registered: PREVIEW_TOOLS });
      const preview = renderCall(content, { prompt: body.data.samplePrompt ?? 'Sample call purpose.' });
      res.json({ valid: true, hash: contentHash(content), preview, tools: { allowed: tools.allowed.map((t) => t.def.name), denied: tools.denied } });
    } catch (e) { fail(res, 'voice_studio_validate_failed', e); }
  });

  router.post('/api/admin/voice-studio/versions/:versionId/:action', gate, requireAdmin, requireFullAdmin, async (req, res) => {
    const id = Uuid.safeParse(req.params.versionId);
    const action = Action.safeParse(req.params.action);
    if (!id.success || !action.success || !actor(req)) { res.status(400).json({ error: 'ValidationError' }); return; }
    try { res.json({ version: await deps().store.changeVersionStatus(id.data, action.data, actor(req)) }); } catch (e) { fail(res, 'voice_studio_lifecycle_failed', e); }
  });

  return router;
}

export default buildVoiceStudioConsoleRouter();
