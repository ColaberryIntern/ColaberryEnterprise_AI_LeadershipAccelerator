/**
 * Brownfield Discovery Service (Phase 2)
 *
 * Three-stage pipeline:
 *
 *   1. Deterministic candidate extraction from the file tree.
 *      Rules-based scan that groups files by name stem (leadRoutes.ts +
 *      leadService.ts + Lead.ts → one "lead" candidate). Produces 50-100
 *      raw candidates the LLM doesn't have to discover from scratch.
 *
 *   2. Domain context loading.
 *      Reads CLAUDE.md, README.md, package.json description, and up to
 *      5 files from directives/. Gives the LLM the project's actual
 *      domain language so it names capabilities like "Cory Orchestrator"
 *      instead of "Intelligence Operations".
 *
 *   3. LLM consolidation pass.
 *      Sends candidates + domain context + tree summary, asks for 20-40
 *      named capabilities. The LLM's job is naming + grouping siblings,
 *      not exhaustive enumeration. Uses gpt-4o-mini with 60K-char context.
 *
 * Net effect: capability count rises from ~8 (single-shot) to 25-35 for
 * mature codebases, with names that match how the team actually talks
 * about the system.
 */
import OpenAI from 'openai';
import { Capability } from '../models';

interface RawCandidate {
  stem: string;                        // normalized name stem (e.g. "lead")
  display_name: string;                // titlecased, hyphen-aware
  files: string[];                     // all files matching this stem
  layer_hits: {
    backend: number;
    frontend: number;
    agent: number;
    model: number;
    page: number;
  };
  signals: string[];                   // ["routes", "services", "models"]
}

interface DiscoveredCapability {
  name: string;
  description: string;
  key_files: string[];
  tech_layers: { backend: boolean; frontend: boolean; agents: boolean; models: boolean };
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
  candidatesIdentified: number;        // new: how many raw candidates were found
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

const NOISE_PATHS = [
  /node_modules\//, /\.git\//, /dist\//, /build\//, /out\//, /\.next\//,
  /coverage\//, /\.cache\//, /\.vscode\//, /\.idea\//, /__pycache__\//,
];

const NOISE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.gitignore',
  '.eslintrc', '.prettierrc', '.editorconfig', '.npmrc', '.nvmrc',
]);

// Files whose stem is generic infrastructure, not a feature
const NOISE_STEMS = new Set([
  'index', 'types', 'schema', 'schemas', 'helpers', 'helper', 'utils', 'util',
  'common', 'base', 'config', 'constants', 'errors', 'logger', 'env', 'app',
  'server', 'main', 'db', 'database', 'models', 'middleware', 'middlewares',
  'router', 'routes', 'service', 'services', 'controller', 'controllers',
  'agent', 'agents', 'page', 'pages', 'view', 'views', 'component',
  'components', 'shared', 'global', 'styles', 'style', 'theme',
]);

function isInterestingFile(path: string): boolean {
  if (NOISE_PATHS.some(re => re.test(path))) return false;
  const name = (path.split('/').pop() || '').toLowerCase();
  if (NOISE_FILES.has(name)) return false;
  return /\.(ts|tsx|js|jsx|py|go|rs|java|sql|vue|svelte|md|json|yml|yaml|toml|html|css|prisma)$/i.test(name);
}

function detectStack(files: string[]): string[] {
  const stack: string[] = [];
  if (files.some(f => f.endsWith('package.json'))) stack.push('Node');
  if (files.some(f => /\.tsx?$/.test(f))) stack.push('TypeScript');
  if (files.some(f => /\.tsx$/.test(f))) stack.push('React');
  if (files.some(f => /vite\.config/.test(f))) stack.push('Vite');
  if (files.some(f => /next\.config/.test(f))) stack.push('Next.js');
  if (files.some(f => /\.py$/.test(f))) stack.push('Python');
  if (files.some(f => /requirements\.txt|pyproject\.toml/.test(f))) stack.push('Python');
  if (files.some(f => /fastapi/.test(f))) stack.push('FastAPI');
  if (files.some(f => /\.prisma$/.test(f))) stack.push('Prisma');
  if (files.some(f => /Sequelize|sequelize/i.test(f))) stack.push('Sequelize');
  if (files.some(f => /Dockerfile/.test(f))) stack.push('Docker');
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

// ---------------------------------------------------------------------------
// STEP 1: Deterministic candidate extraction
// ---------------------------------------------------------------------------

/**
 * Extract a name stem from a file path using folder + suffix conventions.
 * Returns null if the file is generic infrastructure (index.ts, helpers.ts).
 */
function extractStem(file: string): { stem: string; signal: string } | null {
  const path = file.toLowerCase();
  const name = (file.split('/').pop() || '');
  const nameLower = name.toLowerCase();
  const nameNoExt = nameLower.replace(/\.(tsx?|jsx?|py|go|rs)$/, '');

  if (NOISE_STEMS.has(nameNoExt)) return null;
  if (nameNoExt.length < 2) return null;

  // domains/<X>/... or features/<X>/... or modules/<X>/...
  const domainMatch = path.match(/\/(?:domains?|features?|modules?)\/([a-z0-9][a-z0-9-_]*)\//);
  if (domainMatch) return { stem: normalizeStem(domainMatch[1]), signal: 'domain' };

  // services/<X>Service.ts or services/<X>.ts
  const serviceMatch = nameLower.match(/^([a-z][a-z0-9-_]*?)(service|routes?|router|controller|handler|provider|engine|orchestrator|agent|store|client|adapter|broker|sync|parser|generator|builder|manager)\.(tsx?|jsx?|py|go)$/);
  if (serviceMatch) {
    const stem = normalizeStem(serviceMatch[1]);
    if (stem.length >= 2 && !NOISE_STEMS.has(stem)) {
      return { stem, signal: serviceMatch[2] };
    }
  }

  // Path-based: if file is under services/, routes/, controllers/ etc., use the filename
  if (/\/(services?|routes?|controllers?|handlers?|agents?|providers?|engines?|orchestrators?)\//.test(path)) {
    const stem = nameNoExt.replace(/(service|routes?|controller|handler|agent|provider|engine|orchestrator)$/, '');
    if (stem.length >= 2 && !NOISE_STEMS.has(stem)) {
      return { stem: normalizeStem(stem), signal: 'service-folder' };
    }
  }

  // models/<Name>.ts (excluding indexes)
  if (path.includes('/models/') && /\.(ts|js|py)$/.test(nameLower)) {
    const stem = nameNoExt;
    if (!NOISE_STEMS.has(stem) && stem.length >= 2) {
      return { stem: normalizeStem(stem), signal: 'model' };
    }
  }

  // pages/<Name>.tsx
  if (path.includes('/pages/') && /\.(tsx?|jsx?)$/.test(nameLower)) {
    const stem = nameNoExt.replace(/(page|view|screen)$/, '');
    if (stem.length >= 3 && !NOISE_STEMS.has(stem)) {
      return { stem: normalizeStem(stem), signal: 'page' };
    }
  }

  // intelligence/<X>/ or intelligence/agents/<X>.ts
  const intelligenceMatch = path.match(/\/intelligence\/(?:agents\/)?([a-z0-9][a-z0-9-_]*)\.?/);
  if (intelligenceMatch) {
    const stem = normalizeStem(intelligenceMatch[1].replace(/agent$/, ''));
    if (stem.length >= 2 && !NOISE_STEMS.has(stem)) {
      return { stem, signal: 'intelligence' };
    }
  }

  return null;
}

function normalizeStem(s: string): string {
  return s.toLowerCase()
    .replace(/[-_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

function prettifyStem(stem: string): string {
  return stem.split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Group files by name stem to produce raw capability candidates.
 * Filters out single-file candidates whose stem matches generic infra.
 */
function extractCandidates(allFiles: string[]): RawCandidate[] {
  const interesting = allFiles.filter(isInterestingFile);
  const map = new Map<string, RawCandidate>();

  for (const file of interesting) {
    const result = extractStem(file);
    if (!result) continue;
    const { stem, signal } = result;

    if (!map.has(stem)) {
      map.set(stem, {
        stem,
        display_name: prettifyStem(stem),
        files: [],
        layer_hits: { backend: 0, frontend: 0, agent: 0, model: 0, page: 0 },
        signals: [],
      });
    }
    const c = map.get(stem)!;
    c.files.push(file);
    const layer = classifyFile(file);
    if (layer in c.layer_hits) (c.layer_hits as any)[layer]++;
    if (signal === 'page') c.layer_hits.page++;
    if (!c.signals.includes(signal)) c.signals.push(signal);
  }

  // Sort: candidates with multi-layer evidence first, then by file count
  return [...map.values()]
    .filter(c => c.files.length >= 1)
    .sort((a, b) => {
      const aLayers = Object.values(a.layer_hits).filter(v => v > 0).length;
      const bLayers = Object.values(b.layer_hits).filter(v => v > 0).length;
      if (aLayers !== bLayers) return bLayers - aLayers;
      return b.files.length - a.files.length;
    });
}

// ---------------------------------------------------------------------------
// STEP 2: Domain context loading
// ---------------------------------------------------------------------------

/**
 * Read CLAUDE.md, README.md, package.json description, and up to 5
 * directives/*.md files. Caps total at ~15K chars so the LLM has
 * domain language without burning all the context budget.
 */
async function loadDomainContext(enrollmentId: string, allFiles: string[]): Promise<string> {
  const { readFileFromRepo } = await import('./githubService');
  const sections: string[] = [];

  // Top-level docs
  for (const path of ['CLAUDE.md', 'claude.md', 'README.md', 'readme.md']) {
    if (sections.length >= 2) break; // CLAUDE.md OR README.md, both fine
    if (allFiles.includes(path)) {
      const content = await readFileFromRepo(enrollmentId, path).catch(() => null);
      if (content && content.length > 100) {
        sections.push(`# From ${path}:\n${content.substring(0, 4000).trim()}`);
      }
    }
  }

  // package.json description
  if (allFiles.includes('package.json')) {
    const pkgRaw = await readFileFromRepo(enrollmentId, 'package.json').catch(() => null);
    if (pkgRaw) {
      try {
        const pkg = JSON.parse(pkgRaw);
        const bits: string[] = [];
        if (pkg.name) bits.push(`name: ${pkg.name}`);
        if (pkg.description) bits.push(`description: ${pkg.description}`);
        if (pkg.workspaces) bits.push(`workspaces: ${JSON.stringify(pkg.workspaces)}`);
        if (bits.length > 0) sections.push(`# package.json metadata:\n${bits.join('\n')}`);
      } catch { /* ignore parse errors */ }
    }
  }

  // directives/*.md (up to 5, prefer top-level ones)
  const directiveFiles = allFiles
    .filter(f => /^directives\/.*\.md$/i.test(f) && !/readme/i.test(f))
    .slice(0, 5);
  for (const path of directiveFiles) {
    const content = await readFileFromRepo(enrollmentId, path).catch(() => null);
    if (content && content.length > 50) {
      sections.push(`# From ${path}:\n${content.substring(0, 1500).trim()}`);
    }
  }

  let combined = sections.join('\n\n---\n\n');
  if (combined.length > 15000) combined = combined.substring(0, 15000) + '\n[... domain context truncated]';
  return combined;
}

// ---------------------------------------------------------------------------
// Tree summary (richer — 60K cap)
// ---------------------------------------------------------------------------

function buildTreeSummary(files: string[]): string {
  const interesting = files.filter(isInterestingFile);
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
    const subdirs = new Set<string>();
    for (const f of dirFiles) {
      const parts = f.split('/');
      if (parts.length >= 3) subdirs.add(parts.slice(0, 3).join('/'));
      else if (parts.length === 2) subdirs.add(parts.slice(0, 2).join('/'));
    }
    const sortedSubdirs = [...subdirs].sort();
    if (sortedSubdirs.length > 0 && sortedSubdirs.length <= 200) {
      lines.push('  Subpaths:');
      for (const s of sortedSubdirs.slice(0, 200)) lines.push(`    ${s}/`);
    }
    const representative = dirFiles.filter(f => /(routes?|services?|controllers?|handlers?|pages?|views?|components?|models?|agents?|orchestrator|engine)/i.test(f));
    if (representative.length > 0) {
      lines.push('  Representative files:');
      for (const f of representative.slice(0, 150)) lines.push(`    ${f}`);
    }
    lines.push('');
  }

  let summary = lines.join('\n');
  if (summary.length > 60000) summary = summary.slice(0, 60000) + '\n[... tree truncated]';
  return summary;
}

// ---------------------------------------------------------------------------
// STEP 3: LLM consolidation pass
// ---------------------------------------------------------------------------

function buildCandidatesBlock(candidates: RawCandidate[]): string {
  const lines: string[] = [];
  for (const c of candidates) {
    const hits = Object.entries(c.layer_hits)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    const sample = c.files.slice(0, 4).join(', ');
    lines.push(`- "${c.display_name}" (stem=${c.stem}) — ${c.files.length} files [${hits}] e.g. ${sample}`);
  }
  let block = lines.join('\n');
  if (block.length > 30000) block = block.substring(0, 30000) + '\n[... candidates truncated]';
  return block;
}

async function identifyCapabilities(
  candidates: RawCandidate[],
  treeSummary: string,
  domainContext: string,
  detectedStack: string[],
  totalFiles: number,
): Promise<DiscoveryResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const candidatesBlock = buildCandidatesBlock(candidates);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 8000,
    messages: [
      {
        role: 'system',
        content: `You are organizing an existing codebase into named Business Processes (capabilities). Your inputs:
1. A pre-extracted candidate list (each candidate is a name stem with the files matching it).
2. The project's domain documentation (CLAUDE.md, directives, README) — use this language for naming.
3. A file tree summary for additional context.

YOUR JOB: consolidate the candidates into 20-40 capabilities. Group obvious siblings (e.g. several auth-related candidates → "Authentication"). Use the project's actual domain language for names — never generic labels.

OUTPUT: strict JSON only.`,
      },
      {
        role: 'user',
        content: `PROJECT: ${totalFiles} files, stack: ${detectedStack.join(', ') || 'unknown'}.

DOMAIN CONTEXT (use this language for capability names — these are the project's own terms):
=================================================================
${domainContext || '(no CLAUDE.md / README found — use generic but specific names from file paths)'}
=================================================================

PRE-EXTRACTED CAPABILITY CANDIDATES (${candidates.length} candidates from rule-based stem grouping — your job is to consolidate, name, and describe these):
${candidatesBlock}

FILE TREE SUMMARY:
${treeSummary}

INSTRUCTIONS:
- Output 20-40 named capabilities. Aim for the high end — under-grouping is worse than over-grouping.
- Each capability groups 1-N candidates from the list above. You can:
  * Use a candidate as-is if its files are already a coherent feature.
  * Merge multiple candidates into one capability if they're siblings (e.g. "leadRoutes + leadService + Lead model" → "Lead Pipeline").
  * Split a candidate if its files actually represent separate features.
- Use the DOMAIN CONTEXT above for names. If the project calls it "Cory Orchestrator", don't name it "Intelligence Operations".
- Each capability should have 2-12 key_files (the canonical ones a developer would touch).
- Description: 1-2 sentences GROUNDED in what the files do — not generic SaaS speak.
- Skip obvious infrastructure (db setup, logger, error handlers, types). Focus on FEATURES.

Output JSON:
{
  "capabilities": [
    {
      "name": "Capability Name (using project's own terms)",
      "description": "Specific 1-2 sentence description of what this does in this codebase.",
      "key_files": ["path/to/file1.ts", "path/to/file2.tsx"],
      "tech_layers": { "backend": true, "frontend": false, "agents": false, "models": true }
    }
  ]
}`,
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
            backend: !!c.tech_layers?.backend,
            frontend: !!c.tech_layers?.frontend,
            agents: !!c.tech_layers?.agents,
            models: !!c.tech_layers?.models,
          },
        })),
    };
  } catch (err) {
    console.warn('[Brownfield] LLM response parse failed:', (err as Error).message);
    return { capabilities: [] };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function discoverBrownfieldCapabilities(
  enrollmentId: string,
  projectId: string,
): Promise<BrownfieldDiscoverySummary> {
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

  // Step 1: deterministic candidate extraction
  const candidates = extractCandidates(allFiles);
  console.log(`[Brownfield] Extracted ${candidates.length} raw candidates`);

  // Step 2: load domain context
  const domainContext = await loadDomainContext(enrollmentId, allFiles);
  console.log(`[Brownfield] Domain context: ${domainContext.length} chars`);

  // Step 3: LLM consolidation
  const treeSummary = buildTreeSummary(allFiles);
  const discovery = await identifyCapabilities(
    candidates,
    treeSummary,
    domainContext,
    detectedStack,
    allFiles.length,
  );
  console.log(`[Brownfield] LLM returned ${discovery.capabilities.length} consolidated capabilities`);

  // Persist
  const created: BrownfieldDiscoverySummary['capabilities'] = [];
  let sortOrder = 1000;

  const fileSet = new Set(allFiles.map(f => f.toLowerCase()));

  for (const cap of discovery.capabilities) {
    if (!cap.name) continue;

    const validFiles = cap.key_files.filter(f => {
      const lower = f.toLowerCase();
      return fileSet.has(lower) || allFiles.some(rf => rf.toLowerCase().endsWith('/' + lower) || lower.endsWith('/' + rf.toLowerCase()));
    });

    if (validFiles.length === 0) {
      console.warn(`[Brownfield] Skipping cap "${cap.name}" — no key_files matched the tree`);
      continue;
    }

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
    candidatesIdentified: candidates.length,
  };
}
