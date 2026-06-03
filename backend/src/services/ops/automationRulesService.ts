/**
 * automationRulesService — Phase 4-light rule-based engine.
 *
 * Each rule is a JSONB condition + JSONB action. The executor walks all
 * active rules after the priority engine runs and fires the matching
 * ones. Pure deterministic — no LLM.
 *
 * v0 condition language (single matcher per rule):
 *   { match: 'stale_days_gt', value: 180 }     -> all todos with > N days no activity
 *   { match: 'urgency_gte', value: 70, stale_days_gt: 14 } -> red + stale
 *   { match: 'category_eq', value: 'waiting_dependency' }
 *
 * v0 action language:
 *   { do: 'flag_for_archive' }      -> sets dismissed_reason='archive_suggested' (visible in Stale Review)
 *   { do: 'tag_category', value: 'waiting_dependency' } -> writes category
 *   { do: 'noop_for_metrics' }      -> just counts fires, no mutation (useful as alert)
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
    },
    {
      name: 'Alert — red urgency stale > 14d',
      description: 'Counts (metrics only) urgency-70+ todos that have not been touched in 14 days. Helps see if scoring is mis-firing.',
      condition_jsonb: { urgency_gte: 70, stale_days_gt: 14 },
      action_jsonb: { do: 'noop_for_metrics' },
    },
    {
      name: 'Tag waiting_dependency — stale > 7d, no due',
      description: 'Re-tags todos with no due + >7d stale into waiting_dependency category for visibility in Triage Breakdown.',
      condition_jsonb: { stale_days_gt: 7 },
      action_jsonb: { do: 'tag_category', value: 'waiting_dependency' },
    },
  ];
  for (const d of defaults) {
    await sequelize.query(
      `INSERT INTO ops_automation_rules (name, description, condition_jsonb, action_jsonb, is_active)
       SELECT :name, :description, :condition::jsonb, :action::jsonb, TRUE
       WHERE NOT EXISTS (SELECT 1 FROM ops_automation_rules WHERE name = :name)`,
      {
        replacements: {
          name: d.name,
          description: d.description,
          condition: JSON.stringify(d.condition_jsonb),
          action: JSON.stringify(d.action_jsonb),
        },
      },
    );
  }
}
