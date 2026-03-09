// SAFETY: This agent is READ-ONLY. It must never modify the DOM or application state.

import { validatePage, type ValidationResult } from '../services/blueprintValidator';

export interface AgentReport {
  agentName: string;
  route: string;
  timestamp: string;
  results: ValidationResult[];
  summary: string;
  overallConfidence: number;
}

export function runUxUiAgent(route: string): AgentReport {
  const report = validatePage(route);
  const results = report.results.filter(r => r.category === 'ux_ui');

  const failures = results.filter(r => !r.passed);
  const avgConfidence = results.length > 0
    ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    : 1;

  let summary: string;
  if (failures.length === 0) {
    summary = `UX/UI Agent: All ${results.length} checks passed on ${route}.`;
  } else {
    const top = failures.slice(0, 3).map(f => f.details).join('; ');
    summary = `UX/UI Agent: ${failures.length}/${results.length} issues on ${route}: ${top}`;
  }

  return {
    agentName: 'UX/UI Optimization Agent',
    route,
    timestamp: report.timestamp,
    results,
    summary,
    overallConfidence: avgConfidence,
  };
}
