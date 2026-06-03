/**
 * approvalService — backend for the inline Approval Workspace on
 * /admin/ops.
 *
 * Each decision is:
 *   1. Persisted as a new row in ops_approval_queue (audit trail).
 *   2. Optionally posted back to the BC ticket as a structured comment
 *      so the rest of the team / the agent loop can see Ali's call.
 *   3. Returned to the UI so it can mark the queue item decided.
 *
 * No pre-creation of approval rows — they only exist after a human
 * decides. Multiple decisions on the same todo are allowed (iteration
 * trail).
 */
import OpsApprovalQueueItem, { ApprovalDecision } from '../../models/OpsApprovalQueueItem';
import OpsBcTodo from '../../models/OpsBcTodo';
import OpsSkill from '../../models/OpsSkill';
import { bcGet, bcPost } from './basecampClient';
import { buildSuggestion } from './runMyDayPromptService';
import { checkCompliance } from './brandComplianceService';

interface DecisionInput {
  todo_bc_id: string;
  decision: Exclude<ApprovalDecision, null>;
  reasoning?: string | null;
  decided_by: string; // admin email
  post_to_bc?: boolean;
}

interface DecisionResult {
  queue_item: OpsApprovalQueueItem;
  bc_comment_url: string | null;
  bc_post_error: string | null;
  compliance_warnings: string[];
}

const DECISION_LABEL: Record<Exclude<ApprovalDecision, null>, { title: string; color: string; bgcolor: string; emoji: string }> = {
  approve:                     { title: 'Approved',                 color: '#14532d', bgcolor: '#dcfce7', emoji: 'OK' },
  approve_and_continue:        { title: 'Approved + continue',      color: '#14532d', bgcolor: '#dcfce7', emoji: 'OK' },
  approve_and_convert_to_skill:{ title: 'Approved + skill capture', color: '#14532d', bgcolor: '#dcfce7', emoji: 'OK' },
  revise:                      { title: 'Revise',                   color: '#78350f', bgcolor: '#fef3c7', emoji: 'REVISE' },
  reject:                      { title: 'Rejected',                 color: '#7f1d1d', bgcolor: '#fee2e2', emoji: 'STOP' },
  escalate:                    { title: 'Escalated',                color: '#1e3a8a', bgcolor: '#dbeafe', emoji: 'ESCALATE' },
};

function buildBcCommentHtml(
  decision: Exclude<ApprovalDecision, null>,
  reasoning: string | null,
  decidedBy: string,
  todoTitle: string,
): string {
  const meta = DECISION_LABEL[decision];
  const reasoningBlock = reasoning && reasoning.trim().length > 0
    ? `<div style="margin-top:10px;padding:10px 14px;background:#f8fafc;border-left:4px solid ${meta.color};border-radius:0 6px 6px 0;font-size:13px">${escapeHtml(reasoning)}</div>`
    : '';
  return `<div style="background:${meta.bgcolor};border-left:5px solid ${meta.color};padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${meta.color};font-weight:700">${meta.emoji} - ${meta.title}</div>
<div style="font-size:13px;color:${meta.color};margin-top:4px">Decision recorded ${new Date().toISOString()} by <strong>${escapeHtml(decidedBy)}</strong> via the AI Ops Command Center.</div>
</div>
<div style="margin-top:10px;font-size:13px;color:#475569">On todo: <strong>${escapeHtml(todoTitle)}</strong></div>${reasoningBlock}`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function recordDecision(input: DecisionInput): Promise<DecisionResult> {
  const todo = await OpsBcTodo.findByPk(input.todo_bc_id);
  if (!todo) throw new Error(`todo ${input.todo_bc_id} not found in mirror`);

  // 1) audit row
  const queue_item = await OpsApprovalQueueItem.create({
    todo_bc_id: input.todo_bc_id,
    artifact_id: null,
    summary: todo.title,
    recommended_decision: input.decision,
    confidence: null,
    estimated_review_seconds: null,
    blocked_downstream_count: todo.downstream_blocked_count || 0,
    urgency_snapshot: todo.urgency_score,
    ai_opportunity_snapshot: null,
    target_user_id: input.decided_by,
    enqueued_at: new Date(),
    decided_at: new Date(),
    decision: input.decision,
    decided_by: input.decided_by,
    decision_reasoning: input.reasoning || null,
    next_actions: null,
  } as any);

  // 2) BC write-back (opt-in via post_to_bc; defaults true).
  // Brand compliance preflight: blockers (secret leaks etc.) prevent post;
  // warnings (style flags) surface in the response but don't block.
  let bc_comment_url: string | null = null;
  let bc_post_error: string | null = null;
  let compliance_warnings: string[] = [];
  if (input.post_to_bc !== false) {
    const html = buildBcCommentHtml(input.decision, input.reasoning || null, input.decided_by, todo.title);
    const check = checkCompliance(html, input.reasoning || null);
    compliance_warnings = check.warnings;
    if (!check.ok) {
      bc_post_error = `Brand compliance blocked: ${check.blockers.join('; ')}`;
    } else {
      try {
        const comment = await bcPost<{ app_url: string }>(
          `/buckets/${todo.project_id}/recordings/${todo.bc_id}/comments.json`,
          { content: html },
        );
        bc_comment_url = comment.app_url || null;
      } catch (err: any) {
        bc_post_error = err.message || String(err);
      }
    }
  }

  // Phase 2-light: capture as skill when explicitly requested. The action_kind
  // comes from buildSuggestion() so this skill is filed under the right
  // taxonomy (reply / decision / meeting / research / default).
  if (input.decision === 'approve_and_convert_to_skill') {
    try {
      const suggestion = buildSuggestion({
        bc_id: todo.bc_id,
        title: todo.title,
        description: todo.description,
        bc_app_url: todo.bc_app_url,
        project_id: todo.project_id,
        project_name: null,
        todolist_name: todo.todolist_name,
        due_on: todo.due_on,
        bc_updated_at: todo.bc_updated_at,
        urgency_score: todo.urgency_score,
        category: todo.category,
      });
      const skillName = (input.reasoning && input.reasoning.split('\n')[0].slice(0, 120))
        || `${suggestion.action_kind.charAt(0).toUpperCase() + suggestion.action_kind.slice(1)} pattern from ${todo.title.slice(0, 60)}`;
      await OpsSkill.create({
        name: skillName,
        action_kind: suggestion.action_kind,
        captured_from_todo_bc_id: todo.bc_id,
        captured_from_todo_title: todo.title,
        reasoning: input.reasoning || null,
        decision: input.decision,
        is_active: true,
        use_count: 0,
        created_by: input.decided_by,
      } as any);
    } catch (err: any) {
      // skill capture failure is non-fatal — the decision + BC comment
      // already landed
      console.warn('[approvalService] skill capture failed:', err.message);
    }
  }

  return { queue_item, bc_comment_url, bc_post_error, compliance_warnings };
}

export async function fetchTodoComments(todoBcId: string): Promise<{
  comments: Array<{ id: number; content: string; creator: string; created_at: string; app_url: string }>;
}> {
  const todo = await OpsBcTodo.findByPk(todoBcId);
  if (!todo) throw new Error(`todo ${todoBcId} not found in mirror`);
  const raw = await bcGet<Array<any>>(`/buckets/${todo.project_id}/recordings/${todo.bc_id}/comments.json`);
  const comments = (raw || []).slice(-15).map((c) => ({
    id: c.id,
    content: c.content || '',
    creator: c.creator?.name || 'Unknown',
    created_at: c.created_at,
    app_url: c.app_url || '',
  }));
  return { comments };
}

export async function fetchDecisionsForTodo(todoBcId: string): Promise<OpsApprovalQueueItem[]> {
  return OpsApprovalQueueItem.findAll({
    where: { todo_bc_id: todoBcId },
    order: [['decided_at', 'DESC']],
    limit: 20,
  });
}

export async function getTodayDecisionStats(decided_by?: string): Promise<{
  total_today: number;
  by_decision: Record<string, number>;
  decided_by_filter: string | null;
}> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const where: any = { decided_at: { $not: null } };
  const rows = await OpsApprovalQueueItem.findAll({
    where: {
      decided_at: { [require('sequelize').Op.gte]: todayStart },
      ...(decided_by ? { decided_by } : {}),
    } as any,
    attributes: ['decision'],
  });
  const by_decision: Record<string, number> = {};
  for (const r of rows) {
    const d = (r.decision as string) || 'unknown';
    by_decision[d] = (by_decision[d] || 0) + 1;
  }
  return {
    total_today: rows.length,
    by_decision,
    decided_by_filter: decided_by || null,
  };
}
