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
import { createTicket } from '../../services/ticketService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TicketSummary {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  estimated_effort: string | null;
  due_date: string | null;
  auto_executed: boolean;
}

export interface CycleResult {
  trace_id: string;
  problems_detected: number;
  decisions_created: number;
  auto_executed: number;
  proposed: number;
  tickets: TicketSummary[];
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
  const tickets: TicketSummary[] = [];
  let decisionsCreated = 0;
  let autoExecuted = 0;
  let proposed = 0;

  // Step 1: Detect problems
  let problems: DetectedProblem[] = [];
  try {
    problems = await discoverProblems();
  } catch (err: any) {
    errors.push(`Discovery failed: ${err.message}`);
    return { trace_id: traceId, problems_detected: 0, decisions_created: 0, auto_executed: 0, proposed: 0, tickets: [], errors, duration_ms: Date.now() - start };
  }

  if (problems.length === 0) {
    return { trace_id: traceId, problems_detected: 0, decisions_created: 0, auto_executed: 0, proposed: 0, tickets: [], errors, duration_ms: Date.now() - start };
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

      // Step 6b: Create ticket for tracking
      const isAutoExec = risk.auto_executable;
      const effortEstimate = estimateEffort(risk.risk_score, impact);
      const dueDate = estimateDueDate(effortEstimate);
      try {
        const ticket = await createTicket({
          title: `[${isAutoExec ? 'Auto' : 'Review'}] ${recommendation.action}`,
          description: [
            `**Problem:** ${problem.description}`,
            `**Root Cause:** ${rootCause.reasoning}`,
            `**Recommended Action:** ${recommendation.description || recommendation.action}`,
            `**Expected Impact:** ${recommendation.expected_impact || 'N/A'}`,
            `**Risk Score:** ${risk.risk_score}/100 (${risk.risk_tier})`,
            `**Confidence:** ${risk.confidence_score}%`,
            impact.metric ? `**Metric:** ${impact.metric} — ${impact.current_value} → ${impact.predicted_value} (${impact.change_pct > 0 ? '+' : ''}${impact.change_pct}%)` : '',
          ].filter(Boolean).join('\n'),
          status: isAutoExec ? 'in_progress' : 'todo',
          priority: risk.risk_score >= 70 ? 'critical' : risk.risk_score >= 50 ? 'high' : risk.risk_score >= 30 ? 'medium' : 'low',
          type: 'agent_action',
          source: 'cory_autonomous_cycle',
          created_by_type: 'cory',
          created_by_id: 'cory-engine',
          entity_type: 'decision',
          entity_id: decision.get('decision_id') as string,
          confidence: risk.confidence_score / 100,
          estimated_effort: effortEstimate,
          due_date: dueDate,
          metadata: {
            trace_id: traceId,
            risk_tier: risk.risk_tier,
            auto_executed: isAutoExec,
            impact_metric: impact.metric,
            impact_change_pct: impact.change_pct,
          },
        });

        tickets.push({
          id: ticket.id,
          ticket_number: (ticket as any).ticket_number,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          type: ticket.type,
          estimated_effort: effortEstimate,
          due_date: dueDate ? dueDate.toISOString().split('T')[0] : null,
          auto_executed: isAutoExec,
        });
      } catch (ticketErr: any) {
        errors.push(`Ticket creation failed: ${ticketErr.message}`);
      }

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
    tickets,
    errors,
    duration_ms: duration,
  };
}

// ─── Effort & Due Date Estimation ───────────────────────────────────────────

function estimateEffort(riskScore: number, impact: ImpactEstimate): string {
  // Higher risk/impact = more effort
  const changeMagnitude = Math.abs(impact.change_pct || 0);
  if (riskScore < 20 && changeMagnitude < 10) return '30min';
  if (riskScore < 40 && changeMagnitude < 25) return '2h';
  if (riskScore < 60) return '4h';
  if (riskScore < 80) return '1d';
  return '3d';
}

function estimateDueDate(effort: string): Date {
  const now = new Date();
  const hoursMap: Record<string, number> = { '30min': 1, '2h': 4, '4h': 8, '1d': 24, '3d': 72 };
  const hours = hoursMap[effort] || 24;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
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
