/**
 * Repo Analysis Service
 *
 * Analyzes a GitHub repo structure to detect implemented components,
 * services, agents, routes, and models. Uses cached file tree from
 * GitHubConnection (no re-fetch unless explicitly synced).
 */
import { getConnection, getFileTree } from './githubService';

export interface DetectedComponent {
  type: 'service' | 'agent' | 'route' | 'model' | 'test' | 'config' | 'frontend';
  name: string;
  path: string;
}

export interface RepoAnalysis {
  connected: boolean;
  repo_url: string | null;
  detected_components: DetectedComponent[];
  file_map: Record<string, string[]>;  // folder category → file paths
  stats: {
    total_files: number;
    language: string | null;
    folders: number;
    last_synced: string | null;
  };
}

const COMPONENT_PATTERNS: Array<{ pattern: RegExp; type: DetectedComponent['type'] }> = [
  { pattern: /\/services\/([^/]+)\.(ts|js)$/i, type: 'service' },
  { pattern: /\/agents\/([^/]+)\.(ts|js)$/i, type: 'agent' },
  { pattern: /\/routes\/([^/]+)\.(ts|js)$/i, type: 'route' },
  { pattern: /\/models\/([^/]+)\.(ts|js)$/i, type: 'model' },
  { pattern: /\/tests?\/([^/]+)\.(ts|js|test\.(ts|js))$/i, type: 'test' },
  { pattern: /\/(components|pages)\/([^/]+)\.(tsx|jsx)$/i, type: 'frontend' },
  { pattern: /\.(config|env|yml|yaml|json)$/i, type: 'config' },
];

export async function analyzeRepo(enrollmentId: string): Promise<RepoAnalysis> {
  const connection = await getConnection(enrollmentId);

  if (!connection) {
    return {
      connected: false,
      repo_url: null,
      detected_components: [],
      file_map: {},
      stats: { total_files: 0, language: null, folders: 0, last_synced: null },
    };
  }

  // Use cached file tree
  const treeData = await getFileTree(enrollmentId);
  const files: string[] = [];

  if (treeData?.tree && Array.isArray(treeData.tree)) {
    for (const item of treeData.tree) {
      if (item.type === 'blob' && item.path) {
        files.push(item.path);
      }
    }
  }

  // Detect components
  const components: DetectedComponent[] = [];
  const seenNames = new Set<string>();

  for (const filePath of files) {
    for (const { pattern, type } of COMPONENT_PATTERNS) {
      const match = filePath.match(pattern);
      if (match) {
        const name = filePath.split('/').pop()?.replace(/\.(ts|js|tsx|jsx)$/, '') || filePath;
        const key = `${type}:${name}`;
        if (!seenNames.has(key)) {
          seenNames.add(key);
          components.push({ type, name, path: filePath });
        }
        break;
      }
    }
  }

  // Build folder map
  const fileMap: Record<string, string[]> = {};
  for (const comp of components) {
    if (!fileMap[comp.type]) fileMap[comp.type] = [];
    fileMap[comp.type].push(comp.path);
  }

  // Count unique folders
  const folders = new Set(files.map(f => f.split('/').slice(0, -1).join('/'))).size;

  return {
    connected: true,
    repo_url: connection.repo_url,
    detected_components: components,
    file_map: fileMap,
    stats: {
      total_files: files.length,
      language: connection.repo_language || null,
      folders,
      last_synced: connection.last_sync_at?.toISOString() || null,
    },
  };
}
