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
import { sequelize } from '../../config/database';
import { OpsTodoCategory } from '../../models/OpsBcTodo';
import OpsAiAssessment from '../../models/OpsAiAssessment';
import { QueryTypes } from 'sequelize';

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
  /** Todos whose score+category were identical to last pass — no UPDATE, no audit row. */
  todos_unchanged: number;
  audit_rows_written: number;
  /** Audit rows deleted by the retention sweep at the end of the run. */
  audit_rows_pruned: number;
  category_counts: Record<OpsTodoCategory, number>;
  errors: Array<{ todo_bc_id: string; message: string }>;
}

interface RawTodoRow {
  bc_id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_on: Date | string | null;
  bc_updated_at: Date | string;
  assignee_ids: string[] | string; // JSONB returns either depending on driver
  project_weight: string | number | null;
  prev_score: number | string | null; // current stored urgency_score, for dedup
}

const PAGE_SIZE = 200;
const ASSESS_INSERT_BATCH = 100;
// Audit-trail retention. ops_ai_assessments is an append-only history; without a
// cap it grows by (active todos × passes) forever. The engine runs every 2 min
// (720 passes/day), so an unbounded table filled the prod disk on 2026-06-15
// (271M rows / 170GB). We keep ~90 days of history — enough to audit score drift
// and detect agent regressions — and prune the rest each run.
const ASSESS_RETENTION_DAYS = 90;

/**
 * True when a freshly computed urgency_score differs from what's already stored
 * on the todo. Pure + exported so it can be unit-tested without a DB. A null prev
 * (never scored) always counts as changed. prev_score may arrive as a string from
 * the pg driver, so we normalize numerically.
 *
 * Dedup is on urgency_score ONLY, deliberately NOT on category. ops_bc_todos.category
 * is co-owned: the priority engine sets a baseline, but automationRulesService runs
 * after the engine each cron cycle and overwrites category (e.g. to
 * 'waiting_dependency'). Including category here made the engine see a "change" every
 * single pass — the engine and automation ping-pong the column forever — so it wrote
 * one audit row per todo per cycle even when the score never moved. That re-created
 * the unbounded ops_ai_assessments growth that filled the prod disk on 2026-06-15.
 * urgency_score is owned solely by this engine (automation never touches it), so it
 * is the stable, authoritative dedup key.
 */
export function scoreChanged(
  prevScore: number | string | null,
  newScore: number,
): boolean {
  if (prevScore == null) return true;
  const prevNum = typeof prevScore === 'string' ? Number(prevScore) : prevScore;
  if (!Number.isFinite(prevNum)) return true;
  return prevNum !== newScore;
}

// Single-flight guard. A full pass over all active todos can exceed the 2-min
// cron interval, and node-cron does not prevent overlapping invocations. Without
// this, stacked passes run concurrently and each reads a todo's score before a
// peer's UPDATE commits, so they all see "changed" and all write an audit row —
// defeating the dedup and recreating the unbounded ops_ai_assessments growth
// that filled the prod disk on 2026-06-15. Module-level (one engine per process).
let engineRunning = false;

export async function runPriorityEngine(): Promise<PriorityEngineRunResult> {
  const result: PriorityEngineRunResult = {
    started_at: new Date(),
    finished_at: new Date(),
    todos_scored: 0,
    todos_skipped: 0,
    todos_unchanged: 0,
    audit_rows_written: 0,
    audit_rows_pruned: 0,
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

  // A tick that arrives while a pass is still in flight returns immediately
  // (todos_scored stays 0), so passes never overlap.
  if (engineRunning) {
    result.finished_at = new Date();
    return result;
  }
  engineRunning = true;

  try {
  let offset = 0;
  // Process in pages so the working set stays small (memory-bound on prod backend).
  // Each page: raw SELECT (no model hydration) -> in-memory scoring -> batched
  // UPDATE via CASE/IN -> batched INSERT into ops_ai_assessments.
  while (true) {
    const rows = await sequelize.query<RawTodoRow>(
      `SELECT t.bc_id, t.project_id, t.title, t.description, t.due_on,
              t.bc_updated_at, t.assignee_ids,
              t.urgency_score AS prev_score,
              COALESCE(p.weight, 1.0) AS project_weight
         FROM ops_bc_todos t
         LEFT JOIN ops_bc_projects p ON p.bc_id = t.project_id
        WHERE t.status = 'active'
        ORDER BY t.bc_id
        LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements: { limit: PAGE_SIZE, offset } },
    );
    if (rows.length === 0) break;

    const assessRowsForBatch: any[] = [];
    const computedAt = new Date();

    for (const r of rows) {
      try {
        const assignees: string[] = Array.isArray(r.assignee_ids)
          ? r.assignee_ids
          : typeof r.assignee_ids === 'string'
            ? JSON.parse(r.assignee_ids || '[]')
            : [];
        const scored = scoreTodo({
          title: r.title,
          description: r.description,
          due_on: r.due_on,
          bc_updated_at: r.bc_updated_at instanceof Date ? r.bc_updated_at : new Date(r.bc_updated_at),
          assignee_ids: assignees,
          project_id: r.project_id,
        });

        // Apply per-project weight multiplier (0.0–2.0, default 1.0). Lets Ali
        // down-weight noisy high-velocity admin projects without losing them
        // from the queue. Final score capped 0–100.
        const weight = typeof r.project_weight === 'string'
          ? parseFloat(r.project_weight)
          : (r.project_weight ?? 1.0);
        const weightedScore = Math.max(0, Math.min(100, Math.round(scored.urgency_score * (Number.isFinite(weight) ? weight : 1.0))));
        const weightedCategory = weightedScore >= 60 && scored.signals.has_assignees
          ? 'human_required'
          : scored.category;

        result.todos_scored++;
        result.category_counts[weightedCategory]++;

        // Dedup on urgency_score only (see scoreChanged): the engine runs every
        // 2 min and most todos' scores are identical pass-to-pass, so skipping the
        // redundant UPDATE and (critically) the audit-row insert is what bounds
        // ops_ai_assessments growth. category is intentionally excluded because
        // automationRulesService overwrites it after every pass, which would make
        // every todo look "changed" forever.
        if (!scoreChanged(r.prev_score, weightedScore)) {
          result.todos_unchanged++;
          continue;
        }

        // Per-row UPDATE — no model instance, no association overhead.
        await sequelize.query(
          `UPDATE ops_bc_todos
              SET urgency_score = :score,
                  category = :category,
                  updated_at = NOW()
            WHERE bc_id = :bc_id`,
          {
            replacements: {
              score: weightedScore,
              category: weightedCategory,
              bc_id: r.bc_id,
            },
          },
        );

        assessRowsForBatch.push({
          todo_bc_id: r.bc_id,
          agent: AGENT_NAME,
          agent_version: AGENT_VERSION,
          urgency_score: weightedScore,
          ai_opportunity_score: null,
          brand_score: null,
          category: weightedCategory,
          reasoning: {
            breakdown: scored.breakdown,
            signals: scored.signals,
            raw_score: scored.urgency_score,
            project_weight: weight,
            weighted_score: weightedScore,
          },
          llm_model: null,
          llm_input_tokens: null,
          llm_output_tokens: null,
          llm_cost_usd: null,
          computed_at: computedAt,
        });
      } catch (err: any) {
        result.errors.push({ todo_bc_id: r.bc_id, message: err.message });
        result.todos_skipped++;
      }
    }

    // Bulk-insert audit rows in sub-batches so we don't build one giant params array.
    for (let i = 0; i < assessRowsForBatch.length; i += ASSESS_INSERT_BATCH) {
      const chunk = assessRowsForBatch.slice(i, i + ASSESS_INSERT_BATCH);
      try {
        await OpsAiAssessment.bulkCreate(chunk as any, { validate: false });
        result.audit_rows_written += chunk.length;
      } catch (err: any) {
        result.errors.push({ todo_bc_id: `batch_offset_${offset}_${i}`, message: err.message });
      }
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Retention sweep: prune audit rows past the retention window so the table
  // stays bounded regardless of how long the engine has been running. Indexed
  // on computed_at, so this is a cheap range delete. Failures here must not fail
  // the scoring run — log and continue.
  try {
    const [, meta] = await sequelize.query(
      `DELETE FROM ops_ai_assessments
        WHERE computed_at < NOW() - (:days || ' days')::interval`,
      { replacements: { days: ASSESS_RETENTION_DAYS } },
    );
    result.audit_rows_pruned = (meta as { rowCount?: number } | undefined)?.rowCount ?? 0;
  } catch (err: any) {
    result.errors.push({ todo_bc_id: 'retention_sweep', message: err.message });
  }
  } finally {
    // Always release the single-flight guard, even if a page query threw, so a
    // failed pass can never deadlock all future runs.
    engineRunning = false;
  }

  result.finished_at = new Date();
  return result;
}
