// ─── Learning Engine ─────────────────────────────────────────────────────────
// Updates Knowledge Graph and Vector Memory from decision outcomes, assistant
// conversations, and monitor checkpoints. This is the feedback loop that makes
// the Intelligence OS improve over time.

import { getVectorMemory } from './vectorMemory';
import { invalidateKnowledgeGraph } from '../knowledge/knowledgeGraph';
import IntelligenceDecision from '../../models/IntelligenceDecision';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssistantResponse {
  question: string;
  answer: string;
  intent: string;
  entityType?: string;
  confidence: number;
  pipelineSteps?: Record<string, any>;
}

// ─── Decision Learning ───────────────────────────────────────────────────────

/**
 * Store reasoning and outcome from an autonomous decision into vector memory.
 * Called after a decision is created or executed.
 */
export async function updateFromDecision(
  decision: IntelligenceDecision,
): Promise<void> {
  const memory = getVectorMemory();

  const decisionId = decision.get('decision_id') as string;
  const problem = decision.get('problem_detected') as string;
  const analysis = decision.get('analysis_summary') as string | undefined;
  const action = decision.get('recommended_action') as string | undefined;
  const status = decision.get('execution_status') as string;
  const riskScore = decision.get('risk_score') as number | undefined;
  const confidenceScore = decision.get('confidence_score') as number | undefined;
  const reasoning = decision.get('reasoning') as string | undefined;

  // Store the full decision context for future retrieval
  const content = [
    `Problem: ${problem}`,
    analysis ? `Analysis: ${analysis}` : '',
    action ? `Action: ${action}` : '',
    reasoning ? `Reasoning: ${reasoning}` : '',
    `Status: ${status}`,
  ]
    .filter(Boolean)
    .join('\n');

  await memory.store('decision', content, {
    decision_id: decisionId,
    trace_id: decision.get('trace_id'),
    action,
    status,
    risk_score: riskScore,
    confidence_score: confidenceScore,
  });
}

// ─── Assistant Conversation Learning ─────────────────────────────────────────

/**
 * Store a Q&A interaction in vector memory for future retrieval.
 * Called after the assistant pipeline completes a response.
 */
export async function updateFromAssistant(
  question: string,
  response: AssistantResponse,
): Promise<void> {
  const memory = getVectorMemory();

  const content = [
    `Q: ${question}`,
    `A: ${response.answer.slice(0, 500)}`,
    `Intent: ${response.intent}`,
    response.entityType ? `Entity: ${response.entityType}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  await memory.store('conversation', content, {
    intent: response.intent,
    entity_type: response.entityType,
    confidence: response.confidence,
  });
}

// ─── Monitor Checkpoint Learning ─────────────────────────────────────────────

/**
 * Update memory after a monitor checkpoint (1h/6h/24h) evaluates a decision.
 * Stores the outcome for future impact estimation.
 */
export async function updateFromMonitor(
  decision: IntelligenceDecision,
  checkpoint: '1h' | '6h' | '24h',
): Promise<void> {
  const memory = getVectorMemory();

  const decisionId = decision.get('decision_id') as string;
  const action = decision.get('recommended_action') as string | undefined;
  const monitorResults = decision.get('monitor_results') as Record<string, any> | undefined;
  const impactAfter24h = decision.get('impact_after_24h') as Record<string, any> | undefined;
  const beforeState = decision.get('before_state') as Record<string, any> | undefined;
  const afterState = decision.get('after_state') as Record<string, any> | undefined;
  const status = decision.get('execution_status') as string;

  const checkpointData = monitorResults?.[checkpoint];
  const improved = checkpointData?.improved ?? null;

  const content = [
    `Monitor ${checkpoint}: Decision ${decisionId}`,
    `Action: ${action || 'unknown'}`,
    `Status: ${status}`,
    improved !== null ? `Improved: ${improved}` : '',
    checkpoint === '24h' && impactAfter24h ? `Impact: ${JSON.stringify(impactAfter24h)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  await memory.store('investigation', content, {
    decision_id: decisionId,
    checkpoint,
    action,
    improved,
    status,
    before_state: beforeState,
    after_state: afterState,
  });

  // At 24h checkpoint, store a dedicated insight for action success tracking
  if (checkpoint === '24h' && action) {
    const success = status === 'completed' || improved === true;
    await memory.store('insight', `Action "${action}" ${success ? 'succeeded' : 'failed'} — ${decision.get('problem_detected')}`, {
      action,
      success,
      decision_id: decisionId,
      impact: impactAfter24h,
    });
  }
}

// ─── Batch Learning ──────────────────────────────────────────────────────────

/**
 * Process all completed decisions that haven't been learned from yet.
 * Typically called by the AuditAgent during daily sweeps.
 */
export async function batchLearnFromDecisions(): Promise<number> {
  const decisions = await IntelligenceDecision.findAll({
    where: {
      execution_status: ['completed', 'rolled_back'],
    },
    order: [['timestamp', 'DESC']],
    limit: 50,
  });

  let learned = 0;
  for (const decision of decisions) {
    try {
      await updateFromDecision(decision);
      learned++;
    } catch (err: any) {
      console.warn(`[LearningEngine] Failed to learn from decision ${decision.get('decision_id')}:`, err?.message);
    }
  }

  if (learned > 0) {
    console.log(`[LearningEngine] Batch learned from ${learned} decisions`);
  }

  return learned;
}

// ─── Knowledge Graph Refresh ─────────────────────────────────────────────────

/**
 * Signal that entity relationships may have changed (e.g., after discovery).
 * Invalidates the KG cache so it rebuilds on next access.
 */
export function refreshKnowledgeGraph(): void {
  invalidateKnowledgeGraph();
  console.log('[LearningEngine] Knowledge graph invalidated for refresh');
}
