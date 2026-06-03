/**
 * priorityEngineService — Phase 1 v0 rule-based scorer.
 *
 * No LLM. Pure deterministic scoring over the BC mirror so the Waiting on
 * Human queue has a meaningful sort.
 *
 * Inputs (all derivable from ops_bc_todos):
 *   - due_on proximity
 *   - bc_updated_at staleness
 *   - urgency keywords in title + description
 *   - assignee presence (orphaned vs owned)
 *   - per-project base signal (Phase 1: flat constant; Phase 2: configurable)
 *
 * Output:
 *   - writes urgency_score (0-100) + category onto each ops_bc_todos row
 *   - appends one ops_ai_assessments row per scoring pass (audit trail)
 *
 * Run cadence: chained after the BC sync cron (every 2 min) so freshly-
 * synced todos get scored immediately.
 */
import { Op } from 'sequelize';
import OpsBcTodo, { OpsTodoCategory } from '../../models/OpsBcTodo';
import OpsAiAssessment from '../../models/OpsAiAssessment';

export const AGENT_NAME = 'priority_v1' as const;
export const AGENT_VERSION = '1.0.0';

interface ScoreBreakdown {
  due_date: number;
  staleness: number;
  keywords: number;
  assignee: number;
  project: number;
}

interface Scored {
  urgency_score: number;
  category: OpsTodoCategory;
  breakdown: ScoreBreakdown;
  signals: {
    days_until_due: number | null;
    days_stale: number;
    matched_keywords: string[];
    has_assignees: boolean;
  };
}

const URGENT_PATTERNS: Array<{ pat: RegExp; points: number; label: string }> = [
  { pat: /\b(URGENT|ASAP|CRITICAL|BLOCKER|RED|EMERGENCY)\b/i, points: 15, label: 'urgent_high' },
  { pat: /\b(HOT|IMPORTANT|PRIORITY|P0|P1)\b/i, points: 8, label: 'urgent_med' },
  { pat: /\b(REVIEW|APPROVE|DECISION|DECIDE|SIGN[\s-]?OFF)\b/i, points: 5, label: 'urgent_decision' },
];

function scoreDueDate(due: Date | null | string): { points: number; daysUntil: number | null } {
  if (!due) return { points: 0, daysUntil: null };
  const dueDate = due instanceof Date ? due : new Date(due);
  const now = new Date();
  const msPerDay = 86400000;
  const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / msPerDay);
  let points: number;
  if (daysUntil < 0) points = 40;
  else if (daysUntil === 0) points = 35;
  else if (daysUntil <= 1) points = 28;
  else if (daysUntil <= 3) points = 20;
  else if (daysUntil <= 7) points = 12;
  else if (daysUntil <= 14) points = 6;
  else points = 0;
  return { points, daysUntil };
}

function scoreStaleness(bcUpdatedAt: Date): { points: number; daysStale: number } {
  const msPerDay = 86400000;
  const daysStale = Math.floor((Date.now() - new Date(bcUpdatedAt).getTime()) / msPerDay);
  let points: number;
  if (daysStale > 14) points = 20;
  else if (daysStale >= 7) points = 12;
  else if (daysStale >= 3) points = 6;
  else points = 0;
  return { points, daysStale };
}

function scoreKeywords(title: string, description: string | null): { points: number; matched: string[] } {
  const text = `${title} ${description || ''}`;
  let bestPoints = 0;
  const matched: string[] = [];
  for (const { pat, points, label } of URGENT_PATTERNS) {
    if (pat.test(text)) {
      matched.push(label);
      if (points > bestPoints) bestPoints = points;
    }
  }
  return { points: bestPoints, matched };
}

function scoreAssignee(assigneeIds: string[]): { points: number; hasAssignees: boolean } {
  const hasAssignees = Array.isArray(assigneeIds) && assigneeIds.length > 0;
  return { points: hasAssignees ? 15 : 0, hasAssignees };
}

function scoreProject(_projectId: string): number {
  return 5;
}

function categorize(score: number, hasAssignees: boolean, daysStale: number, hasDue: boolean): OpsTodoCategory {
  if (score >= 60 && hasAssignees) return 'human_required';
  if (!hasDue && daysStale > 7) return 'waiting_dependency';
  return 'unscored';
}

export function scoreTodo(todo: {
  title: string;
  description: string | null;
  due_on: Date | string | null;
  bc_updated_at: Date;
  assignee_ids: string[];
  project_id: string;
}): Scored {
  const dueRes = scoreDueDate(todo.due_on);
  const staleRes = scoreStaleness(todo.bc_updated_at);
  const kwRes = scoreKeywords(todo.title, todo.description);
  const assignRes = scoreAssignee(todo.assignee_ids);
  const projPoints = scoreProject(todo.project_id);

  const breakdown: ScoreBreakdown = {
    due_date: dueRes.points,
    staleness: staleRes.points,
    keywords: kwRes.points,
    assignee: assignRes.points,
    project: projPoints,
  };
  const raw = breakdown.due_date + breakdown.staleness + breakdown.keywords + breakdown.assignee + breakdown.project;
  const urgency_score = Math.min(100, raw);
  const category = categorize(
    urgency_score,
    assignRes.hasAssignees,
    staleRes.daysStale,
    todo.due_on != null,
  );

  return {
    urgency_score,
    category,
    breakdown,
    signals: {
      days_until_due: dueRes.daysUntil,
      days_stale: staleRes.daysStale,
      matched_keywords: kwRes.matched,
      has_assignees: assignRes.hasAssignees,
    },
  };
}

export interface PriorityEngineRunResult {
  started_at: Date;
  finished_at: Date;
  todos_scored: number;
  todos_skipped: number;
  audit_rows_written: number;
  category_counts: Record<OpsTodoCategory, number>;
  errors: Array<{ todo_bc_id: string; message: string }>;
}

export async function runPriorityEngine(): Promise<PriorityEngineRunResult> {
  const result: PriorityEngineRunResult = {
    started_at: new Date(),
    finished_at: new Date(),
    todos_scored: 0,
    todos_skipped: 0,
    audit_rows_written: 0,
    category_counts: {
      human_required: 0,
      ai_can_finish: 0,
      ai_can_prepare: 0,
      can_eliminate: 0,
      waiting_dependency: 0,
      completed: 0,
      unscored: 0,
    },
    errors: [],
  };

  const todos = await OpsBcTodo.findAll({
    where: { status: { [Op.eq]: 'active' } },
  });

  for (const todo of todos) {
    try {
      const scored = scoreTodo({
        title: todo.title,
        description: todo.description,
        due_on: todo.due_on,
        bc_updated_at: todo.bc_updated_at,
        assignee_ids: todo.assignee_ids,
        project_id: todo.project_id,
      });

      await todo.update({
        urgency_score: scored.urgency_score,
        category: scored.category,
      });

      await OpsAiAssessment.create({
        todo_bc_id: todo.bc_id,
        agent: AGENT_NAME,
        agent_version: AGENT_VERSION,
        urgency_score: scored.urgency_score,
        ai_opportunity_score: null,
        brand_score: null,
        category: scored.category,
        reasoning: {
          breakdown: scored.breakdown,
          signals: scored.signals,
        },
        llm_model: null,
        llm_input_tokens: null,
        llm_output_tokens: null,
        llm_cost_usd: null,
        computed_at: new Date(),
      } as any);

      result.todos_scored++;
      result.audit_rows_written++;
      result.category_counts[scored.category]++;
    } catch (err: any) {
      result.errors.push({ todo_bc_id: todo.bc_id, message: err.message });
      result.todos_skipped++;
    }
  }

  result.finished_at = new Date();
  return result;
}
