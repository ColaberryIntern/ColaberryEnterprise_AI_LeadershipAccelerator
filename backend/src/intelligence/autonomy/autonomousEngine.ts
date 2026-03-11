// ─── Autonomous Engine ───────────────────────────────────────────────────────
// 8-step autonomous pipeline: detect → investigate → recommend → estimate →
// evaluate risk → execute (if safe) → monitor → log. Runs every 10 minutes.

import crypto from 'crypto';
import IntelligenceDecision from '../../models/IntelligenceDecision';
import { discoverProblems, type DetectedProblem } from '../agents/ProblemDiscoveryAgent';
import { investigateProblem, type RootCauseResult } from '../agents/RootCauseAgent';
import { planActions, type ActionRecommendation } from '../agents/ActionPlannerAgent';
import { estimateImpact, type ImpactEstimate } from '../agents/ImpactEstimatorAgent';
import { evaluateRisk, type RiskEvaluation } from '../agents/RiskEvaluatorAgent';
import { executeAction } from '../agents/ExecutionAgent';
import { updateFromDecision } from '../memory/learningEngine';
import { getVectorMemory } from '../memory/vectorMemory';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CycleResult {
  trace_id: string;
  problems_detected: number;
  decisions_created: number;
  auto_executed: number;
  proposed: number;
  errors: string[];
  duration_ms: number;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Run one full autonomous cycle: detect → investigate → recommend → execute.
 */
export async function runAutonomousCycle(): Promise<CycleResult> {
  const traceId = crypto.randomUUID();
  const start = Date.now();
  const errors: string[] = [];
  let decisionsCreated = 0;
  let autoExecuted = 0;
  let proposed = 0;

  // Step 1: Detect problems
  let problems: DetectedProblem[] = [];
  try {
    problems = await discoverProblems();
  } catch (err: any) {
    errors.push(`Discovery failed: ${err.message}`);
    return { trace_id: traceId, problems_detected: 0, decisions_created: 0, auto_executed: 0, proposed: 0, errors, duration_ms: Date.now() - start };
  }

  if (problems.length === 0) {
    return { trace_id: traceId, problems_detected: 0, decisions_created: 0, auto_executed: 0, proposed: 0, errors, duration_ms: Date.now() - start };
  }

  console.log(`[AutonomousEngine] Detected ${problems.length} problem(s) [trace: ${traceId}]`);

  // Process each problem through the pipeline
  for (const problem of problems) {
    try {
      // Step 2: Investigate root cause
      const rootCause = await investigateProblem(problem, traceId);

      // Step 3: Generate action recommendations
      const recommendations = await planActions(rootCause);
      if (recommendations.length === 0) {
        // Log as investigation-only (no actionable recommendation)
        await storeInvestigationMemory(problem, rootCause, traceId);
        continue;
      }

      // Take the top recommendation
      const recommendation = recommendations[0];

      // Step 4: Estimate impact
      const impact = await estimateImpact(recommendation, problem);

      // Step 5: Evaluate risk
      const risk = evaluateRisk(recommendation, impact, rootCause);

      // Step 6: Create decision record
      const decision = await IntelligenceDecision.create({
        trace_id: traceId,
        problem_detected: problem.description,
        analysis_summary: rootCause.reasoning,
        recommended_action: recommendation.action,
        action_details: {
          parameters: recommendation.parameters,
          description: recommendation.description,
          expected_impact: recommendation.expected_impact,
          reversible: recommendation.reversible,
          alternatives: recommendations.slice(1).map((r) => r.action),
        },
        impact_estimate: {
          metric: impact.metric,
          current_value: impact.current_value,
          predicted_value: impact.predicted_value,
          change_pct: impact.change_pct,
          basis: impact.basis,
        },
        risk_score: risk.risk_score,
        confidence_score: risk.confidence_score,
        risk_tier: risk.risk_tier,
        execution_status: risk.auto_executable ? 'approved' : 'proposed',
        reasoning: [
          ...rootCause.root_causes,
          '',
          '--- Risk Assessment ---',
          ...risk.reasoning,
        ].join('\n'),
      });

      decisionsCreated++;

      // Step 7: Auto-execute if safe
      if (risk.auto_executable) {
        const execResult = await executeAction(
          decision.get('decision_id') as string,
          recommendation.action,
          recommendation.parameters,
          traceId,
        );

        if (execResult.success) {
          autoExecuted++;
          console.log(`[AutonomousEngine] Auto-executed: ${recommendation.action} [risk: ${risk.risk_score}, confidence: ${risk.confidence_score}]`);
        } else {
          errors.push(`Execution failed for ${recommendation.action}: ${execResult.error}`);
        }
      } else {
        proposed++;
        console.log(`[AutonomousEngine] Proposed: ${recommendation.action} [risk: ${risk.risk_score}, confidence: ${risk.confidence_score}]`);
      }

      // Step 8: Update learning
      try {
        await updateFromDecision(decision);
      } catch {
        // Non-critical
      }
    } catch (err: any) {
      errors.push(`Pipeline error for ${problem.type}: ${err.message}`);
      continue; // Continue processing other problems
    }
  }

  const duration = Date.now() - start;
  if (decisionsCreated > 0) {
    console.log(
      `[AutonomousEngine] Cycle complete: ${problems.length} problems, ` +
        `${decisionsCreated} decisions (${autoExecuted} auto, ${proposed} proposed) [${duration}ms]`,
    );
  }

  return {
    trace_id: traceId,
    problems_detected: problems.length,
    decisions_created: decisionsCreated,
    auto_executed: autoExecuted,
    proposed,
    errors,
    duration_ms: duration,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function storeInvestigationMemory(
  problem: DetectedProblem,
  rootCause: RootCauseResult,
  traceId: string,
): Promise<void> {
  try {
    const memory = getVectorMemory();
    await memory.store('investigation', `Investigation: ${problem.description}\nRoot causes: ${rootCause.root_causes.join('; ')}\nNo actionable recommendation.`, {
      trace_id: traceId,
      problem_type: problem.type,
      root_causes: rootCause.root_causes,
    });
  } catch {
    // Non-critical
  }
}

// ─── Simulation ──────────────────────────────────────────────────────────────

/**
 * Simulate the autonomous cycle without executing any actions.
 * Returns what would happen if the cycle ran right now.
 */
export async function simulateAutonomousCycle(): Promise<{
  problems: DetectedProblem[];
  recommendations: Array<{
    problem: string;
    action: string;
    risk_score: number;
    confidence_score: number;
    auto_executable: boolean;
  }>;
}> {
  const problems = await discoverProblems();
  const recommendations: Array<{
    problem: string;
    action: string;
    risk_score: number;
    confidence_score: number;
    auto_executable: boolean;
  }> = [];

  for (const problem of problems) {
    try {
      const rootCause = await investigateProblem(problem, 'simulation');
      const actions = await planActions(rootCause);
      if (actions.length === 0) continue;

      const impact = await estimateImpact(actions[0], problem);
      const risk = evaluateRisk(actions[0], impact, rootCause);

      recommendations.push({
        problem: problem.description,
        action: actions[0].action,
        risk_score: risk.risk_score,
        confidence_score: risk.confidence_score,
        auto_executable: risk.auto_executable,
      });
    } catch {
      continue;
    }
  }

  return { problems, recommendations };
}
