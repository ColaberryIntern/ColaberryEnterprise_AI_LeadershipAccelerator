import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { whatsappStatus } from '../../services/commsHub/whatsapp/whatsappStatus';
import {
  GroupNotFoundError, GroupNotSendableError, listWhatsAppGroups, setGroupEnabled, syncWhatsAppGroups, type WhatsAppGroupView,
} from '../../services/commsHub/whatsapp/whatsappGroups';
import { NotConnectedError, WhatsAppProviderError } from '../../services/commsHub/whatsapp/provider';
import { sendStateStore } from '../../services/commsHub/whatsapp/sendState';
import { logActivity } from '../../services/commsHub/activityLog';
import { logFailure, sendValidated } from '../campusRoutes';
import { actorOf } from './commsHubEventRoutes';

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
  /** CH10.4: WhatsApp limited the number, so the hub stopped WhatsApp sends until this instant. */
  paused_until: z.string().datetime().nullable(),
}).strict();

/** CH10.4: who may clear the breaker early (with a confirm): legacy admins, owners, admins, community organizers. */
const CLEAR_ROLES = new Set(['owner', 'admin', 'community_organizer']);
function mayClearBreaker(req: Request): boolean {
  const a = req.admin as { role?: string; mgmt_role?: string } | undefined;
  if (!a) return false;
  if (a.mgmt_role) return CLEAR_ROLES.has(a.mgmt_role);
  return a.role === 'admin' || a.role === 'super_admin';
}

async function pausedUntil(): Promise<string | null> {
  try {
    const s = await sendStateStore.read();
    return s.breaker_until && s.breaker_until.getTime() > Date.now() ? s.breaker_until.toISOString() : null;
  } catch (err) {
    logFailure('comms_hub_whatsapp_breaker_read_failed', err);
    return null;
  }
}

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
      paused_until: await pausedUntil(),
    };
    sendValidated(res, WhatsAppStatusSchema, body, 'comms_hub_whatsapp_status');
  } catch (err) {
    logFailure('comms_hub_whatsapp_status_failed', err);
    res.status(500).json({ error: 'The WhatsApp status could not be loaded.', error_class: 'StatusFailed' });
  }
});

/**
 * CH10.2 groups: list, sync from WhatsApp, and switch sending on or off per group. Each group in an
 * answer is built field by field (no provider ids, no participant numbers).
 */
const GroupSchema = z.object({
  id: z.string().uuid(), name: z.string(), participants_count: z.number().int().nonnegative(),
  enabled: z.boolean(), sendable: z.boolean(), cant_send_reason: z.string().nullable(), last_synced_at: z.string(),
}).strict();
const GroupsSchema = z.object({ groups: z.array(GroupSchema) }).strict();
const SyncSchema = z.object({ listed: z.number().int().nonnegative(), added: z.number().int().nonnegative(), left: z.number().int().nonnegative() }).strict();
const GroupParams = z.object({ id: z.string().uuid() }).strict();
const EnableBody = z.object({ enabled: z.boolean() }).strict();
const pick = (g: WhatsAppGroupView): WhatsAppGroupView => ({
  id: g.id, name: g.name, participants_count: g.participants_count, enabled: g.enabled, sendable: g.sendable,
  cant_send_reason: g.cant_send_reason, last_synced_at: g.last_synced_at,
});

router.get('/api/admin/comms-hub/whatsapp/groups', requireSection('comms_hub'), async (_req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store');
    sendValidated(res, GroupsSchema, { groups: (await listWhatsAppGroups()).map(pick) }, 'comms_hub_whatsapp_groups');
  } catch (err) {
    logFailure('comms_hub_whatsapp_groups_failed', err);
    res.status(500).json({ error: 'The WhatsApp groups could not be loaded.', error_class: 'GroupsFailed' });
  }
});

router.post('/api/admin/comms-hub/whatsapp/groups/sync', requireSection('comms_hub'), async (req: Request, res: Response) => {
  try {
    const r = await syncWhatsAppGroups(actorOf(req));
    sendValidated(res, SyncSchema, { listed: r.listed, added: r.added, left: r.left }, 'comms_hub_whatsapp_sync');
  } catch (err) {
    if (err instanceof NotConnectedError) { res.status(409).json({ error: err.message, error_class: 'NotConnectedError' }); return; }
    if (err instanceof WhatsAppProviderError) {
      logFailure('comms_hub_whatsapp_sync_upstream', err);
      res.status(503).json({ error: 'WhatsApp did not answer, so nothing changed. Try again in a minute.', error_class: err.errorClass });
      return;
    }
    logFailure('comms_hub_whatsapp_sync_failed', err);
    res.status(500).json({ error: 'The WhatsApp groups could not be synced.', error_class: 'SyncFailed' });
  }
});

router.put('/api/admin/comms-hub/whatsapp/groups/:id', requireSection('comms_hub'), async (req: Request, res: Response) => {
  const p = GroupParams.safeParse(req.params);
  const b = EnableBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: 'Send { "enabled": true or false } for a group id.', error_class: 'ValidationError' }); return; }
  try {
    sendValidated(res, z.object({ group: GroupSchema }).strict(), { group: pick(await setGroupEnabled(p.data.id, b.data.enabled, actorOf(req))) }, 'comms_hub_whatsapp_group');
  } catch (err) {
    if (err instanceof GroupNotFoundError) { res.status(404).json({ error: err.message, error_class: 'NotFound' }); return; }
    if (err instanceof GroupNotSendableError) { res.status(409).json({ error: err.message, error_class: 'GroupNotSendable' }); return; }
    logFailure('comms_hub_whatsapp_group_failed', err);
    res.status(500).json({ error: 'The group could not be changed.', error_class: 'GroupFailed' });
  }
});

/**
 * CH10.4 POST /whatsapp/breaker/clear {confirm: true}: resume WhatsApp sends before the 48 hours are up.
 * WhatsApp limited the number for a reason, so this needs the hub section AND an organizer-level role,
 * an explicit confirm, and leaves an activity row naming who did it.
 */
const ClearBody = z.object({ confirm: z.literal(true) }).strict();
router.post('/api/admin/comms-hub/whatsapp/breaker/clear', requireSection('comms_hub'), async (req: Request, res: Response) => {
  if (!mayClearBreaker(req)) { res.status(403).json({ error: 'Only an owner, admin or community organizer can resume WhatsApp early.', error_class: 'Forbidden' }); return; }
  if (!ClearBody.safeParse(req.body).success) { res.status(400).json({ error: 'Send { "confirm": true } to resume WhatsApp sends.', error_class: 'ValidationError' }); return; }
  try {
    const was = await sendStateStore.clearBreaker();
    await logActivity(actorOf(req), 'whatsapp.breaker_cleared', 'settings', null, { was_until: was ? was.toISOString() : null });
    res.json({ cleared: was !== null });
  } catch (err) {
    logFailure('comms_hub_whatsapp_breaker_clear_failed', err);
    res.status(500).json({ error: 'WhatsApp could not be resumed.', error_class: 'BreakerClearFailed' });
  }
});

export default router;
