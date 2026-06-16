/**
 * automationRulesService — Phase 4-light rule-based engine.
 *
 * Each rule is a JSONB condition + JSONB action. The executor walks all
 * active rules after the priority engine runs and fires the matching
 * ones. Pure deterministic — no LLM.
 *
 * v0 condition language (matchers AND-combine within a single rule):
 *   { stale_days_gt: 180 }                      -> all todos with > N days no activity
 *   { urgency_gte: 70, stale_days_gt: 14 }      -> red + stale
 *   { match: 'category_eq', value: 'waiting_dependency' }
 *   { overdue: true }                           -> past due date (due_on < today)
 *   { overdue_days_gt: 7 }                      -> more than N days past due date
 *
 * v0 action language:
 *   { do: 'flag_for_archive' }      -> sets dismissed_reason='archive_suggested' (visible in Stale Review)
 *   { do: 'tag_category', value: 'waiting_dependency' } -> writes category
 *   { do: 'noop_for_metrics' }      -> just counts fires, no mutation (useful as alert)
 *   { do: 'escalate' }              -> opens an approval-queue item (decided_at IS NULL) per
 *                                      matching todo so it surfaces in the Command Center
 *                                      "Waiting on Human" panel. Local-only; never mutates the
 *                                      upstream BC ticket. Idempotent: a todo that already has an
 *                                      open auto-escalation is skipped, so the 2-min cron cannot
 *                                      create duplicates.
 */
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';

export interface AutomationFireResult {
  rule_id: string;
  rule_name: string;
  rows_affected: number;
  error?: string;
}

interface RuleRow {
  id: string;
  name: string;
  condition_jsonb: any;
  action_jsonb: any;
}

function buildCondition(condition: any): { where: string; replacements: Record<string, unknown> } | null {
  const r: Record<string, unknown> = {};
  const parts: string[] = [`status = 'active'`];
  if (condition?.stale_days_gt) {
    parts.push(`bc_updated_at < NOW() - (:cond_stale || ' days')::interval`);
    r.cond_stale = String(condition.stale_days_gt);
  }
  if (condition?.urgency_gte != null) {
    parts.push(`urgency_score >= :cond_urgency`);
    r.cond_urgency = Number(condition.urgency_gte);
  }
  if (condition?.overdue === true) {
    // due_on is DATEONLY; compare against the server's current date.
    parts.push(`due_on IS NOT NULL AND due_on < CURRENT_DATE`);
  }
  if (condition?.overdue_days_gt != null) {
    parts.push(`due_on IS NOT NULL AND due_on < (CURRENT_DATE - (:cond_overdue || ' days')::interval)`);
    r.cond_overdue = String(condition.overdue_days_gt);
  }
  if (condition?.match === 'category_eq' && condition?.value) {
    parts.push(`category = :cond_cat`);
    r.cond_cat = String(condition.value);
  }
  if (parts.length === 0) return null;
  return { where: parts.join(' AND '), replacements: r };
}

async function applyAction(
  ruleId: string,
  ruleName: string,
  condWhere: string,
  condReplacements: Record<string, unknown>,
  action: any,
): Promise<AutomationFireResult> {
  try {
    if (!action?.do || action.do === 'noop_for_metrics') {
      const rows = await sequelize.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ops_bc_todos WHERE ${condWhere}`,
        { type: QueryTypes.SELECT, replacements: condReplacements },
      );
      const first = rows[0];
      return { rule_id: ruleId, rule_name: ruleName, rows_affected: parseInt(first?.count || '0', 10) };
    }
    if (action.do === 'flag_for_archive') {
      const [, meta]: any = await sequelize.query(
        `UPDATE ops_bc_todos
            SET dismissed_reason = COALESCE(dismissed_reason, 'archive_suggested'),
                updated_at = NOW()
          WHERE ${condWhere}
            AND is_dismissed = FALSE
            AND (dismissed_reason IS NULL OR dismissed_reason = 'archive_suggested')`,
        { replacements: condReplacements },
      );
      return { rule_id: ruleId, rule_name: ruleName, rows_affected: meta?.rowCount || 0 };
    }
    if (action.do === 'tag_category' && action.value) {
      const [, meta]: any = await sequelize.query(
        `UPDATE ops_bc_todos
            SET category = :tagval, updated_at = NOW()
          WHERE ${condWhere}`,
        { replacements: { ...condReplacements, tagval: String(action.value) } },
      );
      return { rule_id: ruleId, rule_name: ruleName, rows_affected: meta?.rowCount || 0 };
    }
    if (action.do === 'escalate') {
      // Opens one approval-queue item (decided_at IS NULL) per matching todo
      // so it lands in the Command Center "Waiting on Human" panel for the
      // operator to action. Pure local write — never touches the upstream BC
      // ticket. Idempotent via NOT EXISTS: a todo that already has an OPEN
      // auto-escalation is skipped, so the 2-min cron never duplicates.
      //
      // SCOPE (must match the dashboard's queue views in opsRoutes.ts, or this
      // escalates the entire org's overdue backlog into one operator's queue):
      // only the operator's own todos (assignee_ids @> [id]), only in
      // CB-managed projects, and only inside the freshness window. Without
      // these three filters a broad condition like overdue_days_gt:7 matches
      // tens of thousands of rows across every mirrored project.
      const escAli = process.env.ALI_BC_USER_ID || '17454835';
      const escStaleDays = Math.max(1, Number(process.env.OPS_STALE_HIDE_DAYS) || 90);
      // RETURNING + result-length is the reliable affected-row count for this
      // INSERT ... SELECT; the raw-query metadata.rowCount came back unset for
      // the set-based insert, which silently zeroed fire_count.
      const result: any = await sequelize.query(
        `INSERT INTO ops_approval_queue
            (todo_bc_id, summary, recommended_decision, urgency_snapshot,
             blocked_downstream_count, target_user_id, enqueued_at,
             decision, decided_at, decision_reasoning, next_actions,
             created_at, updated_at)
         SELECT t.bc_id,
                'Auto-escalated: ' || t.title
                  || COALESCE(' (due ' || to_char(t.due_on, 'YYYY-MM-DD') || ')', ''),
                'escalate',
                t.urgency_score,
                COALESCE(t.downstream_blocked_count, 0),
                :esc_target,
                NOW(),
                NULL,
                NULL,
                :esc_reason,
                jsonb_build_object('source', 'automation_rule', 'rule', :esc_rule),
                NOW(), NOW()
           FROM ops_bc_todos t
          WHERE ${condWhere}
            AND is_dismissed = FALSE
            AND assignee_ids @> :esc_assignee::jsonb
            AND bc_updated_at >= NOW() - (:esc_stale || ' days')::interval
            AND EXISTS (
              SELECT 1 FROM ops_bc_projects p
               WHERE p.bc_id = t.project_id AND p.is_cb_managed = TRUE
            )
            AND NOT EXISTS (
              SELECT 1 FROM ops_approval_queue q
               WHERE q.todo_bc_id = t.bc_id
                 AND q.recommended_decision = 'escalate'
                 AND q.decided_at IS NULL
            )
         RETURNING todo_bc_id`,
        {
          replacements: {
            ...condReplacements,
            // Route escalations to Ali. Mirrors the hardcode + env override
            // documented in routes/admin/opsRoutes.ts (ALI_BC_USER_ID); lift
            // to a shared config when a second operator uses the queue.
            esc_target: escAli,
            esc_assignee: JSON.stringify([escAli]),
            esc_stale: String(escStaleDays),
            esc_reason: `Auto-escalated by rule "${ruleName}".`,
            esc_rule: ruleName,
          },
        },
      );
      const inserted = Array.isArray(result?.[0]) ? result[0].length : 0;
      return { rule_id: ruleId, rule_name: ruleName, rows_affected: inserted };
    }
    return { rule_id: ruleId, rule_name: ruleName, rows_affected: 0 };
  } catch (err: any) {
    return { rule_id: ruleId, rule_name: ruleName, rows_affected: 0, error: err.message };
  }
}

export interface AutomationRunResult {
  started_at: Date;
  finished_at: Date;
  rules_evaluated: number;
  rules_fired: number;
  fire_results: AutomationFireResult[];
}

export async function runAutomationRules(): Promise<AutomationRunResult> {
  const result: AutomationRunResult = {
    started_at: new Date(),
    finished_at: new Date(),
    rules_evaluated: 0,
    rules_fired: 0,
    fire_results: [],
  };
  const rules = await sequelize.query<RuleRow>(
    `SELECT id::text, name, condition_jsonb, action_jsonb
       FROM ops_automation_rules
      WHERE is_active = TRUE
      ORDER BY name`,
    { type: QueryTypes.SELECT },
  );
  for (const rule of rules) {
    result.rules_evaluated++;
    const built = buildCondition(rule.condition_jsonb);
    if (!built) continue;
    const fire = await applyAction(
      rule.id,
      rule.name,
      built.where,
      built.replacements,
      rule.action_jsonb,
    );
    result.fire_results.push(fire);
    if (fire.rows_affected > 0) {
      result.rules_fired++;
      await sequelize.query(
        `UPDATE ops_automation_rules
            SET last_fired_at = NOW(),
                fire_count = fire_count + 1,
                updated_at = NOW()
          WHERE id = :id`,
        { replacements: { id: rule.id } },
      );
    }
  }
  result.finished_at = new Date();
  return result;
}

/**
 * Seeds the v0 baseline rules if they don't yet exist. Idempotent.
 */
export async function seedDefaultAutomationRules(): Promise<void> {
  const defaults = [
    {
      name: 'Flag for archive — no BC activity > 180d',
      description: 'Marks the todo with archive_suggested so it surfaces in the Stale Review panel for batch dismissal.',
      condition_jsonb: { stale_days_gt: 180 },
      action_jsonb: { do: 'flag_for_archive' },
      is_active: true,
    },
    {
      name: 'Alert — red urgency stale > 14d',
      description: 'Counts (metrics only) urgency-70+ todos that have not been touched in 14 days. Helps see if scoring is mis-firing.',
      condition_jsonb: { urgency_gte: 70, stale_days_gt: 14 },
      action_jsonb: { do: 'noop_for_metrics' },
      is_active: true,
    },
    {
      name: 'Tag waiting_dependency — stale > 7d, no due',
      description: 'Re-tags todos with no due + >7d stale into waiting_dependency category for visibility in Triage Breakdown.',
      condition_jsonb: { stale_days_gt: 7 },
      action_jsonb: { do: 'tag_category', value: 'waiting_dependency' },
      is_active: true,
    },
    // Escalation rules seed INACTIVE: the escalate action enqueues an
    // approval-queue item per match, and even scoped to Ali's CB-managed
    // fresh todos the current overdue backlog is ~190 items. The operator
    // opts in by toggling these on in the dashboard once the backlog is at a
    // level worth surfacing as live escalations.
    {
      name: 'Escalate — overdue + red urgency (≥70)',
      description: 'Opens an approval-queue item for the operator\'s own CB-managed, recently-active todos that are past due and scoring 70+. Surfaces in the Waiting on Human panel. Idempotent; local-only (does not touch the BC ticket). Off by default — toggle on to enable.',
      condition_jsonb: { overdue: true, urgency_gte: 70 },
      action_jsonb: { do: 'escalate' },
      is_active: false,
    },
    {
      name: 'Escalate — overdue > 7 days',
      description: 'Opens an approval-queue item for the operator\'s own CB-managed, recently-active todos more than 7 days past due, regardless of urgency. Catches stalled commitments the urgency rule misses. Idempotent; local-only. Off by default — toggle on to enable.',
      condition_jsonb: { overdue_days_gt: 7 },
      action_jsonb: { do: 'escalate' },
      is_active: false,
    },
  ];
  for (const d of defaults) {
    await sequelize.query(
      `INSERT INTO ops_automation_rules (name, description, condition_jsonb, action_jsonb, is_active)
       SELECT :name, :description, :condition::jsonb, :action::jsonb, :is_active
       WHERE NOT EXISTS (SELECT 1 FROM ops_automation_rules WHERE name = :name)`,
      {
        replacements: {
          name: d.name,
          description: d.description,
          condition: JSON.stringify(d.condition_jsonb),
          action: JSON.stringify(d.action_jsonb),
          is_active: d.is_active,
        },
      },
    );
  }
}
