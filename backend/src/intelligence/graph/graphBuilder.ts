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

  return graph;
}
