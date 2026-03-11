// ─── Meta-Agent Layer Exports ────────────────────────────────────────────────

export { aggregatePerformanceMetrics } from './performanceAgent';
export { analyzeArchitecture, type ArchitectureProposal, type ArchitectureReport } from './architectureAgent';
export { analyzePromptQuality, type PromptProposal } from './promptOptimizationAgent';
export { runExperimentCycle, getActiveExperiments, type Experiment } from './experimentAgent';
export { runMetaAgentLoop, type MetaLoopResult } from './metaAgentLoop';
