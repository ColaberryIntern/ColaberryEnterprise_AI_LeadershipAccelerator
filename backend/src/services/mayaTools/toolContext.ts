import { Lead, Visitor } from '../../models';
import AdmissionsActionLog from '../../models/AdmissionsActionLog';

/**
 * The context every site-chat tool needs: who the visitor is, and how an action is recorded.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 *
 * `mayaToolsService.ts` was 1,047 lines against CLAUDE.md's 500-line hard ceiling. The rule for
 * an oversize file is that it is grandfathered only "until touched", and the next change "MUST
 * split it before adding new code". MR1 touched it, so this is that split: the shared helpers
 * and the two outbound tools (`sendSmsSummary`, `initiateVoiceCall`) moved out, and
 * `mayaToolsService` re-exports them so no caller or test mock changed.
 *
 * This module is a LEAF by design - it imports models and nothing else from the service layer -
 * so `mayaToolsService -> voiceTool -> toolContext` stays acyclic. A circular import here would
 * be the missing-third-module smell CLAUDE.md names explicitly.
 *
 * The split is partial and honestly so: the file is now ~620 lines, not under 500. Getting it
 * there means moving the remaining six tools, which is a far larger change than MR1 asked for
 * and would put the whole site chat at regression risk in one commit. The two tools this
 * change actually modifies now live in a compliant module, and the next tool to be touched is
 * the next one to move.
 */

/** Resolve the Lead linked to a visitor, or null. */
export async function resolveLeadForVisitor(
  visitorId: string,
): Promise<InstanceType<typeof Lead> | null> {
  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor?.lead_id) return null;
  return Lead.findByPk(visitor.lead_id);
}

export async function logAction(
  visitorId: string,
  conversationId: string,
  actionType: string,
  status: string,
  details: Record<string, any>,
): Promise<void> {
  try {
    await AdmissionsActionLog.create({
      visitor_id: visitorId,
      conversation_id: conversationId,
      action_type: actionType,
      action_details: details,
      status,
      agent_name: 'Maya',
    });
  } catch {
    // Non-critical
  }
}

/**
 * One structured line per outbound-tool outcome, to CLAUDE.md's log contract.
 *
 * WHY THIS EXISTS. Before MR1 the tools file emitted only prefixed plain strings
 * (`console.warn('[MayaTools] ...')`), so the one failure that mattered most - Maya reporting a
 * call or a text that never happened - had no `event` name anybody could alert on, and the
 * `outcome` she recorded was success. A string is not observability.
 *
 * `context` carries the visitor and the reason, never the phone number and never the message
 * body: a log line is the easiest place for a contact detail to leave the trust boundary.
 *
 * KNOWN GAP, stated rather than hidden: the Observability Framework also asks for
 * `correlation_id` and `duration_ms`. No correlation id is plumbed into the site-chat tool
 * entry point at all (`chatService` has none), so emitting the field would mean emitting null.
 * Threading one through that entry point is its own change.
 */
export function logOutboundOutcome(params: {
  event: string;
  outcome: 'success' | 'failure';
  errorClass?: string;
  context: Record<string, unknown>;
}): void {
  const line = {
    timestamp: new Date().toISOString(),
    level: params.outcome === 'failure' ? 'warn' : 'info',
    service: 'maya-site-chat',
    event: params.event,
    outcome: params.outcome,
    ...(params.errorClass ? { error_class: params.errorClass } : {}),
    context: params.context,
  };
  (params.outcome === 'failure' ? console.warn : console.log)(JSON.stringify(line));
}
