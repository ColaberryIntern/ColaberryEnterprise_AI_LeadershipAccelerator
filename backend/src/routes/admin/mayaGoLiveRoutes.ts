import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { isCoryAuthorizedIdentity, requireAdmin } from '../../middlewares/authMiddleware';
import { classifyError } from '../../utils/errorClassifier';
import { AiAgent } from '../../models';
import MayaOutboundApproval from '../../models/MayaOutboundApproval';
import { isKillSwitchActiveStrict } from '../../services/launchSafety';
import { listAllChangeRequests } from '../../services/agentDomain/agentChangeRequestService';
import { registeredToolNames } from '../../services/agentDomain/registeredTools';
import { MAYA_TOOL_GOVERNANCE } from '../../services/maya/mayaToolGovernance';
import {
  DEFAULT_STATES, isRefusedCapability, readPromotionRecord, resolveAllMayaModes,
  type PromotableCapability,
} from '../../services/maya/mayaPromotion';

/**
 * ONE payload that answers "is Maya on, and what may she do", plus the single switch that turns
 * her agent row on and off.
 *
 * ── WHY THIS EXISTS AS ITS OWN ENDPOINT ─────────────────────────────────────────────────────
 *
 * Nothing had ever been promoted in production and her agent row had sat `enabled=false` since it
 * was seeded, and the cause was not a decision: there was no screen. The six facts that decide
 * whether she is actually on lived in six places - the agent row, the promotion record, the M29
 * flags, the kill switch, the tool grants, and the outbound queue - so answering the question
 * meant six queries by hand. A console that needs six round trips does not get built, and a switch
 * that does not get built never gets thrown.
 *
 * So this is deliberately one read. `/admin/maya` renders it and nothing else.
 *
 * ── THE SWITCH IS ONE COLUMN ────────────────────────────────────────────────────────────────
 *
 * `POST /enable` writes `enabled` and nothing else. Not `tools_granted`, not `autonomy_level`,
 * not `status`, not `abac_mode_override` - the four columns that turn an observing agent into an
 * acting one are exactly what `assignExistingToolGrantsOneThing.test.ts` and
 * `agentToolGrantWritesOneColumn.test.ts` pin elsewhere, and the same discipline applies here:
 * enabling an agent must not quietly widen what she is allowed to do while it is at it. Her tools
 * come from the grant spine, her capabilities from the promotion record, and both have their own
 * route and their own approver.
 *
 * ── WHO MAY THROW IT ────────────────────────────────────────────────────────────────────────
 *
 *   enable  Ali or a super_admin   widening, so the same authority as a promotion
 *   disable any admin              narrowing, so the same authority as a revert
 *
 * The check is in the handler rather than in a middleware for the reason
 * `mayaCapabilityRoutes`'s state route gives: one route whose direction depends on the body
 * cannot be split by path, so it runs behind `requireAdmin` and then applies the same exported
 * predicate `requireCoryAuthorized` uses to the direction it computed.
 */

const router = Router();

const EnableBody = z.object({
  enabled: z.boolean(),
  review_note: z.string().trim().min(3).max(500),
});

const AGENT_NAME = 'Maya';

function fail(res: Response, event: string, err: unknown): void {
  const errorClass = classifyError(err);
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'maya', event, outcome: 'failure',
    error_class: errorClass, context: { message: err instanceof Error ? err.message : String(err) },
  }));
  res.status(500).json({ error: 'Maya go-live request failed', error_class: errorClass });
}

/** Which tools each capability governs, derived from the frozen map rather than restated. */
function toolsByCapability(): Map<string, string[]> {
  const byCap = new Map<string, string[]>();
  for (const [tool, entry] of Object.entries(MAYA_TOOL_GOVERNANCE)) {
    const list = byCap.get(entry.capability) ?? [];
    list.push(tool);
    byCap.set(entry.capability, list);
  }
  return byCap;
}

/**
 * The kill switch, reported as three states rather than two.
 *
 * `unreadable` is not a detail. `resolveMayaMode` uses the STRICT reader, so an unreadable switch
 * turns every capability off; a console that showed "clear" in that case would say she is on while
 * she is refusing everything.
 */
async function killSwitchState(): Promise<'active' | 'clear' | 'unreadable'> {
  try {
    return (await isKillSwitchActiveStrict()) ? 'active' : 'clear';
  } catch {
    return 'unreadable';
  }
}

/** Her open tool requests, which is what the grant spine can actually show today. */
async function mayaGrantRequests(): Promise<Array<Record<string, unknown>>> {
  const rows = await listAllChangeRequests(sequelize, 'submitted', 'tool');
  return rows
    .filter((r) => r.tool_request && MAYA_TOOL_GOVERNANCE[r.tool_request.tool_name] !== undefined)
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      requested_at: r.requested_at,
      requested_by_identity: r.requested_by_identity,
      tool_name: r.tool_request!.tool_name,
      capability_id: r.tool_request!.capability_id,
      needed_by: r.tool_request!.needed_by,
    }));
}

router.get('/api/admin/maya/golive', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [agent, modes, record, killSwitch, pendingOutbound, grantRequests] = await Promise.all([
      AiAgent.findOne({ where: { agent_name: AGENT_NAME } }),
      resolveAllMayaModes(),
      readPromotionRecord(),
      killSwitchState(),
      MayaOutboundApproval.count({ where: { status: 'pending_approval' } }),
      mayaGrantRequests(),
    ]);

    const granted = new Set<string>(agent?.tools_granted ?? []);
    const registered = new Set<string>(registeredToolNames());
    const byCap = toolsByCapability();

    res.json({
      agent: agent
        ? {
          id: agent.id,
          agent_name: agent.agent_name,
          enabled: agent.enabled,
          status: agent.status,
          autonomy_level: agent.autonomy_level,
          tools_granted: agent.tools_granted ?? [],
        }
        // Null rather than a 404: the console's job is to say what is true, and "her row is
        // missing" is a thing it has to be able to say.
        : null,
      kill_switch: killSwitch,
      capabilities: modes.map((m) => ({
        capability: m.capability,
        mode: m.mode,
        reason: m.reason,
        refused: isRefusedCapability(m.capability),
        // A refused capability has no dial, so it has no default and no stored state either.
        default_state: isRefusedCapability(m.capability)
          ? null
          : DEFAULT_STATES[m.capability as PromotableCapability],
        stored_state: record.capabilities[m.capability]?.state ?? null,
        tools: byCap.get(m.capability) ?? [],
      })),
      tools: Object.entries(MAYA_TOOL_GOVERNANCE).map(([tool, entry]) => ({
        tool,
        belts: entry.belts,
        capability: entry.capability,
        effect_class: entry.effectClass,
        registered: registered.has(tool),
        granted: granted.has(tool),
      })),
      grant_requests: grantRequests,
      outbound: { pending: pendingOutbound },
    });
  } catch (err) {
    fail(res, 'maya_golive_read_failed', err);
  }
});

router.post('/api/admin/maya/enable', requireAdmin, async (req: Request, res: Response) => {
  const body = EnableBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({
      error: 'enabled must be true or false and a review note of 3 to 500 characters is required',
      error_class: 'ValidationError',
      issues: body.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  const by = String(req.admin?.email || req.admin?.sub || '').trim();
  if (!by) { res.status(401).json({ error: 'Authentication required' }); return; }

  const target = body.data.enabled;
  if (target && !isCoryAuthorizedIdentity(req.admin)) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'maya',
      event: 'maya_enable_denied', outcome: 'failure', error_class: 'AuthError',
      context: { by, to: target },
    }));
    res.status(403).json({
      error: 'Turning Maya on requires Ali or a super_admin. Turning her off does not.',
      error_class: 'AuthError',
    });
    return;
  }

  try {
    const agent = await AiAgent.findOne({ where: { agent_name: AGENT_NAME } });
    if (!agent) {
      res.status(404).json({ error: 'No Maya agent row', error_class: 'NotFound' });
      return;
    }
    if (agent.enabled === target) {
      // Idempotent: the same request twice is one state, and no second audit line pretending
      // something changed.
      res.json({ agent_id: agent.id, enabled: agent.enabled, changed: false });
      return;
    }
    // ONE COLUMN. See the docblock: enabling her must not widen what she may do.
    await AiAgent.update({ enabled: target }, { where: { id: agent.id } });
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'maya', event: 'maya_enable_set',
      outcome: 'success',
      context: { agent_id: agent.id, from: agent.enabled, to: target, by, note: body.data.review_note },
    }));
    res.json({ agent_id: agent.id, enabled: target, changed: true });
  } catch (err) {
    fail(res, 'maya_enable_failed', err);
  }
});

export default router;
