/**
 * agentOrphanService — surface untagged-and-unmapped agent files so an
 * operator can adopt them (attach to a capability) one at a time.
 *
 * "Orphan" = an agent file (basename contains "agent" or path contains an
 * agents/ directory) that has NEITHER:
 *   (a) a SERVES_CAPABILITY export (D2's declarative metadata convention)
 *   (b) an active row in `capability_agent_maps` for the target project
 *
 * For each orphan we run D3's import-graph attributor against the project's
 * `linked_backend_services` to surface suggested caps (with score + evidence).
 * If no import-graph signal exists, the operator picks a cap from the full
 * list on the UI side. Adoption writes a `capability_agent_maps` row tagged
 * `linked_by='orphan-adoption-2026-05-26'`.
 *
 * Source detection: agents are walked from /app/dist when inside the prod
 * container, backend/src locally (same env-detection pattern as the D2/D3
 * ingester scripts). The service does NOT modify source files — adoption is
 * a DB-only write. (Adding SERVES_CAPABILITY constants to source on adoption
 * would require a PR flow; out of scope for v1.)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';
import {
  attributeAgent,
  toSourcePath,
  type AttributionMatch,
} from '../intelligence/graph/agentImportAttributor';

const SCAN_ROOT_DEFAULT = fs.existsSync('dist') ? 'dist' : 'backend/src';

export interface OrphanAgent {
  /** Source-path form (e.g. `backend/src/intelligence/agents/Foo.ts`). */
  readonly sourcePath: string;
  /** Basename without extension (matches `capability_agent_maps.agent_name`). */
  readonly agentName: string;
  /** Top D3 import-graph suggestions, score-descending. May be empty. */
  readonly suggestions: ReadonlyArray<{
    readonly capId: string;
    readonly capName: string;
    readonly score: number;
    readonly evidence: ReadonlyArray<string>;
    readonly nameStemBoost: boolean;
  }>;
}

export interface OrphanListResult {
  readonly projectId: string;
  readonly scannedCount: number;
  readonly skippedDeclared: number;
  readonly skippedAlreadyMapped: number;
  readonly orphans: ReadonlyArray<OrphanAgent>;
}

interface CapRow { id: string; name: string; linked_backend_services: string[] | null; }
interface MapRow { capability_id: string; agent_name: string; }

function walkAgentFiles(root: string, out: string[] = []): string[] {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '__tests__', '__mocks__', '__snapshots__', 'tests'].includes(e.name)) continue;
      walkAgentFiles(p, out);
    } else if (
      /\.(ts|tsx|js|jsx)$/i.test(e.name)
      && !/\.(test|spec)\.(t|j)sx?$/i.test(e.name)
      && !/\.d\.ts$/i.test(e.name)
      && !/^index\.(t|j)sx?$/i.test(e.name)
    ) {
      const lower = p.replace(/\\/g, '/').toLowerCase();
      const inAgentsDir = lower.includes('/agents/');
      const nameHasAgent = e.name.toLowerCase().includes('agent');
      if (inAgentsDir || nameHasAgent) out.push(p);
    }
  }
  return out;
}

function hasDeclaredCapability(filePath: string): boolean {
  try {
    const src = fs.readFileSync(filePath, 'utf8');
    return /^[ \t]*(?:export\s+const\s+|exports\.)SERVES_CAPABILIT(?:Y|IES)\s*(?::[^=]+)?\s*=/m.test(src);
  } catch { return false; }
}

function agentNameFromFile(filePath: string): string {
  return path.basename(filePath).replace(/\.(tsx?|jsx?)$/i, '');
}

/**
 * List orphan agents for a project. Pure-ish: filesystem walk + one DB query
 * for caps + one DB query for existing maps. Suggestions come from D3's
 * attributor (no LLM call, no extra cost).
 */
export async function listOrphanAgents(projectId: string, scanRoot = SCAN_ROOT_DEFAULT): Promise<OrphanListResult> {
  const caps = await sequelize.query<CapRow>(
    'SELECT id, name, linked_backend_services FROM capabilities WHERE project_id = :pid',
    { replacements: { pid: projectId }, type: QueryTypes.SELECT },
  );

  // Build the cap file map D3 expects: Map<sourcePath, [{capId, capName}]>
  const capFileMap = new Map<string, Array<{ capId: string; capName: string }>>();
  for (const c of caps) {
    const files = Array.isArray(c.linked_backend_services) ? c.linked_backend_services : [];
    for (const raw of files) {
      const normalized = toSourcePath(String(raw));
      let arr = capFileMap.get(normalized);
      if (!arr) { arr = []; capFileMap.set(normalized, arr); }
      arr.push({ capId: c.id, capName: c.name });
    }
  }

  // Existing active maps for the project — to skip already-mapped agents.
  const existing = await sequelize.query<MapRow>(
    `SELECT cam.capability_id, cam.agent_name
     FROM capability_agent_maps cam
     JOIN capabilities c ON c.id = cam.capability_id
     WHERE c.project_id = :pid AND cam.status = 'active'`,
    { replacements: { pid: projectId }, type: QueryTypes.SELECT },
  );
  const agentsAlreadyMapped = new Set(existing.map(r => r.agent_name));

  const files = walkAgentFiles(scanRoot);

  let skippedDeclared = 0;
  let skippedAlreadyMapped = 0;
  const orphans: OrphanAgent[] = [];

  for (const f of files) {
    if (hasDeclaredCapability(f)) { skippedDeclared++; continue; }
    const agentName = agentNameFromFile(f);
    if (agentsAlreadyMapped.has(agentName)) { skippedAlreadyMapped++; continue; }
    const matches: AttributionMatch[] = attributeAgent(f, capFileMap);
    orphans.push({
      sourcePath: toSourcePath(f),
      agentName,
      // Cap suggestions: keep top 5 to control payload size.
      suggestions: matches.slice(0, 5).map(m => ({
        capId: m.capId,
        capName: m.capName,
        score: m.score,
        evidence: m.evidence,
        nameStemBoost: m.nameStemBoost,
      })),
    });
  }

  // Sort: orphans with high-confidence suggestions first (helps operator
  // burn through the easy wins), then alphabetically.
  orphans.sort((a, b) => {
    const sa = a.suggestions[0]?.score || 0;
    const sb = b.suggestions[0]?.score || 0;
    if (sb !== sa) return sb - sa;
    return a.agentName.localeCompare(b.agentName);
  });

  return {
    projectId,
    scannedCount: files.length,
    skippedDeclared,
    skippedAlreadyMapped,
    orphans,
  };
}

// ─── Per-cap suggestion lookup (used by the BP detail UI for Plan C) ──────

// Lightweight in-memory cache keyed on projectId. Walking the agent universe
// + running D3 per file is ~500ms-1s; without the cache, every BP-detail open
// would pay that. 5 min TTL is long enough to feel fast, short enough that
// new agent files show up promptly during active development.
const ORPHAN_CACHE = new Map<string, { stamp: number; result: OrphanListResult }>();
const ORPHAN_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateOrphanCache(projectId: string): void {
  ORPHAN_CACHE.delete(projectId);
}

async function getCachedOrphans(projectId: string): Promise<OrphanListResult> {
  const entry = ORPHAN_CACHE.get(projectId);
  if (entry && (Date.now() - entry.stamp) < ORPHAN_CACHE_TTL_MS) return entry.result;
  const fresh = await listOrphanAgents(projectId);
  ORPHAN_CACHE.set(projectId, { stamp: Date.now(), result: fresh });
  return fresh;
}

export interface CapSuggestion {
  readonly agentName: string;
  readonly sourcePath: string;
  readonly score: number;
  readonly evidence: ReadonlyArray<string>;
  readonly nameStemBoost: boolean;
}

/**
 * Suggestions for ONE capability — agents that look like they belong here
 * by import-graph evidence. Returns unmapped agents whose D3 suggestions
 * include this cap, ranked by score. Used by the BP detail UI to show
 * "agents we think might belong to this BP" inline.
 */
export async function listAgentSuggestionsForCap(
  projectId: string,
  capId: string,
): Promise<CapSuggestion[]> {
  const all = await getCachedOrphans(projectId);
  const out: CapSuggestion[] = [];
  for (const o of all.orphans) {
    const match = o.suggestions.find(s => s.capId === capId);
    if (!match) continue;
    out.push({
      agentName: o.agentName,
      sourcePath: o.sourcePath,
      score: match.score,
      evidence: match.evidence,
      nameStemBoost: match.nameStemBoost,
    });
  }
  out.sort((a, b) => (b.score - a.score) || a.agentName.localeCompare(b.agentName));
  return out;
}

export interface AdoptOrphanInput {
  readonly projectId: string;
  readonly agentName: string;
  readonly capabilityId: string;
  readonly role?: 'executor' | 'monitor' | 'classifier' | 'orchestrator' | null;
  readonly adoptedBy: string;  // email or admin id for audit trail
}

export interface AdoptOrphanResult {
  readonly action: 'inserted' | 'reactivated' | 'already_active';
  readonly mapId: string;
}

/**
 * Adopt one orphan: upsert a `capability_agent_maps` row tagged
 * `linked_by='orphan-adoption-2026-05-26+<who>'`. Idempotent: re-adopting
 * the same (cap, agent) flips back to active without duplicating tags.
 *
 * Validates the capability belongs to the project (defense-in-depth: even
 * though the route auth gates by admin, we don't want a typo'd capabilityId
 * to attach a Colaberry-project map to a customer cap).
 */
export async function adoptOrphan(input: AdoptOrphanInput): Promise<AdoptOrphanResult> {
  // 1. Verify cap belongs to project.
  const capOk = await sequelize.query<{ id: string }>(
    'SELECT id FROM capabilities WHERE id = :cid AND project_id = :pid LIMIT 1',
    { replacements: { cid: input.capabilityId, pid: input.projectId }, type: QueryTypes.SELECT },
  );
  if (capOk.length === 0) {
    throw new Error(`Capability ${input.capabilityId} not found in project ${input.projectId}`);
  }

  const tagBase = 'orphan-adoption-2026-05-26';
  const tag = input.adoptedBy ? `${tagBase}:${input.adoptedBy}` : tagBase;

  // 2. Upsert.
  const existRow = await sequelize.query<{ id: string; status: string; linked_by: string | null }>(
    `SELECT id, status, linked_by FROM capability_agent_maps
     WHERE capability_id = :cid AND agent_name = :name LIMIT 1`,
    { replacements: { cid: input.capabilityId, name: input.agentName }, type: QueryTypes.SELECT },
  );

  if (existRow.length === 0) {
    const newId = crypto.randomUUID();
    await sequelize.query(
      `INSERT INTO capability_agent_maps
       (id, capability_id, agent_name, role, status, linked_by, linked_at, created_at, updated_at)
       VALUES (:id, :cid, :name, :role, 'active', :tag, NOW(), NOW(), NOW())`,
      { replacements: { id: newId, cid: input.capabilityId, name: input.agentName, role: input.role ?? null, tag }, type: QueryTypes.INSERT },
    );
    return { action: 'inserted', mapId: newId };
  }

  const e = existRow[0];
  const wasActive = e.status === 'active';
  const nextLinkedBy = (e.linked_by || '').includes(tagBase)
    ? e.linked_by || ''
    : `${e.linked_by || ''}${e.linked_by ? '+' : ''}${tag}`;
  await sequelize.query(
    `UPDATE capability_agent_maps
     SET status = 'active', unlinked_at = NULL, linked_at = NOW(),
         linked_by = :lb, role = COALESCE(:role, role), updated_at = NOW()
     WHERE id = :id`,
    { replacements: { id: e.id, lb: nextLinkedBy, role: input.role ?? null }, type: QueryTypes.UPDATE },
  );
  return { action: wasActive ? 'already_active' : 'reactivated', mapId: e.id };
}
