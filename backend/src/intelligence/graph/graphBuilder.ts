/**
 * Context Graph Builder
 * Builds graph from existing system data: Capability → Feature → Requirement → Files
 */
import { ContextGraph, GraphNode, NodeStatus } from './graphTypes';
import { getCapabilityHierarchy } from '../../services/projectScopeService';
import { getConnection } from '../../services/githubService';

const NOISE_FILES = new Set(['.gitignore', '.env.example', '.prettierrc', '.sequelizerc', 'package.json', 'tsconfig.json', 'README.md', 'package-lock.json', 'next-env.d.ts', '[id]']);
const SERVICE_PATTERN = /service|route|controller|middleware/i;
const FRONTEND_PATTERN = /\.tsx$|component|page|Page/;
const AGENT_PATTERN = /agent|Agent/;
const MODEL_PATTERN = /models?\//;

function classifyFile(path: string): 'service' | 'api_route' | 'db_model' | 'agent' | 'file' {
  const name = path.split('/').pop() || '';
  if (NOISE_FILES.has(name) || name.startsWith('.') || /^\d{14}/.test(name)) return 'file';
  if (path.includes('routes/') || name.includes('Route')) return 'api_route';
  if ((path.includes('agents/') || path.includes('intelligence/')) && AGENT_PATTERN.test(name) && name.endsWith('.ts')) return 'agent';
  if (MODEL_PATTERN.test(path) && name.endsWith('.ts') && !path.includes('frontend')) return 'db_model';
  if (SERVICE_PATTERN.test(path) && name.endsWith('.ts')) return 'service';
  if (FRONTEND_PATTERN.test(path)) return 'file'; // frontend files stay as 'file' type
  return 'file';
}

function isRealFile(path: string): boolean {
  const name = path.split('/').pop() || '';
  return !NOISE_FILES.has(name) && !name.startsWith('.') && !/^\d{14}/.test(name);
}

function reqStatusToNodeStatus(status: string): NodeStatus {
  if (status === 'verified' || status === 'auto_verified') return 'verified';
  if (status === 'matched') return 'unverified';
  if (status === 'partial') return 'partial';
  return 'missing';
}

/**
 * Build graph for a single business process (capability)
 */
export async function buildProcessGraph(projectId: string, capabilityId: string): Promise<ContextGraph> {
  const graph = new ContextGraph();
  const hierarchy = await getCapabilityHierarchy(projectId);
  const cap = hierarchy.find((c: any) => c.id === capabilityId);
  if (!cap) return graph;

  // Process node
  graph.addNode({ id: `proc:${cap.id}`, type: 'process', label: cap.name, status: 'active', metadata: { description: cap.description, priority: cap.priority } });

  const features = cap.features || [];
  for (const feat of features) {
    // Feature node
    graph.addNode({ id: `feat:${feat.id}`, type: 'feature', label: feat.name, status: 'active', metadata: { description: feat.description, success_criteria: feat.success_criteria } });
    graph.addEdge({ from: `proc:${cap.id}`, to: `feat:${feat.id}`, type: 'contains' });

    const reqs = feat.requirements || [];
    for (const req of reqs) {
      // Requirement node
      const reqStatus = reqStatusToNodeStatus(req.status);
      graph.addNode({ id: `req:${req.id}`, type: 'requirement', label: `${req.key}: ${(req.text || '').substring(0, 80)}`, status: reqStatus, metadata: { key: req.key, text: req.text, confidence: req.confidence_score } });
      graph.addEdge({ from: `feat:${feat.id}`, to: `req:${req.id}`, type: 'contains' });

      // File nodes from matched paths
      const files = (req.github_file_paths || []).filter(isRealFile);
      if (files.length > 0) {
        for (const filePath of files) {
          const fileId = `file:${filePath}`;
          if (!graph.getNode(fileId)) {
            const fileType = classifyFile(filePath);
            graph.addNode({ id: fileId, type: fileType, label: filePath.split('/').pop() || filePath, status: 'active', metadata: { path: filePath } });
          }
          graph.addEdge({ from: `req:${req.id}`, to: fileId, type: 'matched_to', weight: req.confidence_score });
        }
      } else {
        // Gap node — requirement has no real implementation
        const gapId = `gap:${req.id}`;
        graph.addNode({ id: gapId, type: 'gap', label: `Missing: ${req.key}`, status: 'missing', metadata: { requirement_key: req.key, text: req.text } });
        graph.addEdge({ from: `req:${req.id}`, to: gapId, type: 'missing' });
      }
    }
  }

  return graph;
}

/**
 * Build graph across ALL processes in a project
 * Adds cross-process edges where files are shared
 */
export async function buildProjectGraph(projectId: string): Promise<ContextGraph> {
  const graph = new ContextGraph();
  const hierarchy = await getCapabilityHierarchy(projectId);

  // Build individual process graphs and merge
  const fileToProcesses: Map<string, string[]> = new Map();

  for (const cap of hierarchy) {
    const processId = `proc:${cap.id}`;
    graph.addNode({ id: processId, type: 'process', label: cap.name, status: 'active', metadata: { description: cap.description, priority: cap.priority, capabilityId: cap.id } });

    const features = cap.features || [];
    for (const feat of features) {
      const featId = `feat:${feat.id}`;
      graph.addNode({ id: featId, type: 'feature', label: feat.name, status: 'active', metadata: {} });
      graph.addEdge({ from: processId, to: featId, type: 'contains' });

      const reqs = feat.requirements || [];
      for (const req of reqs) {
        const reqId = `req:${req.id}`;
        const reqStatus = reqStatusToNodeStatus(req.status);
        graph.addNode({ id: reqId, type: 'requirement', label: `${req.key}`, status: reqStatus, metadata: { key: req.key, confidence: req.confidence_score } });
        graph.addEdge({ from: featId, to: reqId, type: 'contains' });

        const files = (req.github_file_paths || []).filter(isRealFile);
        for (const filePath of files) {
          const fileId = `file:${filePath}`;
          if (!graph.getNode(fileId)) {
            graph.addNode({ id: fileId, type: classifyFile(filePath), label: filePath.split('/').pop() || filePath, status: 'active', metadata: { path: filePath } });
          }
          graph.addEdge({ from: reqId, to: fileId, type: 'matched_to' });

          // Track which processes use each file
          const procs = fileToProcesses.get(fileId) || [];
          if (!procs.includes(processId)) procs.push(processId);
          fileToProcesses.set(fileId, procs);
        }

        if (files.length === 0) {
          const gapId = `gap:${req.id}`;
          graph.addNode({ id: gapId, type: 'gap', label: `Missing: ${req.key}`, status: 'missing', metadata: { requirement_key: req.key } });
          graph.addEdge({ from: reqId, to: gapId, type: 'missing' });
        }
      }
    }
  }

  // Add cross-process dependency edges (shared files = shared infrastructure)
  for (const [fileId, processIds] of fileToProcesses) {
    if (processIds.length > 1) {
      // File is shared by multiple processes — create depends_on edges
      for (let i = 0; i < processIds.length; i++) {
        for (let j = i + 1; j < processIds.length; j++) {
          graph.addEdge({ from: processIds[i], to: processIds[j], type: 'depends_on', metadata: { shared_file: fileId } });
          graph.addEdge({ from: processIds[j], to: processIds[i], type: 'depends_on', metadata: { shared_file: fileId } });
        }
      }
    }
  }

  // Level 2: Add relational edges between file nodes
  addRelationalEdges(graph);

  return graph;
}

/** Extract domain stem: "userService.ts" → "user", "AuditLog.ts" → "auditlog" */
function extractStem(filename: string): string {
  return filename.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/(Service|Routes?|Controller|Agent|Model|Log|Schema)s?$/i, '').toLowerCase().replace(/[^a-z]/g, '');
}

/** Level 2: Add relational edges between file nodes using naming conventions */
function addRelationalEdges(graph: ContextGraph): void {
  const routes: Array<{ id: string; stem: string; label: string }> = [];
  const services: Array<{ id: string; stem: string; label: string }> = [];
  const models: Array<{ id: string; stem: string; label: string }> = [];
  const agents: Array<{ id: string; stem: string; label: string }> = [];

  for (const node of graph.nodes.values()) {
    const stem = extractStem(node.label || '');
    if (!stem) continue;
    if (node.type === 'api_route') routes.push({ id: node.id, stem, label: node.label });
    else if (node.type === 'service') services.push({ id: node.id, stem, label: node.label });
    else if (node.type === 'db_model') models.push({ id: node.id, stem, label: node.label });
    else if (node.type === 'agent') agents.push({ id: node.id, stem, label: node.label });
  }

  // Route → Service
  for (const route of routes) {
    let matched = false;
    for (const svc of services) {
      if (route.stem === svc.stem || svc.stem.includes(route.stem) || route.stem.includes(svc.stem)) {
        graph.addEdge({ from: route.id, to: svc.id, type: 'calls_service', metadata: { inferred: 'naming_convention' } });
        matched = true;
      }
    }
    if (!matched) {
      const gapId = `gap:conn:${route.id}`;
      graph.addNode({ id: gapId, type: 'gap', label: `API not wired: ${route.label}`, status: 'missing', metadata: { gap_type: 'missing_connection', layer: 'api_to_service' } });
      graph.addEdge({ from: route.id, to: gapId, type: 'missing_connection' });
    }
  }

  // Service → Model
  for (const svc of services) {
    for (const model of models) {
      if (svc.stem === model.stem || model.stem.includes(svc.stem) || svc.stem.includes(model.stem)) {
        graph.addEdge({ from: svc.id, to: model.id, type: 'uses_model', metadata: { inferred: 'naming_convention' } });
      }
    }
  }

  // Service → Agent
  for (const svc of services) {
    for (const agt of agents) {
      if (svc.stem === agt.stem || agt.stem.includes(svc.stem) || svc.stem.includes(agt.stem)) {
        graph.addEdge({ from: svc.id, to: agt.id, type: 'triggers_agent', metadata: { inferred: 'naming_convention' } });
      }
    }
  }
}
