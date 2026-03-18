/**
 * Self-Healing Service
 *
 * Transforms "Detect → Report" into "Detect → Analyze → Recommend → Safely Improve".
 * Consumes signals from diagnosticsService, postExecutionAnalyticsService,
 * variableFlowService, and generates actionable healing plans with full
 * preview → approval → apply governance.
 *
 * Safety: Only prompt_rewrite and variable_fix are auto-appliable.
 * flow_adjustment and structure_improvement are ALWAYS blocked.
 */

import crypto from 'crypto';
import HealingPlan, { HealingAction, HealingPlanAttributes } from '../models/HealingPlan';
import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import ReportingInsight from '../models/ReportingInsight';
import { callLLMWithAudit } from './llmCallWrapper';
import { runFullDiagnostics } from './diagnosticsService';
import { getPromptStabilityReport, getVariableFailureRates } from './postExecutionAnalyticsService';
import { getVariableReconciliation, getVariableFlowMap } from './variableFlowService';

// ─── Debug Logging ──────────────────────────────────────────────────

const DEBUG = process.env.DEBUG_SELF_HEALING === 'true';
function debugLog(msg: string, data?: any) {
  if (DEBUG) console.log(`[SelfHealing] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_ACTIONS_PER_PLAN = 10;
const PROMPT_REWRITE_QUALITY_THRESHOLD = 40;
const PROMPT_REWRITE_MIN_EXECUTIONS = 3;
const VARIABLE_FIX_FAILURE_THRESHOLD = 20;
const ALWAYS_BLOCKED_TYPES: string[] = ['flow_adjustment', 'structure_improvement'];

const PROMPT_FIELDS = [
  'concept_prompt_user',
  'build_prompt_user',
  'mentor_prompt_user',
  'kc_prompt_user',
  'reflection_prompt_user',
] as const;

const PROMPT_REWRITE_SYSTEM_PROMPT = `You are a curriculum prompt engineer improving low-quality educational prompts for an enterprise AI leadership program targeting senior business executives (aged 35-60).

Given the original prompt, its runtime performance data, and the learning goal, rewrite the prompt to be clearer, more structured, and more likely to produce high-quality educational content.

Rules:
- Preserve all {{variable}} references from the original
- Maintain the same pedagogical intent
- Improve clarity, specificity, and structure
- Add output format guidance if missing
- Keep the same approximate length (±20%)

Return JSON only: { "improved_prompt": "...", "changes_explanation": "..." }`;

// ─── Generate Healing Plan ──────────────────────────────────────────

export async function generateHealingPlan(): Promise<HealingPlanAttributes> {
  debugLog('Generating healing plan...');

  // Parallel fetch all signals
  const [diagnostics, promptReport, varFailures, reconciliation, flowMap] = await Promise.all([
    runFullDiagnostics().catch(() => null),
    getPromptStabilityReport().catch(() => []),
    getVariableFailureRates().catch(() => []),
    getVariableReconciliation().catch(() => ({ undefined_refs: [], orphaned_defs: [] })),
    getVariableFlowMap().catch(() => []),
  ]);

  const actions: HealingAction[] = [];
  const seen = new Set<string>();

  // --- a) Prompt rewrites from unstable lessons ---
  const unstableLessons = promptReport.filter(
    p => p.is_unstable
      && p.avg_quality_score !== null
      && p.avg_quality_score < PROMPT_REWRITE_QUALITY_THRESHOLD
      && p.total_executions >= PROMPT_REWRITE_MIN_EXECUTIONS
  );

  for (const lesson of unstableLessons) {
    if (actions.length >= MAX_ACTIONS_PER_PLAN) break;

    try {
      const miniSections = await MiniSection.findAll({
        where: { lesson_id: lesson.lesson_id, is_active: true },
      });

      for (const ms of miniSections) {
        if (actions.length >= MAX_ACTIONS_PER_PLAN) break;

        for (const field of PROMPT_FIELDS) {
          const promptValue = (ms as any)[field];
          if (!promptValue) continue;

          const dedupeKey = `prompt_rewrite:${ms.id}:${field}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          actions.push({
            id: crypto.randomUUID(),
            action_type: 'prompt_rewrite',
            target_id: ms.id,
            target_label: `${ms.title} → ${field.replace(/_/g, ' ')}`,
            prompt_field: field,
            description: `Rewrite low-quality prompt for "${ms.title}" (${field}). Current avg quality: ${lesson.avg_quality_score}/100, failure rate: ${lesson.failure_rate}%.`,
            risk_level: 'low',
            blocked: false,
            status: 'pending',
            before_value: promptValue,
            after_value: null, // filled during preview
            evidence: {
              avg_quality_score: lesson.avg_quality_score,
              failure_rate: lesson.failure_rate,
              total_executions: lesson.total_executions,
              lesson_title: lesson.lesson_title,
              lesson_id: lesson.lesson_id,
            },
          });

          // One prompt per mini-section to keep plans focused
          break;
        }
      }
    } catch (err) {
      debugLog(`Failed to analyze lesson ${lesson.lesson_id}:`, (err as Error)?.message);
    }
  }

  // --- b) Variable fixes from runtime failures ---
  const undefinedKeys = new Set(reconciliation.undefined_refs.map(r => r.key));

  for (const v of varFailures) {
    if (actions.length >= MAX_ACTIONS_PER_PLAN) break;
    if (v.failure_rate <= VARIABLE_FIX_FAILURE_THRESHOLD) continue;
    if (!undefinedKeys.has(v.variable_key)) continue;

    const dedupeKey = `variable_fix:${v.variable_key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const undefinedRef = reconciliation.undefined_refs.find(r => r.key === v.variable_key);

    actions.push({
      id: crypto.randomUUID(),
      action_type: 'variable_fix',
      target_id: v.variable_key,
      target_label: `{{${v.variable_key}}}`,
      description: `Create missing variable definition for "{{${v.variable_key}}}" — missing in ${v.failure_rate}% of executions (${v.times_missing} times).`,
      risk_level: 'low',
      blocked: false,
      status: 'pending',
      before_value: null,
      after_value: {
        key: v.variable_key,
        display_name: v.variable_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        data_type: 'text',
        scope: 'program',
        source_type: 'llm_output',
      },
      evidence: {
        failure_rate: v.failure_rate,
        times_missing: v.times_missing,
        used_in_sections: undefinedRef?.used_in_sections || [],
      },
    });
  }

  // --- c) Flow/structure issues from diagnostics ---
  const timelineViolations = flowMap.filter(f => f.timeline_violation);

  for (const violation of timelineViolations) {
    if (actions.length >= MAX_ACTIONS_PER_PLAN) break;

    const dedupeKey = `flow_adjustment:${violation.variable_key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    actions.push({
      id: crypto.randomUUID(),
      action_type: 'flow_adjustment',
      target_id: violation.variable_key,
      target_label: `{{${violation.variable_key}}} timeline`,
      description: `Variable "{{${violation.variable_key}}}" is consumed before it is produced. Requires section reordering.`,
      risk_level: 'high',
      blocked: true,
      block_reason: 'Requires structural change — manual review required',
      status: 'pending',
      evidence: {
        variable_key: violation.variable_key,
        first_set_in: violation.first_set_in,
        consumed_in: violation.consumed_in.slice(0, 5),
        produced_in: violation.produced_in.slice(0, 5),
      },
    });
  }

  // Compute overall risk
  const nonBlockedActions = actions.filter(a => !a.blocked);
  const overallRisk = nonBlockedActions.some(a => a.risk_level === 'high')
    ? 'high' as const
    : nonBlockedActions.some(a => a.risk_level === 'medium')
      ? 'medium' as const
      : 'low' as const;

  // Persist plan
  const plan = await HealingPlan.create({
    status: 'draft',
    overall_risk_level: overallRisk,
    source_diagnostics: {
      system_health_score: diagnostics?.system_health_score ?? null,
      summary: diagnostics?.summary ?? null,
      unstable_lessons: unstableLessons.length,
      variable_failures: varFailures.length,
      timeline_violations: timelineViolations.length,
    },
    actions,
  });

  debugLog(`Plan generated: ${actions.length} actions, risk=${overallRisk}`);
  return plan.get({ plain: true }) as HealingPlanAttributes;
}

// ─── Preview Healing Plan ───────────────────────────────────────────

export async function previewHealingPlan(planId: string): Promise<HealingPlanAttributes> {
  const plan = await HealingPlan.findByPk(planId);
  if (!plan) throw new Error(`Healing plan not found: ${planId}`);
  if (plan.status !== 'draft') throw new Error(`Plan must be in 'draft' status to preview (current: ${plan.status})`);

  const actions: HealingAction[] = [...plan.actions];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action.action_type !== 'prompt_rewrite' || action.after_value !== null) continue;

    try {
      // Load mini-section for learning goal context
      const ms = await MiniSection.findByPk(action.target_id);
      const learningGoal = ms?.settings_json?.learning_goal || action.evidence.lesson_title || 'AI leadership skill development';

      const result = await callLLMWithAudit({
        lessonId: action.target_id,
        generationType: 'admin_simulation',
        step: 'self_healing_prompt_rewrite',
        systemPrompt: PROMPT_REWRITE_SYSTEM_PROMPT,
        userPrompt: `Original prompt:\n${action.before_value}\n\nLearning goal: ${learningGoal}\n\nPerformance: quality=${action.evidence.avg_quality_score}, failure_rate=${action.evidence.failure_rate}%, executions=${action.evidence.total_executions}`,
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 2000,
        responseFormat: { type: 'json_object' },
      });

      const parsed = JSON.parse(result.content);
      actions[i] = {
        ...action,
        after_value: parsed.improved_prompt || action.before_value,
        changes_explanation: parsed.changes_explanation || 'Prompt improved for clarity and structure.',
      };

      debugLog(`Preview: rewrote prompt for ${action.target_label}`);
    } catch (err) {
      debugLog(`Preview: failed to rewrite ${action.target_label}:`, (err as Error)?.message);
      // Keep action with null after_value — UI will show as "rewrite failed"
    }
  }

  await plan.update({ status: 'preview', actions });
  return plan.get({ plain: true }) as HealingPlanAttributes;
}

// ─── Apply Healing Plan ─────────────────────────────────────────────

export async function applyHealingPlan(
  planId: string,
  actionIds: string[],
): Promise<HealingPlanAttributes> {
  const plan = await HealingPlan.findByPk(planId);
  if (!plan) throw new Error(`Healing plan not found: ${planId}`);
  if (plan.status !== 'preview') throw new Error(`Plan must be in 'preview' status to apply (current: ${plan.status})`);

  const actions: HealingAction[] = [...plan.actions];
  const requestedIds = new Set(actionIds);
  let appliedCount = 0;
  let promptRewrites = 0;
  let varFixes = 0;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!requestedIds.has(action.id)) continue;

    // Safety: blocked actions cannot be applied
    if (action.blocked || ALWAYS_BLOCKED_TYPES.includes(action.action_type)) {
      actions[i] = { ...action, status: 'skipped' };
      debugLog(`Skipped blocked action: ${action.action_type} ${action.target_label}`);
      continue;
    }

    if (action.status !== 'pending') continue;

    try {
      switch (action.action_type) {
        case 'prompt_rewrite': {
          if (!action.after_value || !action.prompt_field) {
            actions[i] = { ...action, status: 'skipped' };
            break;
          }
          await MiniSection.update(
            { [action.prompt_field]: action.after_value },
            { where: { id: action.target_id } },
          );
          // Re-score the mini-section
          try {
            const { scoreMiniSection } = require('./qualityScoringService');
            await scoreMiniSection(action.target_id);
          } catch { /* non-critical */ }
          actions[i] = { ...action, status: 'applied' };
          appliedCount++;
          promptRewrites++;
          debugLog(`Applied prompt rewrite: ${action.target_label}`);
          break;
        }

        case 'variable_fix': {
          if (!action.after_value?.key) {
            actions[i] = { ...action, status: 'skipped' };
            break;
          }
          const { v4: uuidv4 } = require('uuid');
          await VariableDefinition.findOrCreate({
            where: { variable_key: action.after_value.key },
            defaults: {
              id: uuidv4(),
              variable_key: action.after_value.key,
              display_name: action.after_value.display_name,
              data_type: action.after_value.data_type || 'text',
              scope: action.after_value.scope || 'program',
              source_type: action.after_value.source_type || 'llm_output',
              is_active: true,
            },
          });
          actions[i] = { ...action, status: 'applied' };
          appliedCount++;
          varFixes++;
          debugLog(`Applied variable fix: ${action.target_label}`);
          break;
        }

        default:
          // flow_adjustment / structure_improvement — dead code (always blocked above)
          actions[i] = { ...action, status: 'skipped' };
      }
    } catch (err) {
      debugLog(`Failed to apply action ${action.id}:`, (err as Error)?.message);
      actions[i] = { ...action, status: 'skipped' };
    }
  }

  // Create governance insight
  let governanceInsightId: string | null = null;
  if (appliedCount > 0) {
    try {
      const insight = await ReportingInsight.create({
        insight_type: 'pattern',
        source_agent: 'self-healing-engine',
        entity_type: 'curriculum',
        title: `Self-healing plan applied: ${appliedCount} actions`,
        narrative: `Applied ${appliedCount} healing actions (${promptRewrites} prompt rewrites, ${varFixes} variable fixes). Plan ID: ${planId}.`,
        confidence: 0.9,
        impact: 0.7,
        urgency: 0.3,
        data_strength: 0.8,
        final_score: 0.7,
        evidence: {
          plan_id: planId,
          applied_actions: actionIds,
          prompt_rewrites: promptRewrites,
          variable_fixes: varFixes,
          total_applied: appliedCount,
        },
        status: 'new',
        alert_severity: 'info',
      });
      governanceInsightId = insight.id;
    } catch (err) {
      debugLog('Failed to create governance insight:', (err as Error)?.message);
    }
  }

  // Determine final status
  const allResolved = actions.every(a => a.status !== 'pending');
  const anyApplied = actions.some(a => a.status === 'applied');
  const finalStatus = allResolved && anyApplied
    ? 'applied' as const
    : anyApplied
      ? 'partial' as const
      : plan.status;

  await plan.update({
    status: finalStatus,
    actions,
    governance_insight_id: governanceInsightId,
    applied_action_ids: actionIds,
    applied_at: appliedCount > 0 ? new Date() : null,
    updated_at: new Date(),
  });

  debugLog(`Plan ${planId}: applied=${appliedCount}, status=${finalStatus}`);
  return plan.get({ plain: true }) as HealingPlanAttributes;
}

// ─── Reject Healing Plan ────────────────────────────────────────────

export async function rejectHealingPlan(
  planId: string,
  reason: string,
): Promise<HealingPlanAttributes> {
  const plan = await HealingPlan.findByPk(planId);
  if (!plan) throw new Error(`Healing plan not found: ${planId}`);
  if (plan.status !== 'draft' && plan.status !== 'preview') {
    throw new Error(`Plan must be in 'draft' or 'preview' status to reject (current: ${plan.status})`);
  }

  const actions = plan.actions.map(a => ({ ...a, status: 'rejected' as const }));

  await plan.update({
    status: 'rejected',
    actions,
    rejection_reason: reason,
    updated_at: new Date(),
  });

  debugLog(`Plan ${planId} rejected: ${reason}`);
  return plan.get({ plain: true }) as HealingPlanAttributes;
}

// ─── History ────────────────────────────────────────────────────────

export async function getHealingPlanHistory(): Promise<HealingPlanAttributes[]> {
  const plans = await HealingPlan.findAll({
    order: [['created_at', 'DESC']],
    limit: 20,
  });
  return plans.map(p => p.get({ plain: true }) as HealingPlanAttributes);
}
