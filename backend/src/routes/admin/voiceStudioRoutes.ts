/**
 * Voice Studio admin routes (VS2.5 Test Lab). requireAdmin on every route (route-auth lint); scoped
 * staff tokens are additionally filtered by mgmtSectionGate before reaching here.
 *
 *   POST /api/admin/voice-studio/tests          start ONE live test call (body: runId, destinationId,
 *                                               engine, script, confirm:true). Never a phone number.
 *   GET  /api/admin/voice-studio/tests/:callId  the call's state (no number, no transcript)
 *
 * Both routes do not exist (404) unless VOICE_TEST_ENABLED is on.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { QueryTypes } from 'sequelize';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import { loadVoiceConfig } from '../../services/voice/voiceConfig';
import { productionTestLabDeps, startLiveTest, TEST_TENANT_ID, type TestLabDeps } from '../../services/voice/testlab/testLabService';
import { buildVoiceStudioConsoleRouter } from './voiceStudioConsoleRoutes';

const CallIdSchema = z.string().uuid();

export function buildVoiceStudioRouter(deps: () => TestLabDeps = productionTestLabDeps, enabled: () => boolean = () => {
  const c = loadVoiceConfig();
  return c.valid && c.VOICE_TEST_ENABLED;
}): Router {
  const router = Router();
  const gate = (_req: Request, _res: Response, next: NextFunction) => (enabled() ? next() : next('router'));

  router.post('/api/admin/voice-studio/tests', gate, requireAdmin, async (req: Request, res: Response) => {
    const operator = req.admin?.sub ?? 'admin'; // the admin's id, never their email, in logs
    try {
      const r = await startLiveTest(req.body, operator, deps());
      res.status(r.status).json(r.body);
    } catch (e) {
      console.warn(JSON.stringify({ level: 'error', service: 'voice-studio', event: 'voice_test_start_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'TestLabError' }));
      res.status(500).json({ error: 'TestLabError' });
    }
  });

  router.get('/api/admin/voice-studio/tests/:callId', gate, requireAdmin, async (req: Request, res: Response) => {
    const id = CallIdSchema.safeParse(req.params.callId);
    if (!id.success) { res.status(400).json({ error: 'ValidationError' }); return; }
    try {
      const rows = await sequelize.query<{ state: string; engine: string; error_class: string | null; human_answered: boolean; created_at: Date; ended_at: Date | null }>(
        'SELECT state, engine, error_class, human_answered, created_at, ended_at FROM voice_calls WHERE id = :id AND tenant_id = :t',
        { replacements: { id: id.data, t: TEST_TENANT_ID }, type: QueryTypes.SELECT });
      if (!rows.length) { res.status(404).json({ error: 'NotFound' }); return; }
      res.json(rows[0]);
    } catch (e) {
      console.warn(JSON.stringify({ level: 'error', service: 'voice-studio', event: 'voice_test_status_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'DatabaseError' }));
      res.status(500).json({ error: 'DatabaseError' });
    }
  });
  return router;
}

/**
 * The one router adminRoutes.ts mounts for Voice Studio: the Test Lab (VS2.5) plus the console API
 * (VS3.3). Composed here so the oversized adminRoutes.ts needs no new lines.
 */
const voiceStudioAdmin = Router();
voiceStudioAdmin.use(buildVoiceStudioRouter());
voiceStudioAdmin.use(buildVoiceStudioConsoleRouter());
export default voiceStudioAdmin;
