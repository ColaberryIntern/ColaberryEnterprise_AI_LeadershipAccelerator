import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { paramsSchemaFor, SCREEN_PATHS } from '../../services/admissionsOps/agentManifest';
import { countOpenApprovals, decideApproval, handleIntent, type Caller } from '../../services/admissionsOps/intentService';
import { logFailure, sendValidated } from '../campusRoutes';

/**
 * The agent's door into the Admissions & Ops workspace (AO2.3, kit AGENT_CONTROL_SURFACE.md section 4), and the
 * person's decision on what it prepared. Under /api/admin/admissions-ops, so mgmtSectionGate maps it to
 * 'admissions_ops'; every route also carries requireSection('admissions_ops').
 *
 *   POST /agent/intents             navigate | invoke | annotate. Body and action params are Zod-validated (400 on
 *                                   anything malformed or undeclared). Returns the outcome; level 5 returns an approval.
 *   POST /approvals/:id/decide      approve | hold, by a person. The agent (X-Ops-Actor: agent) is refused (403) and
 *                                   the refusal is logged; a level-5 item needs the owner.
 *   GET  /approvals/count           the open count for the section bar.
 * No external call is made, so there is nothing to retry; a database failure is logged with its class and is a 500.
 */
const SCREEN_IDS = Object.keys(SCREEN_PATHS) as [string, ...string[]];
const RequestId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const IntentBody = z.object({
  request_id: RequestId,
  type: z.enum(['navigate', 'invoke', 'annotate']),
  screen: z.enum(SCREEN_IDS),
  action: z.string().regex(/^[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/).optional(),
  params: z.record(z.string(), z.string()).default({}),
}).strict();
const IntentResult = z.object({ request_id: z.string(), outcome: z.enum(['done', 'drafted', 'sent_to_approval', 'refused']), reason: z.string().nullable(), approval_id: z.string().uuid().nullable(), replayed: z.boolean() });
const DecideBody = z.object({ decision: z.enum(['approve', 'hold']) }).strict();
const DecideResult = z.object({ status: z.literal('decided'), approval_id: z.string().uuid(), decision: z.enum(['approved', 'held']), decided_by: z.string(), already: z.boolean() });
const IdParams = z.object({ id: z.string().uuid() });

/** Who is calling: the signed-in staff member, and whether the agent is acting through their session. */
export function callerOf(req: Request): Caller {
  const actor = String(req.header('x-ops-actor') ?? '').toLowerCase() === 'agent' ? 'agent' : 'person';
  const clip = (v: string | undefined, n: number) => (v ? v.slice(0, n) : null);
  return {
    onBehalfOf: req.admin?.email || req.admin?.sub || 'unknown',
    mgmtRole: req.admin?.mgmt_role,
    actor,
    agentId: actor === 'agent' ? clip(req.header('x-ops-agent-id'), 64) ?? 'agent' : null,
    agentVersion: actor === 'agent' ? clip(req.header('x-ops-agent-version'), 32) : null,
  };
}

export async function postIntent(req: Request, res: Response): Promise<void> {
  const body = IntentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Malformed intent.', issues: body.error.issues.length }); return; }
  const b = body.data;
  if (b.type === 'invoke' && !b.action) { res.status(400).json({ error: 'An invoke names an action.' }); return; }
  if (b.action) {
    const schema = paramsSchemaFor(b.action);
    if (!schema) { res.status(400).json({ error: 'Unknown action.' }); return; }
    if (!b.action.startsWith(`${b.screen}.`) && b.type !== 'navigate') { res.status(400).json({ error: 'The action is not on that screen.' }); return; }
    if (!schema.safeParse(b.params).success) { res.status(400).json({ error: 'The action params are invalid.' }); return; }
  }
  try {
    const result = await handleIntent({ request_id: b.request_id, type: b.type, screen: b.screen, action: b.action, params: b.params }, callerOf(req));
    res.status(result.outcome === 'sent_to_approval' && !result.replayed ? 202 : 200);
    sendValidated(res, IntentResult, result, 'admissions_ops_intent');
  } catch (err) {
    logFailure('admissions_ops_intent_failed', err);
    res.status(500).json({ error: 'The request was not recorded. Nothing was done.' });
  }
}

export async function postDecide(req: Request, res: Response): Promise<void> {
  const params = IdParams.safeParse(req.params);
  const body = DecideBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: 'Malformed decision.' }); return; }
  const requestId = RequestId.safeParse(req.header('x-request-id')).success ? String(req.header('x-request-id')) : `decide-${randomUUID()}`;
  try {
    const r = await decideApproval(params.data.id, body.data.decision, callerOf(req), requestId);
    if (r.status === 'not_found') { res.status(404).json({ error: 'No such approval.' }); return; }
    if (r.status === 'refused') { res.status(403).json({ error: 'You cannot decide this item.', reason: r.reason }); return; }
    sendValidated(res, DecideResult, r, 'admissions_ops_decide');
  } catch (err) {
    logFailure('admissions_ops_decide_failed', err);
    res.status(500).json({ error: 'The decision was not recorded.' });
  }
}

export async function getApprovalCount(_req: Request, res: Response): Promise<void> {
  try {
    sendValidated(res, z.object({ open: z.number().int().nonnegative() }), { open: await countOpenApprovals() }, 'admissions_ops_approval_count');
  } catch (err) {
    logFailure('admissions_ops_approval_count_failed', err);
    res.status(500).json({ error: 'Could not count approvals.' });
  }
}

const router = Router();
router.post('/api/admin/admissions-ops/agent/intents', requireSection('admissions_ops'), postIntent);
router.post('/api/admin/admissions-ops/approvals/:id/decide', requireSection('admissions_ops'), postDecide);
router.get('/api/admin/admissions-ops/approvals/count', requireSection('admissions_ops'), getApprovalCount);

export default router;
