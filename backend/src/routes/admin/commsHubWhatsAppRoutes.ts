import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { whatsappStatus } from '../../services/commsHub/whatsapp/whatsappStatus';
import { logFailure, sendValidated } from '../campusRoutes';

/**
 * CH10.1 GET /api/admin/comms-hub/whatsapp/status: what the WhatsApp card shows. The shape is strict,
 * so a token or a full phone number can never ride along in the answer.
 */
export const WhatsAppStatusSchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  state: z.enum(['not_configured', 'connected', 'waiting_for_qr', 'disconnected']),
  number_last4: z.string().regex(/^\d{4}$/).nullable(),
  reason: z.string().max(300).nullable(),
}).strict();

const router = Router();
router.get('/api/admin/comms-hub/whatsapp/status', requireSection('comms_hub'), async (_req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store');
    // Built field by field: sendValidated only logs a mismatch in production, so the answer itself must
    // be unable to carry anything else (a token, a full number) whatever the service returns.
    const s = await whatsappStatus();
    const body = {
      configured: s.configured, enabled: s.enabled, state: s.state,
      number_last4: typeof s.number_last4 === 'string' && /^\d{4}$/.test(s.number_last4) ? s.number_last4 : null,
      reason: s.reason === null ? null : String(s.reason).slice(0, 300),
    };
    sendValidated(res, WhatsAppStatusSchema, body, 'comms_hub_whatsapp_status');
  } catch (err) {
    logFailure('comms_hub_whatsapp_status_failed', err);
    res.status(500).json({ error: 'The WhatsApp status could not be loaded.', error_class: 'StatusFailed' });
  }
});

export default router;
