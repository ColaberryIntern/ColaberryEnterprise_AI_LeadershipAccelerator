import OpenAI from 'openai';
import { getStudentSuccessSnapshot } from '../studentSuccessSnapshot';
import { assembleEvidence } from '../studentHealthAssessment/evidenceAssembly';
import { getLatestStudentAssessment, maybeRefreshStudentAssessment } from '../studentHealthAssessment';

/**
 * Reese Agentic AI Employee mission, Checkpoint E (Capability 5, first real
 * slice): Reese's first genuinely LLM-invokable tools. Everything before this
 * (Student Success 360 highlights, health-assessment highlights) was code
 * deterministically injecting text into Reese's system prompt — the LLM never
 * decided to fetch anything. These 2 tools are the first case where Reese
 * herself chooses, mid-conversation, whether she needs more evidence.
 *
 * Deliberately scoped to the mission's own "Autonomous read/assessment" tier
 * (no side effects visible to the student, no messaging, no ticket writes) —
 * the higher tiers (respond_to_student_dm as a formal tool, ticket creation,
 * escalation) and the shadow-to-enforce authorization migration are explicitly
 * NOT part of this slice; Ali scoped this pass to read-only tools only.
 *
 * SECURITY: neither tool accepts an enrollmentId parameter from the model.
 * The student in scope is always the one already bound to this conversation
 * server-side (reeseReplyService.ts's own senderEnrollmentId) — never a value
 * the LLM could be tricked into supplying, which would otherwise let a
 * malicious message try to make Reese read a DIFFERENT student's data.
 */
export const REESE_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_student_success_snapshot',
      description: "Read this student's fuller evidence picture — attendance, timeline progress, assessment scores, project/repo progress, certification readiness, community activity, and open support tickets. Use this when you need more than what's already in your context to answer well.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assess_student_health',
      description: "Get this student's current structured health read: overall status, confidence, likely root cause, and a suggested approach. If none exists yet or the last one is due for a refresh, this runs a fresh evidence-grounded assessment first. Use this when you want a considered judgment, not just raw numbers.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// REESE_TOOLS's static array type (OpenAI.Chat.ChatCompletionTool[]) is a
// union that also includes a non-function "custom tool" variant this file
// never constructs — narrow per-element rather than assuming .function exists.
const TOOL_NAMES = new Set(REESE_TOOLS.map((t) => (t.type === 'function' ? t.function.name : null)).filter((n): n is string => n !== null));

export function isReeseTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

async function readStudentSuccessSnapshotTool(enrollmentId: string): Promise<unknown> {
  const snapshot = await getStudentSuccessSnapshot(enrollmentId);
  const evidence = assembleEvidence(snapshot);
  return {
    known: evidence.usable.map((e) => ({ category: e.category, summary: e.summary, observedAt: e.observedAt })),
    notKnown: evidence.excluded.map((e) => ({ category: e.category, status: e.status, reason: e.reliabilityReason })),
  };
}

async function assessStudentHealthTool(enrollmentId: string): Promise<unknown> {
  await maybeRefreshStudentAssessment(enrollmentId);
  const assessment = await getLatestStudentAssessment(enrollmentId);
  if (!assessment) return { status: 'unknown', note: 'No assessment is available for this student yet.' };
  return {
    status: assessment.status,
    confidenceScore: assessment.confidenceScore,
    confidenceBand: assessment.confidenceBand,
    primaryRootCause: assessment.primaryRootCause,
    secondaryRootCause: assessment.secondaryRootCause,
    recommendedIntervention: assessment.recommendedIntervention,
    requiresHumanReview: assessment.requiresHumanReview,
    asOf: assessment.createdAt,
  };
}

/**
 * Executes one real tool call by name. enrollmentId is always the caller's
 * own bound value (see the module header's security note) — this function
 * has no path that accepts or forwards an id from the model. Never throws:
 * a real failure degrades to an honest error payload the model can see and
 * work around, matching this codebase's own fail-safe posture for anything
 * feeding a live conversation.
 */
export async function executeReeseTool(toolName: string, enrollmentId: string): Promise<string> {
  try {
    if (toolName === 'read_student_success_snapshot') {
      return JSON.stringify(await readStudentSuccessSnapshotTool(enrollmentId));
    }
    if (toolName === 'assess_student_health') {
      return JSON.stringify(await assessStudentHealthTool(enrollmentId));
    }
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  } catch (e: any) {
    return JSON.stringify({ error: 'Tool execution failed', message: String(e?.message || e) });
  }
}
