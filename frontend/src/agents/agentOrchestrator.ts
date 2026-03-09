// SAFETY: This orchestrator is READ-ONLY. It coordinates agents but never modifies the DOM.

import { runUxUiAgent, type AgentReport } from './uxUiAgent';
import { runMarketingStrategyAgent } from './marketingStrategyAgent';
import { runConversionTestingAgent } from './conversionTestingAgent';
import { CONFIDENCE_THRESHOLD, BLUEPRINT_ALIGNMENT_THRESHOLD } from '../config/marketingBlueprint';
import type { ValidationResult } from '../services/blueprintValidator';

export interface OrchestratedReport {
  route: string;
  timestamp: string;
  agents: AgentReport[];
  overallScore: number;
  topSuggestions: ValidationResult[];
  totalRules: number;
  passedRules: number;
  failedRules: number;
}

export function runAllAgents(route: string): OrchestratedReport {
  const agents = [
    runUxUiAgent(route),
    runMarketingStrategyAgent(route),
    runConversionTestingAgent(route),
  ];

  const allResults = agents.flatMap(a => a.results);
  const totalRules = allResults.length;
  const passedRules = allResults.filter(r => r.passed).length;
  const failedRules = totalRules - passedRules;

  // Weighted score across all results
  const totalWeight = allResults.reduce((sum, r) => sum + r.blueprintAlignmentScore, 0);
  const passedWeight = allResults.filter(r => r.passed).reduce((sum, r) => sum + r.blueprintAlignmentScore, 0);
  const overallScore = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 100;

  // Only surface high-confidence, high-alignment suggestions
  const topSuggestions = allResults.filter(r =>
    !r.passed &&
    r.confidence >= CONFIDENCE_THRESHOLD &&
    r.blueprintAlignmentScore >= BLUEPRINT_ALIGNMENT_THRESHOLD
  );

  return {
    route,
    timestamp: new Date().toISOString(),
    agents,
    overallScore,
    topSuggestions,
    totalRules,
    passedRules,
    failedRules,
  };
}
