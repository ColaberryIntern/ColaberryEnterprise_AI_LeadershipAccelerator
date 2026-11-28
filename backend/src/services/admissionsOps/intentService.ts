/**
 * Applies the intent policy and records it (AO2.3). One transaction writes the audit row and, when the policy says so,
 * the Approvals item, so a failure leaves neither. Idempotent by request_id: replaying a request returns the first
 * result and writes nothing (unique indexes on both tables; the second insert is ignored and the stored row is read).
 * Database failures are not caught here: the route logs them with their error class and answers 500.
 */
import { sequelize } from '../../config/database';
import AdmissionsOpsAgentLog from '../../models/AdmissionsOpsAgentLog';
import AdmissionsOpsApproval from '../../models/AdmissionsOpsApproval';
import { ACTIONS } from './agentManifest';
import { decideAllowed, decideIntent, redactParams, type ActorKind, type IntentType, type Mode } from './intentPolicy';

export interface Caller { onBehalfOf: string; mgmtRole?: string; actor: ActorKind; agentId: string | null; agentVersion: string | null }
export interface IntentRequest { request_id: string; type: IntentType; screen: string; action?: string; params: Record<string, string> }
export interface IntentResult { request_id: string; outcome: string; reason: string | null; approval_id: string | null; replayed: boolean }

/** The mode the workspace runs in. Answer only until Guide mode ships (AO9.1, M0 Q10). */
export const CURRENT_MODE: Mode = 'answer';

async function existing(requestId: string): Promise<IntentResult | null> {
  const row = await AdmissionsOpsAgentLog.findOne({ where: { request_id: requestId } });
  return row ? { request_id: requestId, outcome: row.outcome, reason: row.reason, approval_id: row.approval_id, replayed: true } : null;
}

export async function handleIntent(req: IntentRequest, caller: Caller): Promise<IntentResult> {
  const prior = await existing(req.request_id);
  if (prior) return prior;
  const action = req.action ? ACTIONS.get(req.action) ?? null : null;
  const decision = decideIntent({ type: req.type, actor: caller.actor, mode: CURRENT_MODE, action });
  return sequelize.transaction(async (t) => {
    let approvalId: string | null = null;
    if (decision.createApproval && action) {
      const [approval] = await AdmissionsOpsApproval.findOrCreate({
        where: { request_id: req.request_id },
        defaults: {
          request_id: req.request_id, action: action.id, level: action.level, screen: req.screen, summary: action.label,
          params: req.params, prepared_by_kind: caller.actor, prepared_by: caller.actor === 'agent' ? (caller.agentId ?? 'agent') : caller.onBehalfOf,
          on_behalf_of: caller.onBehalfOf,
        },
        transaction: t,
      });
      approvalId = approval.id;
    }
    await AdmissionsOpsAgentLog.bulkCreate([{
      request_id: req.request_id, actor_kind: caller.actor, agent_id: caller.agentId, agent_version: caller.agentVersion,
      on_behalf_of: caller.onBehalfOf, mode: CURRENT_MODE, intent_type: req.type, screen: req.screen, action: action?.id ?? req.action ?? null,
      level: action?.level ?? null, params: redactParams(req.params), sources_read: [], outcome: decision.outcome, reason: decision.reason,
      approval_id: approvalId,
    }], { ignoreDuplicates: true, transaction: t });
    return { request_id: req.request_id, outcome: decision.outcome, reason: decision.reason, approval_id: approvalId, replayed: false };
  });
}

export type DecideResult =
  | { status: 'decided'; approval_id: string; decision: 'approved' | 'held'; decided_by: string; already: boolean }
  | { status: 'refused'; reason: string }
  | { status: 'not_found' };

/** A person approves or holds an item. The first decision stands; deciding again is a no-op that returns it. */
export async function decideApproval(id: string, decision: 'approve' | 'hold', caller: Caller, requestId: string): Promise<DecideResult> {
  const item = await AdmissionsOpsApproval.findByPk(id);
  if (!item) return { status: 'not_found' };
  // Decision rows are namespaced, so a caller-supplied id can never collide with (and silently drop into) another row;
  // the same decision replayed with the same id is still recorded once.
  const logDecision = (outcome: 'done' | 'refused', reason: string | null) => AdmissionsOpsAgentLog.bulkCreate([{
    request_id: `decide:${requestId}`.slice(0, 64), actor_kind: caller.actor, agent_id: caller.agentId, agent_version: caller.agentVersion,
    on_behalf_of: caller.onBehalfOf, mode: CURRENT_MODE, intent_type: 'decide', screen: 'approvals', action: item.action, level: item.level,
    params: { decision }, sources_read: [], outcome, reason, approval_id: item.id,
  }], { ignoreDuplicates: true });
  const allowed = decideAllowed(caller.actor, caller.mgmtRole, item.level);
  if (!allowed.ok) {
    await logDecision('refused', allowed.reason);
    return { status: 'refused', reason: allowed.reason };
  }
  if (item.status !== 'open') {
    return { status: 'decided', approval_id: item.id, decision: item.status as 'approved' | 'held', decided_by: item.decided_by ?? '', already: true };
  }
  const next = decision === 'approve' ? 'approved' : 'held';
  // Guarded update: only an open item changes, so two people deciding at once cannot both win.
  const [changed] = await AdmissionsOpsApproval.update(
    { status: next, decided_by: caller.onBehalfOf, decided_at: new Date() },
    { where: { id, status: 'open' } },
  );
  if (changed === 0) {
    const now = await AdmissionsOpsApproval.findByPk(id);
    return { status: 'decided', approval_id: id, decision: now!.status as 'approved' | 'held', decided_by: now!.decided_by ?? '', already: true };
  }
  // A person's decision is in the audit trail too, not only in decided_by.
  await logDecision('done', next);
  return { status: 'decided', approval_id: id, decision: next, decided_by: caller.onBehalfOf, already: false };
}

export async function countOpenApprovals(): Promise<number> {
  return AdmissionsOpsApproval.count({ where: { status: 'open' } });
}
