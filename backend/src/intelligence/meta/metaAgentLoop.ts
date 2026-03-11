// ─── Meta-Agent Loop ─────────────────────────────────────────────────────────
// Hourly orchestration: PerformanceAgent → ArchitectureAgent →
// PromptOptimizationAgent → ExperimentAgent → update learning.

import { aggregatePerformanceMetrics } from './performanceAgent';
import { analyzeArchitecture } from './architectureAgent';
import { analyzePromptQuality } from './promptOptimizationAgent';
import { runExperimentCycle } from './experimentAgent';
import { getVectorMemory } from '../memory/vectorMemory';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MetaLoopResult {
  performance: { agents_analyzed: number; degrading: number };
  architecture: { proposals: number };
  prompts: { proposals: number };
  experiments: { active: number; started: number; concluded: number };
  duration_ms: number;
}

// ─── Loop ────────────────────────────────────────────────────────────────────

/**
 * Run the full meta-agent loop. Called hourly.
 */
export async function runMetaAgentLoop(): Promise<MetaLoopResult> {
  const start = Date.now();

  // Step 1: Aggregate performance metrics
  let perfResult = { agents_analyzed: 0, metrics_created: 0, degrading_agents: [] as string[] };
  try {
    perfResult = await aggregatePerformanceMetrics();
  } catch (err: any) {
    console.warn('[MetaLoop] PerformanceAgent error:', err?.message);
  }

  // Step 2: Analyze architecture (depends on fresh metrics from step 1)
  let archResult = { proposals: [] as any[], fleet_size: 0, analyzed_metrics: 0 };
  try {
    archResult = await analyzeArchitecture();
  } catch (err: any) {
    console.warn('[MetaLoop] ArchitectureAgent error:', err?.message);
  }

  // Step 3: Analyze prompt quality
  let promptResult = { proposals: [] as any[], agents_analyzed: 0 };
  try {
    promptResult = await analyzePromptQuality();
  } catch (err: any) {
    console.warn('[MetaLoop] PromptOptimizationAgent error:', err?.message);
  }

  // Step 4: Run experiment cycle
  let expResult = { active: 0, started: 0, concluded: 0, adopted: 0, rolledBack: 0 };
  try {
    expResult = await runExperimentCycle();
  } catch (err: any) {
    console.warn('[MetaLoop] ExperimentAgent error:', err?.message);
  }

  const durationMs = Date.now() - start;

  // Store summary in memory
  try {
    const memory = getVectorMemory();
    await memory.store('insight', `Meta-loop: ${perfResult.degrading_agents.length} degrading, ${archResult.proposals.length} arch proposals, ${promptResult.proposals.length} prompt proposals, ${expResult.active} experiments`, {
      type: 'meta_loop',
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
    });
  } catch {
    // Non-critical
  }

  const hasActivity = perfResult.degrading_agents.length > 0 || archResult.proposals.length > 0 || promptResult.proposals.length > 0 || expResult.started > 0;
  if (hasActivity) {
    console.log(
      `[MetaLoop] Complete: ${perfResult.degrading_agents.length} degrading, ` +
        `${archResult.proposals.length} arch, ${promptResult.proposals.length} prompt, ` +
        `${expResult.active} experiments [${durationMs}ms]`,
    );
  }

  return {
    performance: { agents_analyzed: perfResult.agents_analyzed, degrading: perfResult.degrading_agents.length },
    architecture: { proposals: archResult.proposals.length },
    prompts: { proposals: promptResult.proposals.length },
    experiments: { active: expResult.active, started: expResult.started, concluded: expResult.concluded },
    duration_ms: durationMs,
  };
}
