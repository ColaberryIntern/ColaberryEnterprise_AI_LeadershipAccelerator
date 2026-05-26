/**
 * agentImportAttributor — D3 of the agent-discovery rebuild.
 *
 * Walks an agent's TypeScript imports and matches them against capabilities'
 * `linked_backend_services` arrays. If `RevenueOptimizationAgent.ts` imports
 * `revenueDashboardService.ts`, and that file is listed on the "Revenue
 * Dashboard" capability, that's strong evidence the agent serves that cap.
 *
 * Designed to run alongside D1 (LLM attribution), D2 (declared metadata).
 * The ingester (`scripts/ingestImportAttributedAgents.js`) skips agents
 * that already have an active `capability_agent_maps` row, so this only
 * fills the gap.
 *
 * Pure functions only — no DB access in this file. The ingester wires the
 * functions here to Sequelize.
 *
 * v1 limitations (documented; not blockers):
 *  - Doesn't follow re-exports (`export * from './foo'`) or barrel files
 *  - Doesn't resolve tsconfig `paths` aliases (none currently used)
 *  - Doesn't handle dynamic `await import('./foo')`
 *  - Regex-based, not TS AST — fast and good enough for ~150 files
 */
import * as fs from 'fs';
import * as path from 'path';

// ───────────────────────────────────────────────────────────────────────────
// 1. extractImports — pull relative import specs out of a file's source.
// ───────────────────────────────────────────────────────────────────────────

// ESM import forms:
//   import X from './foo'
//   import { a, b } from './foo'
//   import './foo'        (side-effect)
//   import type X from './foo'
const ESM_IMPORT_RE = /import\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g;
// CJS require: const x = require('./foo')
const CJS_REQUIRE_RE = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

/**
 * Extract internal (relative) import specs from a file. Third-party specs
 * (no leading `.` or `/`) are dropped. Returns the raw spec strings — the
 * caller resolves them to filesystem paths via `resolveImport`.
 */
export function extractImports(filePath: string): string[] {
  let src: string;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const re of [ESM_IMPORT_RE, CJS_REQUIRE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const spec = m[1];
      // Only internal — relative or absolute filesystem paths.
      if (spec.startsWith('.') || spec.startsWith('/')) {
        out.push(spec);
      }
    }
  }
  return Array.from(new Set(out));
}

// ───────────────────────────────────────────────────────────────────────────
// 2. resolveImport — normalize a relative spec to source-path form
//    (`backend/src/...`) so it can be matched against `linked_backend_services`.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Normalize a compiled/absolute container path back to source-tree form.
 * The container's compiled JS lives under `/app/dist/`; the cap files are
 * stored as `backend/src/...` paths. Maps both directions to source form.
 */
export function toSourcePath(p: string): string {
  let out = p.replace(/\\/g, '/');
  // Strip absolute container prefix
  out = out.replace(/^\/+app\//, '');
  // dist/... → backend/src/...
  if (out.startsWith('dist/')) out = 'backend/src/' + out.slice('dist/'.length);
  // .js / .jsx → .ts / .tsx (linked files use the source extension)
  out = out.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
  return out;
}

/**
 * Resolve a relative import spec against a from-file. Returns the resolved
 * source-tree path (e.g. `backend/src/config/database.ts`), or null if the
 * spec is not resolvable (absolute path that escapes the tree, etc.).
 */
export function resolveImport(fromFile: string, importSpec: string): string | null {
  if (!importSpec.startsWith('.')) return null;
  const fromSource = toSourcePath(fromFile);
  const fromDir = path.posix.dirname(fromSource);
  let resolved = path.posix.normalize(path.posix.join(fromDir, importSpec));
  // path.posix.normalize on Windows still uses `/` — but double-check.
  resolved = resolved.replace(/\\/g, '/');
  // If the spec didn't include an extension, default to .ts (source form).
  if (!/\.(ts|tsx|js|jsx)$/.test(resolved)) resolved += '.ts';
  // Normalize compiled extensions to source.
  resolved = resolved.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
  return resolved;
}

// ───────────────────────────────────────────────────────────────────────────
// 3. attributeAgent — score (cap, evidence) attributions for one agent file.
// ───────────────────────────────────────────────────────────────────────────

export interface AttributionMatch {
  readonly capId: string;
  readonly capName: string;
  readonly score: number;
  readonly evidence: string[];        // resolved import paths that matched
  readonly nameStemBoost: boolean;    // true when an imported file's stem matches the agent's stem
}

/** Strip common suffix words off a basename (without extension), lowercase. */
function nameStem(basenameNoExt: string): string {
  const SUFFIXES = /(?:Agent|Service|Routes?|Controller|Handler|Provider|Engine|Orchestrator|Store|Client|Adapter|Broker|Sync|Parser|Generator|Builder|Manager|Worker)$/;
  return basenameNoExt.replace(SUFFIXES, '').toLowerCase();
}

function basenameNoExt(p: string): string {
  return (path.posix.basename(p.replace(/\\/g, '/')) || '').replace(/\.(tsx?|jsx?)$/i, '');
}

/**
 * Given one agent file and the project's capability file map, return zero
 * or more (cap, score) attributions.
 *
 * Scoring (v1):
 *   +1.0 per matched import (capped at 5 to dampen mega-importing agents)
 *   +1.0 if the imported file's name stem matches the agent's name stem
 *        (the "this service IS the thing the agent operates on" signal)
 *
 * Threshold default (applied by the ingester): score >= 2.0. Configurable
 * via the ingester's MIN_SCORE env var.
 */
export function attributeAgent(
  agentFilePath: string,
  capFileMap: ReadonlyMap<string, ReadonlyArray<{ capId: string; capName: string }>>,
): AttributionMatch[] {
  const agentSourcePath = toSourcePath(agentFilePath);
  const agentStem = nameStem(basenameNoExt(agentSourcePath));
  if (!agentStem) return [];

  const specs = extractImports(agentFilePath);
  if (specs.length === 0) return [];

  // Aggregate: capId → { capName, matches: string[], stemBoost: boolean }
  const acc = new Map<string, { capName: string; matches: string[]; stemBoost: boolean }>();

  for (const spec of specs) {
    const resolved = resolveImport(agentSourcePath, spec);
    if (!resolved) continue;
    const hits = capFileMap.get(resolved) || [];
    for (const { capId, capName } of hits) {
      let entry = acc.get(capId);
      if (!entry) {
        entry = { capName, matches: [], stemBoost: false };
        acc.set(capId, entry);
      }
      entry.matches.push(resolved);
      // Stem boost: imported file's name stem matches the agent's
      const importStem = nameStem(basenameNoExt(resolved));
      if (importStem && importStem === agentStem) entry.stemBoost = true;
    }
  }

  const out: AttributionMatch[] = [];
  for (const [capId, e] of acc.entries()) {
    const matchScore = Math.min(e.matches.length, 5);   // cap at 5
    const boostScore = e.stemBoost ? 1 : 0;
    const score = matchScore + boostScore;
    out.push({
      capId,
      capName: e.capName,
      score,
      evidence: e.matches,
      nameStemBoost: e.stemBoost,
    });
  }
  // Sort: highest score first, then by evidence count.
  out.sort((a, b) => (b.score - a.score) || (b.evidence.length - a.evidence.length));
  return out;
}
