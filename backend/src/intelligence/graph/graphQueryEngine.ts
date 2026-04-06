/**
 * Context Graph Query Engine
 * Query functions for traversing the context graph to derive priorities and actions.
 */
import { ContextGraph, GraphNode } from './graphTypes';

/**
 * Get requirements with no matched_to edge to real files
 */
export function getUnimplementedRequirements(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('requirement').filter(req => {
    const edges = graph.getEdgesFrom(req.id);
    return !edges.some(e => e.type === 'matched_to');
  });
}

/**
 * Get requirements with matched_to edges
 */
export function getImplementedRequirements(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('requirement').filter(req => {
    const edges = graph.getEdgesFrom(req.id);
    return edges.some(e => e.type === 'matched_to');
  });
}

/**
 * Get verified requirements (status = verified)
 */
export function getVerifiedRequirements(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('requirement').filter(req => req.status === 'verified');
}

/**
 * Get all gap nodes
 */
export function getMissingCapabilities(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('gap');
}

/**
 * Rank processes by priority using graph analysis.
 * Returns Map<processNodeId, priorityScore> (higher = build first)
 */
export function getProcessPriority(graph: ContextGraph): Map<string, { score: number; reason: string }> {
  const processes = graph.getNodesByType('process');
  const priorities = new Map<string, { score: number; reason: string }>();

  for (const proc of processes) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Foundation score: how many OTHER processes share files with this one?
    const dependsOnEdges = graph.getEdgesFrom(proc.id).filter(e => e.type === 'depends_on');
    const sharedProcessCount = new Set(dependsOnEdges.map(e => e.to)).size;
    if (sharedProcessCount > 0) {
      score += sharedProcessCount * 15;
      reasons.push(`Shared infrastructure with ${sharedProcessCount} processes`);
    }

    // 2. File-type analysis: processes with more backend/service files = infrastructure = build first
    const features = graph.getConnectedNodes(proc.id, 'contains');
    const allReqs = features.flatMap(f => graph.getConnectedNodes(f.id, 'contains'));
    const allFiles = allReqs.flatMap(r => graph.getConnectedNodes(r.id, 'matched_to'));
    const serviceCount = allFiles.filter(f => f.type === 'service').length;
    const modelCount = allFiles.filter(f => f.type === 'db_model').length;
    const agentCount = allFiles.filter(f => f.type === 'agent').length;

    if (serviceCount > 0 || modelCount > 0) {
      score += (serviceCount + modelCount) * 10;
      reasons.push(`${serviceCount} services, ${modelCount} models (infrastructure)`);
    }

    // 3. Gap count: more gaps = more work needed = higher priority (more critical to address)
    const gaps = allReqs.flatMap(r => graph.getConnectedNodes(r.id, 'missing'));
    if (gaps.length > 0) {
      score += gaps.length * 5;
      reasons.push(`${gaps.length} unimplemented requirements`);
    }

    // 4. Requirement count: more requirements = more important process
    score += allReqs.length * 2;

    // 5. Layer order bonus: data/backend processes before frontend
    const hasBackendFiles = allFiles.some(f => f.type === 'service' || f.type === 'db_model');
    const hasFrontendOnly = !hasBackendFiles && allFiles.some(f => f.metadata?.path?.includes('.tsx'));
    if (hasBackendFiles) {
      score += 20;
      reasons.push('Backend infrastructure (build first)');
    } else if (hasFrontendOnly) {
      score -= 10;
      reasons.push('Frontend-only (build after backend)');
    }

    priorities.set(proc.id, { score, reason: reasons.join('; ') || 'Standard priority' });
  }

  return priorities;
}

/**
 * Generate graph-driven execution plan for a single process
 */
export function getNextBestActions(graph: ContextGraph, processId: string): Array<{
  step: number; key: string; label: string; impact: string;
  depends_on: string; fixes: string[]; enables: string[];
  blocked: boolean; block_reason?: string; prompt_target: string;
  requirements_covered: string[];
}> {
  const actions: Array<any> = [];
  let step = 1;

  // Get all requirements for this process
  const features = graph.getConnectedNodes(processId, 'contains');
  const allReqs = features.flatMap(f => graph.getConnectedNodes(f.id, 'contains')).filter(n => n.type === 'requirement');
  const allFiles = allReqs.flatMap(r => graph.getConnectedNodes(r.id, 'matched_to'));
  const gaps = allReqs.filter(r => graph.getEdgesFrom(r.id).some(e => e.type === 'missing'));

  // Analyze what layers exist
  const hasBackend = allFiles.some(f => f.type === 'service');
  const hasModels = allFiles.some(f => f.type === 'db_model');
  const hasFrontend = allFiles.some(f => f.metadata?.path?.includes('.tsx'));
  const hasAgents = allFiles.some(f => f.type === 'agent');

  // Generate actions based on what's missing
  if (!hasBackend && gaps.length > 0) {
    const backendReqs = gaps.filter(r => {
      const text = (r.metadata?.text || r.label || '').toLowerCase();
      return text.includes('api') || text.includes('service') || text.includes('backend') || text.includes('data') || text.includes('process') || text.includes('manage');
    });
    actions.push({
      step: step++, key: 'build_backend', label: 'Build Backend Services',
      impact: '+50% readiness', depends_on: 'None — Foundation',
      fixes: ['Backend Missing', 'API Routes Missing'], enables: ['API endpoints', 'Frontend integration', 'Agent automation'],
      blocked: false, prompt_target: 'backend_improvement',
      requirements_covered: backendReqs.slice(0, 5).map(r => r.metadata?.key || r.id),
    });
  }

  if (!hasModels && hasBackend) {
    actions.push({
      step: step++, key: 'add_database', label: 'Add Database Models',
      impact: '+20% reliability', depends_on: 'Backend services',
      fixes: ['Data Layer Missing'], enables: ['Persistent storage', 'Data integrity'],
      blocked: !hasBackend, block_reason: !hasBackend ? 'Requires: Backend services' : undefined,
      prompt_target: 'backend_improvement', requirements_covered: [],
    });
  } else if (!hasModels && !hasBackend) {
    actions.push({
      step: step++, key: 'add_database', label: 'Add Database Models',
      impact: '+20% reliability', depends_on: 'Backend services',
      fixes: ['Data Layer Missing'], enables: ['Persistent storage'],
      blocked: true, block_reason: 'Requires: Backend services',
      prompt_target: 'backend_improvement', requirements_covered: [],
    });
  }

  if (!hasFrontend) {
    actions.push({
      step: step++, key: 'add_frontend', label: 'Create Frontend UI',
      impact: '+30% readiness', depends_on: 'Backend API',
      fixes: ['Frontend Missing'], enables: ['User interaction', 'UX exposure'],
      blocked: !hasBackend, block_reason: !hasBackend ? 'Requires: Backend API' : undefined,
      prompt_target: 'frontend_exposure', requirements_covered: [],
    });
  }

  if (!hasAgents && (hasBackend || hasFrontend)) {
    actions.push({
      step: step++, key: 'add_agents', label: 'Add AI Agent Automation',
      impact: '+20% automation', depends_on: 'Backend services',
      fixes: ['Automation Gap'], enables: ['Autonomous operation', 'Scheduled tasks'],
      blocked: !hasBackend, block_reason: !hasBackend ? 'Requires: Backend services' : undefined,
      prompt_target: 'agent_enhancement', requirements_covered: [],
    });
  }

  // If everything exists but there are still gaps
  if (hasBackend && gaps.length > 0) {
    actions.push({
      step: step++, key: 'verify_requirements', label: 'Verify & Complete Remaining Requirements',
      impact: '+verified confidence', depends_on: 'Implementation exists',
      fixes: ['Unverified requirements'], enables: ['Accurate tracking', 'Trust in metrics'],
      blocked: false, prompt_target: 'backend_improvement',
      requirements_covered: gaps.slice(0, 5).map(r => r.metadata?.key || r.id),
    });
  }

  // If system is mostly built, suggest quality improvements
  if (hasBackend && hasFrontend && gaps.length < allReqs.length * 0.3) {
    actions.push({
      step: step++, key: 'add_monitoring', label: 'Add Monitoring & Logging',
      impact: '+15% quality', depends_on: 'Backend services',
      fixes: ['No observability'], enables: ['Error detection', 'Performance tracking'],
      blocked: false, prompt_target: 'monitoring_gap', requirements_covered: [],
    });
  }

  // Level 2: Relationship-based actions
  const routeNodes = allFiles.filter(f => f.type === 'api_route');
  const serviceNodes = allFiles.filter(f => f.type === 'service');
  const modelNodes = allFiles.filter(f => f.type === 'db_model');

  // Check for disconnected routes (no calls_service edge)
  const disconnectedRoutes = routeNodes.filter(r => !graph.getEdgesFrom(r.id).some(e => e.type === 'calls_service'));
  if (disconnectedRoutes.length > 0 && hasBackend) {
    actions.push({
      step: step++, key: 'connect_api_service', label: 'Connect API Routes to Services',
      impact: '+10% reliability', depends_on: 'Backend services',
      fixes: [`${disconnectedRoutes.length} disconnected API routes`], enables: ['Data flow', 'API functionality'],
      blocked: false, prompt_target: 'backend_improvement',
      requirements_covered: [],
    });
  }

  // Check for services without DB models
  const unmodeled = serviceNodes.filter(s => !graph.getEdgesFrom(s.id).some(e => e.type === 'uses_model'));
  if (unmodeled.length > 0 && !hasModels) {
    actions.push({
      step: step++, key: 'connect_service_db', label: 'Add Database Models for Services',
      impact: '+15% reliability', depends_on: 'Backend services',
      fixes: [`${unmodeled.length} services without data models`], enables: ['Persistent storage', 'Data integrity'],
      blocked: false, prompt_target: 'backend_improvement',
      requirements_covered: [],
    });
  }

  return actions;
}

// ── Level 2 Query Functions ──

/** Routes with no calls_service edge */
export function getUnconnectedAPIs(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('api_route').filter(r => !graph.getEdgesFrom(r.id).some(e => e.type === 'calls_service'));
}

/** Services not called by any route */
export function getOrphanServices(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('service').filter(s => !graph.getEdgesTo(s.id).some(e => e.type === 'calls_service'));
}

/** Services with no uses_model edge */
export function getDataFlowIssues(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('service').filter(s => !graph.getEdgesFrom(s.id).some(e => e.type === 'uses_model'));
}

/** Services that could have agents but don't */
export function getAgentIntegrationGaps(graph: ContextGraph): GraphNode[] {
  return graph.getNodesByType('service').filter(s => !graph.getEdgesFrom(s.id).some(e => e.type === 'triggers_agent'));
}

/** Build ordered flow for a process: Frontend → API → Service → DB → Agent */
export function getProcessFlow(graph: ContextGraph, processId: string): {
  flow: Array<{ layer: string; status: 'ready' | 'partial' | 'missing'; files: string[]; connections: string[] }>;
  broken_connections: string[];
} {
  const features = graph.getConnectedNodes(processId, 'contains');
  const allReqs = features.flatMap(f => graph.getConnectedNodes(f.id, 'contains')).filter(n => n.type === 'requirement');
  const allFiles = allReqs.flatMap(r => graph.getConnectedNodes(r.id, 'matched_to'));

  const frontendFiles = allFiles.filter(f => f.metadata?.path?.includes('.tsx')).map(f => f.label);
  const routeFiles = allFiles.filter(f => f.type === 'api_route').map(f => f.label);
  const serviceFiles = allFiles.filter(f => f.type === 'service').map(f => f.label);
  const modelFiles = allFiles.filter(f => f.type === 'db_model').map(f => f.label);
  const agentFiles = allFiles.filter(f => f.type === 'agent').map(f => f.label);

  const broken: string[] = [];

  // Check connections
  const routeNodes = allFiles.filter(f => f.type === 'api_route');
  const serviceNodes = allFiles.filter(f => f.type === 'service');
  for (const r of routeNodes) {
    if (!graph.getEdgesFrom(r.id).some(e => e.type === 'calls_service')) {
      broken.push(`${r.label} → Service: no connection`);
    }
  }
  for (const s of serviceNodes) {
    if (!graph.getEdgesFrom(s.id).some(e => e.type === 'uses_model')) {
      broken.push(`${s.label} → Database: no model linked`);
    }
  }

  return {
    flow: [
      { layer: 'Frontend', status: frontendFiles.length > 0 ? 'ready' : 'missing', files: frontendFiles, connections: [] },
      { layer: 'API Routes', status: routeFiles.length > 0 ? 'ready' : 'missing', files: routeFiles, connections: broken.filter(b => b.includes('→ Service')) },
      { layer: 'Services', status: serviceFiles.length > 0 ? 'ready' : 'missing', files: serviceFiles, connections: broken.filter(b => b.includes('→ Database')) },
      { layer: 'Database', status: modelFiles.length > 0 ? 'ready' : 'missing', files: modelFiles, connections: [] },
      { layer: 'Agents', status: agentFiles.length > 0 ? 'ready' : 'missing', files: agentFiles, connections: [] },
    ],
    broken_connections: broken,
  };
}
