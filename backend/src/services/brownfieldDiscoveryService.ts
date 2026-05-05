/**
 * Brownfield Discovery Service
 *
 * For projects pointed at an existing, mature codebase. Skips the
 * Architect → requirements → clustering pipeline entirely. Instead:
 *
 * 1. Reads the repo file tree.
 * 2. Asks an LLM to group files into 8-15 logical Business Processes
 *    based on folder structure, file names, and tech-layer patterns.
 * 3. Creates Capability rows tagged source='brownfield_discovered'
 *    with last_execution.status='foundation_built' so they're treated
 *    as already-scaffolded — Cory's recommendations skew toward
 *    improve/verify/extend rather than build-from-scratch.
 * 4. Auto-links files per cap by layer (backend / frontend / agents / models).
 *
 * Net effect: a freshly-connected mature repo lands the user on a
 * Blueprint that reflects real existing work, with per-BP tasks that
 * make sense ("verify Customer Acquisition is at L3", not "build
 * Customer Acquisition from scratch").
 */
import OpenAI from 'openai';
import { Capability } from '../models';

interface DiscoveredCapability {
  name: string;
  description: string;
  key_files: string[];
  tech_layers: {
    backend: boolean;
    frontend: boolean;
    agents: boolean;
    models: boolean;
  };
}

interface DiscoveryResult {
  capabilities: DiscoveredCapability[];
}

export interface BrownfieldDiscoverySummary {
  capabilitiesCreated: number;
  capabilities: Array<{
    id: string;
    name: string;
    description: string;
    file_count: number;
    layers: { backend: number; frontend: number; agents: number; models: number };
  }>;
  totalFilesAnalyzed: number;
  detectedStack: string[];
}

const NOISE_PATHS = [
  /node_modules\//, /\.git\//, /dist\//, /build\//, /out\//, /\.next\//,
  /coverage\//, /\.cache\//, /\.vscode\//, /\.idea\//,
];

const NOISE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.gitignore',
  '.eslintrc', '.prettierrc', '.editorconfig', '.npmrc', '.nvmrc',
]);

function isInterestingFile(path: string): boolean {
  if (NOISE_PATHS.some(re => re.test(path))) return false;
  const name = (path.split('/').pop() || '').toLowerCase();
  if (NOISE_FILES.has(name)) return false;
  // Keep real source / config / doc files
  return /\.(ts|tsx|js|jsx|py|go|rs|java|sql|vue|svelte|md|json|yml|yaml|toml|html|css|prisma)$/i.test(name);
}

function detectStack(files: string[]): string[] {
  const stack: string[] = [];
  if (files.some(f => f.endsWith('package.json'))) stack.push('Node');
  if (files.some(f => /\.tsx?$/.test(f))) stack.push('TypeScript');
  if (files.some(f => /\.tsx$/.test(f) || /\/components?\//.test(f))) stack.push('React');
  if (files.some(f => /vite\.config/.test(f))) stack.push('Vite');
  if (files.some(f => /next\.config/.test(f))) stack.push('Next.js');
  if (files.some(f => /express/.test(f))) stack.push('Express');
  if (files.some(f => /\.py$/.test(f))) stack.push('Python');
  if (files.some(f => /requirements\.txt|pyproject\.toml/.test(f))) stack.push('Python');
  if (files.some(f => /fastapi/.test(f))) stack.push('FastAPI');
  if (files.some(f => /\.prisma$/.test(f))) stack.push('Prisma');
  if (files.some(f => /Sequelize|sequelize/.test(f))) stack.push('Sequelize');
  if (files.some(f => /Dockerfile/.test(f))) stack.push('Docker');
  if (files.some(f => /docker-compose/.test(f))) stack.push('Docker Compose');
  if (files.some(f => /\.go$/.test(f))) stack.push('Go');
  if (files.some(f => /\.rs$/.test(f))) stack.push('Rust');
  return [...new Set(stack)];
}

function classifyFile(path: string): 'backend' | 'frontend' | 'agent' | 'model' | 'other' {
  const lower = path.toLowerCase();
  const name = (path.split('/').pop() || '').toLowerCase();
  if (name.includes('agent') || lower.includes('/agents/') || lower.includes('/intelligence/')) return 'agent';
  if (name.endsWith('.tsx') || name.endsWith('.jsx')) return 'frontend';
  if (lower.includes('/component') || lower.includes('/page') || lower.includes('/frontend/') || lower.includes('/views/')) return 'frontend';
  if (lower.includes('/model') || lower.includes('/schema') || lower.includes('/entity') || lower.includes('/migration') || /\.prisma$/.test(lower)) return 'model';
  if (lower.includes('/service') || lower.includes('/route') || lower.includes('/controller') || lower.includes('/handler') || lower.includes('/api/') || lower.includes('/backend/')) return 'backend';
  if (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.py') || name.endsWith('.go') || name.endsWith('.rs')) return 'backend';
  return 'other';
}

/**
 * Build a compact, LLM-friendly summary of the repo file tree.
 *
 * For each top-level directory, lists the file count and a sample of
 * representative files. Plus the full list of folders 2 levels deep
 * (so the LLM can see feature boundaries like services/api/src/domains/auth/).
 *
 * Capped at ~15K chars to fit in a reasonable LLM context budget.
 */
function buildTreeSummary(files: string[]): string {
  const interesting = files.filter(isInterestingFile);
  // Group files by top-level dir
  const byDir: Record<string, string[]> = {};
  for (const f of interesting) {
    const parts = f.split('/');
    const top = parts.length > 1 ? parts[0] : '(root)';
    (byDir[top] = byDir[top] || []).push(f);
  }
  const dirs = Object.keys(byDir).sort();

  const lines: string[] = [];
  lines.push(`Total source files: ${interesting.length}`);
  lines.push(`Top-level dirs: ${dirs.join(', ')}`);
  lines.push('');

  for (const dir of dirs) {
    const dirFiles = byDir[dir];
    lines.push(`# ${dir}/  (${dirFiles.length} files)`);
    // Subdirectories 2 levels deep
    const subdirs = new Set<string>();
    for (const f of dirFiles) {
      const parts = f.split('/');
      if (parts.length >= 3) subdirs.add(parts.slice(0, 3).join('/'));
      else if (parts.length === 2) subdirs.add(parts.slice(0, 2).join('/'));
    }
    const sortedSubdirs = [...subdirs].sort();
    if (sortedSubdirs.length > 0 && sortedSubdirs.length <= 80) {
      lines.push('  Subpaths:');
      for (const s of sortedSubdirs.slice(0, 80)) lines.push(`    ${s}/`);
    }
    // Sample of representative files (route files, service files, page files)
    const representative = dirFiles.filter(f => /(routes?|services?|controllers?|handlers?|pages?|views?|components?|models?|agents?|schemas?)\//i.test(f));
    if (representative.length > 0) {
      lines.push('  Representative files:');
      for (const f of representative.slice(0, 60)) lines.push(`    ${f}`);
    }
    lines.push('');
  }

  let summary = lines.join('\n');
  if (summary.length > 15000) summary = summary.slice(0, 15000) + '\n[... truncated]';
  return summary;
}

/**
 * Run the LLM to identify capabilities from the file tree summary.
 */
async function identifyCapabilities(
  treeSummary: string,
  detectedStack: string[],
  totalFiles: number,
): Promise<DiscoveryResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 4000,
    messages: [
      {
        role: 'system',
        content: `You analyze existing codebases and identify the main Business Processes (capabilities) they implement. Given a file tree, group files into 8-20 logical capabilities. Each capability is a coherent feature or domain that could be developed, improved, or verified as a unit. Output ONLY strict JSON.`,
      },
      {
        role: 'user',
        content: `Analyze this existing codebase. ${totalFiles} source files across these layers: ${detectedStack.join(', ') || 'unknown'}.

FILE TREE:
${treeSummary}

Identify 8-20 logical Business Processes (BPs) that exist in this codebase. Each BP should:
- Have at least 2-3 related files (or be clearly a substantial single-file feature)
- Represent a recognizable user-facing or system-level feature
- Have a name that reads naturally in a sentence like "improve X" or "verify X"

PREFER capability-level groupings (e.g. "Lead Management", "Campaign Engine", "Project Setup Wizard") over file-level groupings (e.g. "leadRoutes.ts", "lead.service.ts").

CRITICAL: only include BPs you can identify from concrete files in the tree. Do NOT invent capabilities the codebase doesn't have. If you can't find 8, return fewer.

Output JSON:
{
  "capabilities": [
    {
      "name": "Capability Name",
      "description": "One sentence describing what this capability does in this specific codebase",
      "key_files": ["path/to/file1.ts", "path/to/file2.tsx"],
      "tech_layers": { "backend": true, "frontend": false, "agents": false, "models": true }
    }
  ]
}

Each capability should list 2-8 key files (the most representative ones — don't list every file, just the canonical ones a developer would touch). tech_layers booleans say which layers this capability touches.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    const caps = Array.isArray(parsed) ? parsed : (parsed.capabilities || parsed.data || []);
    return {
      capabilities: caps
        .filter((c: any) => c && c.name && Array.isArray(c.key_files))
        .map((c: any) => ({
          name: String(c.name || '').trim(),
          description: String(c.description || '').trim(),
          key_files: c.key_files.filter((f: any) => typeof f === 'string').slice(0, 12),
          tech_layers: {
            backend: !!(c.tech_layers?.backend),
            frontend: !!(c.tech_layers?.frontend),
            agents: !!(c.tech_layers?.agents),
            models: !!(c.tech_layers?.models),
          },
        })),
    };
  } catch (err) {
    console.warn('[Brownfield] LLM response parse failed:', (err as Error).message);
    return { capabilities: [] };
  }
}

/**
 * Main entry point. Discovers capabilities from a connected repo and
 * persists them as Capability rows on the project.
 */
export async function discoverBrownfieldCapabilities(
  enrollmentId: string,
  projectId: string,
): Promise<BrownfieldDiscoverySummary> {
  // Refresh the file tree from origin first
  const { syncFileTree, getFileTree, getConnection } = await import('./githubService');
  const connection = await getConnection(enrollmentId);
  if (!connection || !connection.repo_owner) {
    throw new Error('No GitHub repository connected. Connect a repo before running brownfield discovery.');
  }

  await syncFileTree(enrollmentId).catch(err => {
    console.warn('[Brownfield] file tree sync failed, using cached:', err.message);
  });

  const tree = await getFileTree(enrollmentId);
  if (!tree?.tree) {
    throw new Error('Could not read file tree from repo.');
  }

  const allFiles: string[] = tree.tree
    .filter((t: any) => t.type === 'blob')
    .map((t: any) => t.path);

  const detectedStack = detectStack(allFiles);
  const treeSummary = buildTreeSummary(allFiles);

  const discovery = await identifyCapabilities(treeSummary, detectedStack, allFiles.length);

  // Persist capabilities. For each, classify the key_files by layer
  // and stamp last_execution.status='foundation_built' so Cory's
  // fresh-project heuristic doesn't fire.
  const created: BrownfieldDiscoverySummary['capabilities'] = [];
  let sortOrder = 1000; // start high so brownfield caps sort below any future parsed ones

  for (const cap of discovery.capabilities) {
    if (!cap.name) continue;

    // Classify key files by layer + verify they exist in the tree
    const fileSet = new Set(allFiles.map(f => f.toLowerCase()));
    const validFiles = cap.key_files.filter(f => {
      const lower = f.toLowerCase();
      // Exact match OR suffix match (in case LLM returned a slightly different path)
      return fileSet.has(lower) || allFiles.some(rf => rf.toLowerCase().endsWith('/' + lower) || lower.endsWith('/' + rf.toLowerCase()));
    });

    const backend: string[] = [];
    const frontend: string[] = [];
    const agents: string[] = [];
    const models: string[] = [];
    for (const f of validFiles) {
      const layer = classifyFile(f);
      if (layer === 'backend') backend.push(f);
      else if (layer === 'frontend') frontend.push(f);
      else if (layer === 'agent') agents.push(f);
      else if (layer === 'model') models.push(f);
    }

    // Skip caps with no valid files at all
    if (validFiles.length === 0) {
      console.warn(`[Brownfield] Skipping cap "${cap.name}" — no key_files matched the tree`);
      continue;
    }

    // Avoid duplicates: don't create a cap with the same name that
    // already exists on this project (idempotent re-run friendly).
    const existing = await Capability.findOne({
      where: { project_id: projectId, name: cap.name },
    });
    if (existing) {
      console.log(`[Brownfield] Skipping cap "${cap.name}" — already exists`);
      continue;
    }

    const newCap = await Capability.create({
      project_id: projectId,
      name: cap.name,
      description: cap.description || `Discovered capability — ${cap.name}`,
      source: 'brownfield_discovered',
      sort_order: sortOrder++,
      applicability_status: 'active',
      user_status: 'in_progress',
      last_execution: {
        status: 'foundation_built',
        source: 'brownfield_discovery',
        appliedAt: new Date().toISOString(),
        completed_steps: ['brownfield_discovered'],
      },
      linked_backend_services: [...new Set([...backend, ...models])],
      linked_frontend_components: [...new Set(frontend)],
      linked_agents: [...new Set(agents)],
    } as any);

    created.push({
      id: (newCap as any).id,
      name: cap.name,
      description: cap.description,
      file_count: validFiles.length,
      layers: {
        backend: backend.length,
        frontend: frontend.length,
        agents: agents.length,
        models: models.length,
      },
    });
  }

  return {
    capabilitiesCreated: created.length,
    capabilities: created,
    totalFilesAnalyzed: allFiles.length,
    detectedStack,
  };
}
