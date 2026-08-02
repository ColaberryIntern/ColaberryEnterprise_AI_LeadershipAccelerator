// ─── Cory Health Canary (TBI T001) ─────────────────────────────────────────
// Real code, not synthetic data: exercises Cory's actual read-only tool
// executors (get_department_context, search_knowledge) on a fixed cadence so
// tool.call + retrieval (vector) events keep flowing to ai_events even during
// weeks with no real Cory investigation traffic. Both executors already emit
// their own ai_events (executeSearchKnowledge -> emitRetrieval internally);
// this service adds the emitToolCall wrapper the agentic loop would normally
// provide, using the exact same executors production Cory investigations use.
//
// Deliberately does NOT run the full agentic loop or expose create_action_ticket
// — only the two read-only executors are called directly, so there is no LLM
// tool-choice involved and no possibility of a write side effect.
//
// Idempotency: read-only + telemetry-only, no persisted business state, so
// re-running (including overlapping cron ticks) is safe by construction — see
// CLAUDE.md Idempotency & Replayability (dedup keys apply to side-effecting
// operations; this has none).

import Department from '../../models/Department';
import { emitToolCall } from '../aiEventService';
import { executeGetDepartmentContext, executeSearchKnowledge } from '../../intelligence/assistant/coryAgenticEngine';

const CANARY_WORKFLOW_ID = 'cory_health_canary';
const CANARY_AGENT_ID = 'Cory';
const CANARY_QUERY = 'trust score observability initiative';

export interface CoryHealthCanaryResult {
  ranDepartmentCheck: boolean;
  ranKnowledgeSearch: boolean;
  departmentChecked: string | null;
  knowledgeHits: number;
  errors: string[];
}

export async function runCoryHealthCanary(): Promise<CoryHealthCanaryResult> {
  const result: CoryHealthCanaryResult = {
    ranDepartmentCheck: false,
    ranKnowledgeSearch: false,
    departmentChecked: null,
    knowledgeHits: 0,
    errors: [],
  };

  // Tool-call leg: exercise a real read-only tool executor + record it exactly
  // as the agentic loop would (coryAgenticEngine.ts line ~660).
  try {
    const dept = await Department.findOne({ order: [['id', 'ASC']] });
    if (dept) {
      const t0 = Date.now();
      const detail = await executeGetDepartmentContext(dept.name);
      await emitToolCall({
        tool: 'get_department_context',
        ok: !detail?.error,
        durationMs: Date.now() - t0,
        workflowId: CANARY_WORKFLOW_ID,
        agentId: CANARY_AGENT_ID,
        args: { department_name: dept.name },
        resultSummary: detail?.error ? `error: ${detail.error}` : `health_score=${detail?.health_score ?? 'n/a'}`,
      });
      result.ranDepartmentCheck = true;
      result.departmentChecked = dept.name;
    } else {
      result.errors.push('No Department rows found — skipped department-context leg.');
    }
  } catch (err: any) {
    result.errors.push(`department_context: ${err?.message || 'unknown error'}`);
  }

  // Retrieval leg: search_knowledge emits its own retrieval (method: 'vector')
  // event internally, so no separate emitRetrieval call is needed here.
  try {
    const search = await executeSearchKnowledge(CANARY_QUERY, 3);
    result.ranKnowledgeSearch = true;
    result.knowledgeHits = search?.count ?? 0;
  } catch (err: any) {
    result.errors.push(`search_knowledge: ${err?.message || 'unknown error'}`);
  }

  return result;
}
