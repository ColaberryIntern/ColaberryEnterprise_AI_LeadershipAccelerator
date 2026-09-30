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
import { getInstrumentedOpenAI } from './openaiInstrumented';
import { Capability } from '../models';
import { classifyAgentRoles, AgentRolesCachePayload } from './classifyAgentRoles';

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
  candidatesIdentified: number;
  pageBpsCreated: number;              // Page BPs created from frontend/src/pages/ scan
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
  const lower = path.toLowerCase();
  // Skip tests, fixtures, mocks, snapshots — they show up as candidates
  // and produce caps like "Adminroutestest", "Associationstest". Test
  // coverage is real but it's a quality signal per cap, not a cap.
  if (/\.(test|spec)\.(t|j)sx?$/.test(lower)) return false;
  if (/\/__tests__\//.test(lower) || /\/__mocks__\//.test(lower) || /\/__snapshots__\//.test(lower)) return false;
  if (/\/tests?\//.test(lower) && /\.(t|j)sx?$/.test(lower)) return false;
  if (/\/fixtures?\//.test(lower)) return false;
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

/**
 * Bucket a repo file into one of the cap-layer slots.
 *
 * Order of checks matters — frontend prefix is checked FIRST so
 * files under `frontend/src/services/` don't fall through to the
 * `/service` backend rule (the original bug: 2026-05-20 walk #4
 * surfaced `frontend/src/services/validationStore.ts` mis-bucketed
 * as backend because `/frontend/` substring check missed paths that
 * START with "frontend/" without a leading slash).
 *
 * All path checks now also match a leading prefix (no slash) so
 * GitHub-tree paths that are root-relative without leading "/"
 * still work.
 */
export function classifyFile(path: string): 'backend' | 'frontend' | 'agent' | 'model' | 'other' {
  const lower = path.toLowerCase();
  const name = (path.split('/').pop() || '').toLowerCase();

  // 1. Frontend FIRST — any file under frontend/ is frontend regardless
  //    of its name. Catches frontend/src/services/* which would otherwise
  //    match the backend /services rule below.
  if (lower.startsWith('frontend/') || lower.includes('/frontend/')) return 'frontend';
  if (name.endsWith('.tsx') || name.endsWith('.jsx')) return 'frontend';
  if (lower.includes('/components/') || lower.includes('/pages/') || lower.includes('/views/')) return 'frontend';

  // 2. Agent — files that explicitly live under agents/ or carry "agent"
  //    in their name. intelligence/ also routed here since most files
  //    there are LLM-bearing. 2026-05-22 (D1c): require code-file
  //    extension and reject test files so .md specs, .py scripts, and
  //    test files don't get confirmed as agents. Three prod junk rows
  //    (discovery_routes.py, discovery.test, impact-estimator-agent.md)
  //    came in through this path; the LLM attribution classifier wasn't
  //    catching them because they look plausibly agent-named.
  const isAgentCandidate = name.includes('agent')
    || lower.includes('/agents/') || lower.startsWith('agents/')
    || lower.includes('/intelligence/') || lower.startsWith('intelligence/');
  const isCodeFile = /\.(tsx?|jsx?)$/i.test(name);
  const isTestFile = /\.(test|spec)\.(t|j)sx?$/i.test(name);
  if (isAgentCandidate && isCodeFile && !isTestFile) return 'agent';

  // 3. Model
  if (lower.includes('/models/') || lower.includes('/schemas/') || lower.includes('/entities/') || lower.includes('/migrations/') || /\.prisma$/.test(lower)) return 'model';

  // 4. Backend — folder-anchored to avoid substring false positives
  //    ("validationStore" doesn't have /services/ in its parent path
  //    when the file lives at frontend/src/services/validationStore.ts —
  //    but that case is now caught by the frontend-first rule above).
  if (lower.includes('/services/') || lower.includes('/routes/') || lower.includes('/controllers/') || lower.includes('/handlers/') || lower.includes('/api/')) return 'backend';
  if (lower.startsWith('backend/') || lower.includes('/backend/')) return 'backend';

  // 5. Code-file fallback — any source file we couldn't bucket more
  //    specifically gets backend by default.
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
 * Read PROGRESS.md (if present) and return its full content.
 * Used both as additional domain context for the LLM AND as a
 * source of "what's already done" signals that feed evidence-
 * based completion percentages on discovered caps.
 */
async function loadProgressMd(enrollmentId: string, allFiles: string[]): Promise<string> {
  const { readFileFromRepo } = await import('./githubService');
  for (const path of ['PROGRESS.md', 'progress.md', 'Progress.md']) {
    if (allFiles.includes(path)) {
      const content = await readFileFromRepo(enrollmentId, path).catch(() => null);
      if (content && content.length > 100) return content;
    }
  }
  return '';
}

/**
 * Count how many times a capability's name (or its key word stems)
 * appears in PROGRESS.md text. Used as a "is this already
 * implemented?" signal — caps with many PROGRESS.md mentions had
 * real work shipped against them.
 */
function countProgressMentions(capName: string, progressMd: string): number {
  if (!progressMd) return 0;
  const lower = progressMd.toLowerCase();
  const stems = capName.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(s => s.length >= 4 && !['management', 'service', 'system', 'page', 'and', 'the', 'for'].includes(s));
  if (stems.length === 0) return 0;
  let mentions = 0;
  for (const stem of stems) {
    const matches = lower.match(new RegExp(`\\b${stem}\\b`, 'g'));
    if (matches) mentions += matches.length;
  }
  return mentions;
}

/**
 * Compute an evidence-based completion percentage for a brownfield-
 * discovered cap that has no requirements doc to measure against.
 *
 * Signals:
 *   - layers_covered (0-4): how many of backend/frontend/agents/models have linked files
 *   - file_count: total linked files
 *   - progress_md_mentions: how often this cap's name appears in PROGRESS.md
 *
 * Cap at 90% — we never claim 100% from heuristics alone. The user
 * has to explicitly mark a cap verified to push it to 100%.
 */
function computeEvidenceCompletion(layers: { backend: number; frontend: number; agents: number; models: number }, progressMentions: number): number {
  const layersCovered = Object.values(layers).filter(v => v > 0).length;
  const totalFiles = Object.values(layers).reduce((s, v) => s + v, 0);

  // Layer presence is the dominant signal.
  let pct = 0;
  if (layersCovered === 0) pct = 10;          // shouldn't happen but defensive
  else if (layersCovered === 1) pct = totalFiles >= 3 ? 45 : 30;
  else if (layersCovered === 2) pct = 60;
  else if (layersCovered === 3) pct = 75;
  else pct = 85;                              // 4 layers

  // PROGRESS.md mention bonus: each mention adds 2%, cap +15%.
  if (progressMentions > 0) {
    pct += Math.min(15, progressMentions * 2);
  }

  // File count bonus: large feature with 8+ linked files gets +5%.
  if (totalFiles >= 8) pct += 5;

  return Math.min(90, Math.max(15, pct));
}

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

// ---------------------------------------------------------------------------
// PHASE 3: Bucket clustering + two-pass LLM
// ---------------------------------------------------------------------------

interface CandidateBucket {
  key: string;                  // e.g. "services/api/domains" or "frontend/pages/admin"
  label: string;                // human-readable
  candidates: RawCandidate[];
  total_files: number;
}

/**
 * Cluster candidates into buckets by their canonical "home path" so
 * the LLM in pass 1 sees ~15-25 logical chunks instead of a flat list
 * of 1000+ stems. Bucket key: top-level dir + 1-2 levels of sub-folder
 * if recognizable (services/api/domains, frontend/pages/admin).
 */
function clusterCandidatesIntoBuckets(candidates: RawCandidate[]): CandidateBucket[] {
  const map = new Map<string, CandidateBucket>();

  for (const cand of candidates) {
    // Pick a representative file to derive the bucket key
    const sampleFile = cand.files[0] || '';
    const parts = sampleFile.toLowerCase().split('/');

    // Walk down to a meaningful bucket path
    let bucketKey = parts[0] || 'root';

    // Special-case well-known nested layouts
    if (parts.length >= 3) {
      // services/api/src/domains/auth/auth.routes.ts → services/api/domains/auth
      const idx = parts.indexOf('domains');
      if (idx >= 0 && idx + 1 < parts.length) {
        bucketKey = `${parts.slice(0, idx).join('/')}/domains/${parts[idx + 1]}`;
      } else if (parts[0] === 'frontend' && parts[1] === 'src' && parts[2] === 'pages' && parts.length >= 5) {
        // frontend/src/pages/admin/AdminPage.tsx → frontend/pages/admin
        bucketKey = `frontend/pages/${parts[3]}`;
      } else if (parts[0] === 'frontend' && parts[1] === 'src' && parts[2] === 'pages') {
        bucketKey = 'frontend/pages';
      } else if (parts[0] === 'backend' && parts[1] === 'src' && parts.length >= 4) {
        // backend/src/services/X.ts → backend/services
        bucketKey = `backend/${parts[2]}`;
      } else if (parts[0] === 'services' && parts.length >= 3) {
        bucketKey = `services/${parts[1]}`;
      }
    } else if (parts.length === 2) {
      bucketKey = `${parts[0]}/${parts[1].replace(/\.[^.]+$/, '')}`;
    }

    if (!map.has(bucketKey)) {
      map.set(bucketKey, { key: bucketKey, label: bucketKey, candidates: [], total_files: 0 });
    }
    const b = map.get(bucketKey)!;
    b.candidates.push(cand);
    b.total_files += cand.files.length;
  }

  // Merge tiny buckets (< 3 candidates) into a "misc" bucket per top-level dir
  const buckets = [...map.values()];
  const merged: Record<string, CandidateBucket> = {};
  for (const b of buckets) {
    if (b.candidates.length >= 3) {
      merged[b.key] = b;
    } else {
      // Find a parent bucket (same top-level dir) to merge into
      const top = b.key.split('/')[0];
      const parentKey = `${top}/_misc`;
      if (!merged[parentKey]) {
        merged[parentKey] = { key: parentKey, label: `${top} (other)`, candidates: [], total_files: 0 };
      }
      merged[parentKey].candidates.push(...b.candidates);
      merged[parentKey].total_files += b.total_files;
    }
  }

  return Object.values(merged).sort((a, b) => b.candidates.length - a.candidates.length);
}

interface DomainGroup {
  name: string;          // "Lead Pipeline" or "Authentication & Identity"
  description: string;
  bucket_keys: string[];
}

interface DomainPass1Result {
  domains: DomainGroup[];
}

/**
 * Pass 1: ask the LLM to identify the 8-15 top-level domains in the
 * project, mapping each to one or more candidate buckets.
 */
async function identifyDomains(
  buckets: CandidateBucket[],
  domainContext: string,
  detectedStack: string[],
  totalFiles: number,
): Promise<DomainPass1Result> {
  const openai = getInstrumentedOpenAI({ workflow_id: 'brownfield' });

  const bucketsBlock = buckets.map(b => {
    const sampleStems = b.candidates.slice(0, 8).map(c => c.display_name).join(', ');
    return `- ${b.key} — ${b.candidates.length} candidates, ${b.total_files} files. Examples: ${sampleStems}`;
  }).join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 3000,
    messages: [
      {
        role: 'system',
        content: `You are organizing an existing codebase. Identify 8-15 top-level domains (functional areas) and map the supplied candidate buckets to them. Use the project's own domain language. Output JSON only.`,
      },
      {
        role: 'user',
        content: `PROJECT: ${totalFiles} files, stack: ${detectedStack.join(', ') || 'unknown'}.

DOMAIN CONTEXT (use this language for domain names):
${domainContext || '(no domain docs found)'}

CANDIDATE BUCKETS (each bucket groups candidates by their home path):
${bucketsBlock}

Identify 8-15 TOP-LEVEL DOMAINS in this codebase. Each domain bundles 1-N buckets. A domain is a coherent functional area (e.g. "Lead Pipeline", "Authentication", "Cory Orchestration", "Marketing Site").

Output strict JSON:
{
  "domains": [
    {
      "name": "Domain Name (using project's own terms)",
      "description": "1-sentence description of what this domain covers in this codebase",
      "bucket_keys": ["bucket1/key", "bucket2/key"]
    }
  ]
}

Rules:
- Output 8-15 domains. Don't merge unrelated areas.
- Every bucket should appear in at least one domain (cover the whole tree).
- A bucket can appear in multiple domains if it spans them.
- Domain names should reflect actual functionality, not generic SaaS labels.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    const domains = Array.isArray(parsed) ? parsed : (parsed.domains || []);
    return {
      domains: domains
        .filter((d: any) => d && d.name && Array.isArray(d.bucket_keys))
        .map((d: any) => ({
          name: String(d.name || '').trim(),
          description: String(d.description || '').trim(),
          bucket_keys: d.bucket_keys.filter((k: any) => typeof k === 'string'),
        })),
    };
  } catch (err) {
    console.warn('[Brownfield] Pass 1 (domains) parse failed:', (err as Error).message);
    return { domains: [] };
  }
}

/**
 * Pass 2: for one domain, enumerate 2-7 capabilities within it.
 * Runs per-domain in parallel.
 */
async function enumerateCapabilitiesForDomain(
  domain: DomainGroup,
  candidates: RawCandidate[],
  domainContext: string,
): Promise<DiscoveredCapability[]> {
  const openai = getInstrumentedOpenAI({ workflow_id: 'brownfield' });

  const candidatesBlock = candidates.map(c => {
    const hits = Object.entries(c.layer_hits)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    const sample = c.files.slice(0, 5).join(', ');
    return `- "${c.display_name}" (stem=${c.stem}) [${hits}] e.g. ${sample}`;
  }).join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2500,
    messages: [
      {
        role: 'system',
        content: `Enumerate the capabilities within a single domain of an existing codebase. Be exhaustive — output 2-7 distinct capabilities per domain, even if some only have 2-3 files. Use project's own domain language. JSON only.`,
      },
      {
        role: 'user',
        content: `DOMAIN: ${domain.name}
${domain.description}

DOMAIN CONTEXT (use this language):
${domainContext.substring(0, 5000)}

CANDIDATES IN THIS DOMAIN:
${candidatesBlock}

Output 2-7 capabilities within this domain. Each is a coherent feature you can develop or improve as a unit. Don't roll multiple distinct features into one cap just to keep the count low.

Output strict JSON:
{
  "capabilities": [
    {
      "name": "Specific Capability Name",
      "description": "1-2 sentences specific to what this does in THIS codebase",
      "key_files": ["path/to/file1.ts", "path/to/file2.tsx"],
      "tech_layers": { "backend": true, "frontend": false, "agents": false, "models": true }
    }
  ]
}

Each capability needs 2-10 key_files (the canonical ones). Don't invent files — only use ones from the candidate list above.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    const caps = Array.isArray(parsed) ? parsed : (parsed.capabilities || []);
    return caps
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
      }));
  } catch (err) {
    console.warn(`[Brownfield] Pass 2 (${domain.name}) parse failed:`, (err as Error).message);
    return [];
  }
}

/**
 * Two-pass discovery: domains first, then capabilities per-domain in parallel.
 * Returns the merged + de-duplicated capability list.
 */
async function twoPassDiscovery(
  candidates: RawCandidate[],
  domainContext: string,
  detectedStack: string[],
  totalFiles: number,
): Promise<DiscoveryResult> {
  const buckets = clusterCandidatesIntoBuckets(candidates);
  console.log(`[Brownfield] Clustered into ${buckets.length} candidate buckets`);

  const pass1 = await identifyDomains(buckets, domainContext, detectedStack, totalFiles);
  console.log(`[Brownfield] Pass 1 identified ${pass1.domains.length} domains`);

  if (pass1.domains.length === 0) {
    return { capabilities: [] };
  }

  const bucketMap = new Map(buckets.map(b => [b.key, b]));

  // Run pass 2 per domain in parallel
  const domainResults = await Promise.all(
    pass1.domains.map(async (domain) => {
      const domainCandidates: RawCandidate[] = [];
      const seen = new Set<string>();
      for (const key of domain.bucket_keys) {
        const bucket = bucketMap.get(key);
        if (!bucket) continue;
        for (const c of bucket.candidates) {
          if (seen.has(c.stem)) continue;
          seen.add(c.stem);
          domainCandidates.push(c);
        }
      }
      if (domainCandidates.length === 0) return [];
      return enumerateCapabilitiesForDomain(domain, domainCandidates, domainContext);
    })
  );

  const allCaps = domainResults.flat();
  console.log(`[Brownfield] Pass 2 produced ${allCaps.length} raw capabilities across all domains`);

  // De-dup by name (case-insensitive)
  const byName = new Map<string, DiscoveredCapability>();
  for (const cap of allCaps) {
    const key = cap.name.toLowerCase().trim();
    if (!byName.has(key)) byName.set(key, cap);
    else {
      // Merge key_files into existing
      const existing = byName.get(key)!;
      existing.key_files = [...new Set([...existing.key_files, ...cap.key_files])];
    }
  }

  return { capabilities: [...byName.values()] };
}

async function identifyCapabilities(
  candidates: RawCandidate[],
  treeSummary: string,
  domainContext: string,
  detectedStack: string[],
  totalFiles: number,
): Promise<DiscoveryResult> {
  const openai = getInstrumentedOpenAI({ workflow_id: 'brownfield' });

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

/**
 * Bulk-fetch agent file contents via GitHub API for role classification
 * at scan time (Tier-3 A+E 2026-05-20). Bounded by MAX_FILES_PER_CAP
 * downstream; here we just fetch every unique path requested. Best-
 * effort — paths that fail to fetch get null and downstream
 * classification falls back to filename-only inference.
 */
async function fetchAgentContents(
  enrollmentId: string,
  agentPaths: ReadonlyArray<string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (agentPaths.length === 0) return out;
  const { readFileFromRepo } = await import('./githubService');
  const contents = await Promise.all(
    agentPaths.map(p => readFileFromRepo(enrollmentId, p).catch(() => null)),
  );
  for (let i = 0; i < agentPaths.length; i++) {
    out.set(agentPaths[i], contents[i]);
  }
  return out;
}

/**
 * Classify agent roles for a cap's linked_agents and return the
 * persistable payload. Used by both brownfield create + merge paths.
 * Returns null when there are no agent files to classify.
 */
async function buildAgentRolesCache(
  enrollmentId: string,
  agentPaths: ReadonlyArray<string>,
): Promise<AgentRolesCachePayload | null> {
  const supported = agentPaths.filter(p => /\.(ts|tsx|js|jsx)$/.test(p));
  if (supported.length === 0) return null;
  const contents = await fetchAgentContents(enrollmentId, supported);
  return classifyAgentRoles(supported, contents);
}

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

  // Step 2: load domain context + PROGRESS.md
  const domainContext = await loadDomainContext(enrollmentId, allFiles);
  const progressMd = await loadProgressMd(enrollmentId, allFiles);
  console.log(`[Brownfield] Domain context: ${domainContext.length} chars; PROGRESS.md: ${progressMd.length} chars`);

  // Step 3: Two-pass LLM (domains → capabilities)
  const discovery = await twoPassDiscovery(
    candidates,
    domainContext,
    detectedStack,
    allFiles.length,
  );
  console.log(`[Brownfield] Two-pass returned ${discovery.capabilities.length} consolidated capabilities`);

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

    // 2026-05-21: phantom-creation gate. Agent attribution alone is the
    // noisiest brownfield signal — caps like "Discovery" or "Validation"
    // pick up 8+ agent files via keyword stems that don't actually serve
    // them. If a candidate has only agent-layer evidence and zero backend
    // / frontend / model files, refuse to create the cap. The LLM
    // attribution classifier would just reject them all and you'd end up
    // with phantom rows anyway. Operator can manually create the cap if
    // needed.
    if (backend.length === 0 && frontend.length === 0 && models.length === 0 && agents.length > 0) {
      console.warn(`[Brownfield] Skipping cap "${cap.name}" — only agent-layer attribution (${agents.length} files), no backend/frontend/model files. Likely keyword over-attribution.`);
      continue;
    }

    const existing = await Capability.findOne({
      where: { project_id: projectId, name: cap.name },
    });
    if (existing) {
      // Merge newly-discovered files into the existing cap's linked_* arrays
      // instead of skipping. The original "skip" caused caps to be permanently
      // stuck with whatever files the first scan found — re-runs couldn't
      // pick up backend services that landed later. Surfaced 2026-05-18 when
      // the queue surfaced "Build backend for Marketing Dashboard" even
      // though adminMarketingController etc. existed in the repo.
      //
      // Size guard (2026-05-20 walk #5+#6 finding): refuse merges that
      // would push a cap above MAX_FILES_PER_CAP_LINKED. Over multiple
      // runs the LLM consolidation pass kept assigning unrelated files
      // (e.g., 35 openclaw/* files) to "Content Generation for
      // Marketing" and merging accumulated them into 38-file lumps.
      // The cap is now hard-capped at 25 files; once full, new files
      // get a warning logged and the operator should split the cap
      // (the queue's triage description surfaces oversized caps with
      // a "consider splitting" note).
      const MAX_FILES_PER_CAP_LINKED = 25;
      const existingTotal = (existing.linked_backend_services || []).length
        + (existing.linked_frontend_components || []).length
        + (existing.linked_agents || []).length;
      const incomingTotal = backend.length + models.length + frontend.length + agents.length;
      if (existingTotal >= MAX_FILES_PER_CAP_LINKED && incomingTotal > 0) {
        console.warn(`[Brownfield] Cap "${cap.name}" already at ${existingTotal} files (>= ${MAX_FILES_PER_CAP_LINKED} max). Refusing to merge ${incomingTotal} new files — split this cap to absorb them.`);
        continue;
      }
      const mergedBackend = Array.from(new Set([...(existing.linked_backend_services || []), ...backend, ...models]));
      const mergedFrontend = Array.from(new Set([...(existing.linked_frontend_components || []), ...frontend]));
      const mergedAgents = Array.from(new Set([...(existing.linked_agents || []), ...agents]));

      const backendGained = mergedBackend.length - (existing.linked_backend_services || []).length;
      const frontendGained = mergedFrontend.length - (existing.linked_frontend_components || []).length;
      const agentsGained = mergedAgents.length - (existing.linked_agents || []).length;

      if (backendGained === 0 && frontendGained === 0 && agentsGained === 0) {
        console.log(`[Brownfield] Cap "${cap.name}" already up to date — no new files to merge`);
        continue;
      }

      existing.linked_backend_services = mergedBackend;
      existing.linked_frontend_components = mergedFrontend;
      existing.linked_agents = mergedAgents;

      // Tier-3 A+E (2026-05-20): re-classify agent roles when the
      // agent set actually changed. Persisting at scan time means
      // the engine refresh doesn't need to hit GitHub per refresh.
      if (agentsGained > 0 || !(existing as any).agent_roles_cache) {
        const roleCache = await buildAgentRolesCache(enrollmentId, mergedAgents);
        if (roleCache) (existing as any).agent_roles_cache = roleCache;
      }
      await existing.save();

      console.log(
        `[Brownfield] Updated cap "${cap.name}": +${backendGained} backend, +${frontendGained} frontend, +${agentsGained} agents`
      );
      continue;
    }

    // Compute evidence-based completion %. Brownfield caps don't have
    // requirements to measure against, so we infer from layer coverage,
    // total file count, and PROGRESS.md mentions of the cap's name.
    const layerCounts = {
      backend: backend.length,
      frontend: frontend.length,
      agents: agents.length,
      models: models.length,
    };
    const progressMentions = countProgressMentions(cap.name, progressMd);
    const evidenceCompletionPct = computeEvidenceCompletion(layerCounts, progressMentions);

    // Tier-3 A+E: classify agent roles at scan time, persist with the
    // cap. Engine refresh reads from this column instead of hitting
    // GitHub per refresh.
    const linkedAgents = [...new Set(agents)];
    const roleCache = await buildAgentRolesCache(enrollmentId, linkedAgents);

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
        evidence_completion_pct: evidenceCompletionPct,
        progress_md_mentions: progressMentions,
      },
      linked_backend_services: [...new Set([...backend, ...models])],
      linked_frontend_components: [...new Set(frontend)],
      linked_agents: linkedAgents,
      agent_roles_cache: roleCache,
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

  // Step 4: auto-create Page BPs for any frontend pages not already
  // covered by a discovered cap's frontend_route. Each becomes a
  // first-class Page BP with its own visual review surface.
  let pageBpsCreated = 0;
  try {
    const { processOrphanedPages } = await import('./frontendPageDiscovery');
    const pageResult = await processOrphanedPages({ projectId, fileTree: allFiles });
    pageBpsCreated = pageResult.created_bps;
    console.log(`[Brownfield] Page BP scan: ${pageResult.total_pages} pages, ${pageResult.mapped_pages} mapped, ${pageResult.created_bps} new Page BPs`);
  } catch (err: any) {
    console.warn('[Brownfield] Page BP scan failed:', err?.message);
  }

  // Step 5a (2026-05-26): import-graph auto-attribution. Walks the agent
  // universe and matches each file's relative imports against caps'
  // linked_backend_services. Writes high-confidence (score >= 3) pairs
  // to capability_agent_maps as 'auto-import-graph-2026-05-26'. Runs
  // BEFORE the LLM classifier so deterministic evidence lands first.
  // No-ops cleanly when the local filesystem has no overlap with the
  // project's caps (typical for customer projects whose agents live in
  // a connected GitHub repo, not on this filesystem). Non-fatal.
  try {
    const { runImportGraphAttribution } = await import('./importGraphAttributionService');
    const ig = await runImportGraphAttribution(projectId);
    console.log(`[Brownfield] Import-graph attribution: ${ig.scanned} scanned, ${ig.suggestionsConsidered} suggestions, ${ig.autoAttached} new + ${ig.reactivated} reactivated + ${ig.alreadyActive} already-active (below threshold: ${ig.belowThreshold})`);
  } catch (err: any) {
    console.warn('[Brownfield] Import-graph attribution failed (non-fatal):', err?.message);
  }

  // Step 5b (2026-05-20): LLM agent-attribution classification. The
  // brownfield scan attributes agent files to caps by keyword name
  // match (linked_agents), which over-fires across caps with
  // overlapping name stems. The classifier asks gpt-4o-mini to confirm
  // each (cap, agent) pair and writes confirmed rows to
  // capability_agent_maps. The A pillar reads from that map, not
  // from linked_agents. Runs after every discovery refresh so new
  // projects get authoritative attribution out of the box.
  try {
    const { classifyProjectAgentAttribution } = await import('./agentAttributionClassifier');
    const cls = await classifyProjectAgentAttribution(enrollmentId, projectId);
    console.log(`[Brownfield] Agent attribution: ${cls.caps_scanned} caps scanned, ${cls.confirmed} confirmed, ${cls.uncertain} uncertain, ${cls.rejected} rejected (${cls.pairs_cache_hit} cache hits)`);
  } catch (err: any) {
    console.warn('[Brownfield] Agent attribution classifier failed (non-fatal):', err?.message);
  }

  return {
    capabilitiesCreated: created.length,
    capabilities: created,
    totalFilesAnalyzed: allFiles.length,
    detectedStack,
    candidatesIdentified: candidates.length,
    pageBpsCreated,
  };
}
