/**
 * Structural Verifier — runs graph-based integrity checks on a business process.
 * Wraps existing graph query functions into a single verification pass.
 * Runs post-resync (full) and on-demand (lightweight).
 */
import { ContextGraph } from '../graph/graphTypes';
import {
  getUnconnectedAPIs,
  getOrphanServices,
  getDataFlowIssues,
  getAgentIntegrationGaps,
  getFailingPaths,
  getSlowPaths,
  getUnusedComponents,
} from '../graph/graphQueryEngine';
import { StructuralCheckConfig, DEFAULT_STRUCTURAL_CONFIG } from './verificationConfig';

export interface StructuralCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  details: string[];
  severity: 'critical' | 'warning' | 'info';
  count: number;
}

export interface StructuralReport {
  timestamp: string;
  process_id: string;
  checks: StructuralCheck[];
  passed: number;
  failed: number;
  warnings: number;
  total: number;
  overall_health: 'healthy' | 'degraded' | 'critical';
  integrity_score: number; // 0-100
}

function check(
  name: string,
  items: any[],
  severity: 'critical' | 'warning' | 'info',
  detailFn: (item: any) => string
): StructuralCheck {
  const count = items.length;
  return {
    name,
    status: count === 0 ? 'pass' : severity === 'critical' ? 'fail' : 'warn',
    details: items.slice(0, 10).map(detailFn),
    severity,
    count,
  };
}

export function runStructuralChecks(
  graph: ContextGraph,
  processId: string,
  config: StructuralCheckConfig = DEFAULT_STRUCTURAL_CONFIG
): StructuralReport {
  if (config.mode === 'skip') {
    return {
      timestamp: new Date().toISOString(),
      process_id: processId,
      checks: [],
      passed: 0, failed: 0, warnings: 0, total: 0,
      overall_health: 'healthy',
      integrity_score: 100,
    };
  }

  const checks: StructuralCheck[] = [];

  // L1: Structural checks (always run)
  checks.push(check(
    'Unconnected API Routes',
    getUnconnectedAPIs(graph),
    'warning',
    (n) => `${n.label} has no service connection`
  ));

  checks.push(check(
    'Orphan Services',
    getOrphanServices(graph),
    'warning',
    (n) => `${n.label} is not called by any route`
  ));

  checks.push(check(
    'Data Flow Issues',
    getDataFlowIssues(graph),
    'warning',
    (n) => `${n.label} has no database model`
  ));

  checks.push(check(
    'Agent Integration Gaps',
    getAgentIntegrationGaps(graph),
    'info',
    (n) => `${n.label} could benefit from agent automation`
  ));

  checks.push(check(
    'Unused Components',
    getUnusedComponents(graph),
    'info',
    (n) => `${n.label} has zero execution data`
  ));

  // L3: Behavioral checks (optional — requires execution data)
  if (config.include_behavioral) {
    checks.push(check(
      'Failing Paths',
      getFailingPaths(graph),
      'critical',
      (n) => `${n.label} has >10% failure rate`
    ));

    checks.push(check(
      'Slow Paths',
      getSlowPaths(graph),
      'warning',
      (n) => `${n.label} has >500ms avg response time`
    ));
  }

  // Compute summary
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const total = checks.length;
  const integrity_score = total > 0 ? Math.round((passed / total) * 100) : 100;
  const overall_health: StructuralReport['overall_health'] =
    failed > 0 ? 'critical' : warnings > 2 ? 'degraded' : 'healthy';

  return {
    timestamp: new Date().toISOString(),
    process_id: processId,
    checks,
    passed, failed, warnings, total,
    overall_health,
    integrity_score,
  };
}
