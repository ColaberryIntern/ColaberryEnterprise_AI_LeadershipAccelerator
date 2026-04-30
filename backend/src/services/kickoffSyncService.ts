/**
 * Kickoff Sync Service
 *
 * Handles the project-wide validation report the user pastes back from
 * the Kickoff prompt. Unlike the per-BP validation flow (which scopes
 * a single capability), this service fans the report's evidence out
 * across every capability whose name, description, or expected file
 * paths match the work the report claims.
 *
 * Inputs:
 *   - reportText (Claude Code's structured output)
 *   - commitSha  (extracted from the report's "Commit:" line, optional)
 * Side effects:
 *   - Refreshes the GitHub file tree (so we can verify file claims)
 *   - For each matched capability:
 *       - Marks all its requirements as verified
 *       - Links files by layer (backend / frontend / agent / models)
 *       - Stamps last_execution.validation_report with phase + commit
 *   - Stores a project-level kickoff record on the project
 * Returns:
 *   - per-capability deltas + project-wide summary
 */
import { Op } from 'sequelize';
import { Capability, RequirementsMap } from '../models';
import type { ParsedReport } from './validationReportParser';

interface CapabilityDelta {
  id: string;
  name: string;
  matched: boolean;
  matchScore: number;          // 0..1 — how confidently the report covered this cap
  matchedBy: string[];         // ["name:auth", "files:services/api/src/domains/auth"]
  filesLinked: number;
  requirementsVerified: number;
  requirementsTotal: number;
}

export interface KickoffSyncResult {
  commitSha: string | null;
  filesClaimedTotal: number;
  filesVerifiedInRepo: number;     // claimed AND present in repo tree
  filesMissingFromRepo: string[];  // claimed but not in repo
  phasesShipped: number;
  phasesPartial: number;
  phasesDeferred: number;
  capabilitiesAdvanced: number;
  capabilityDeltas: CapabilityDelta[];
}

const STOPWORDS = new Set([
  'and', 'or', 'the', 'of', 'a', 'an', 'for', 'to', 'in', 'on',
  'system', 'service', 'page', 'pages', 'feature', 'module', 'domain',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function normalizeForPath(text: string): string[] {
  // Generate path-style variants of a name so we can match against repo paths.
  // "Role Management" → ["role-management", "rolemanagement", "roles", "role"]
  const lower = text.toLowerCase().trim();
  const variants = new Set<string>();
  variants.add(lower.replace(/\s+/g, '-'));
  variants.add(lower.replace(/\s+/g, '_'));
  variants.add(lower.replace(/\s+/g, ''));
  for (const w of lower.split(/\s+/)) if (w.length >= 3) variants.add(w);
  // Common pluralizations: "Role Management" → "roles"
  for (const v of [...variants]) {
    if (!v.endsWith('s')) variants.add(v + 's');
  }
  return [...variants];
}

/**
 * Score how strongly a capability is implicated by the report.
 *
 * Signals:
 *   - capability name appears in a "Capabilities advanced" claim line
 *   - capability name (or path-variants) appears in any file path the report claims
 *   - capability name (or path-variants) appears in any phase description
 *   - capability name appears in repo files that match the report's claimed files
 *
 * Returns a score 0..1 and the list of signals that contributed.
 */
function scoreCapabilityMatch(
  capName: string,
  capDescription: string | null,
  report: ParsedReport,
  reportFilesLower: string[],
): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  const nameVariants = normalizeForPath(capName);
  const descTokens = capDescription ? tokenize(capDescription) : [];

  // Signal 1: explicit capability claim
  for (const claim of report.capabilityClaims) {
    const claimVariants = normalizeForPath(claim.name);
    if (claimVariants.some(v => nameVariants.includes(v)) ||
        nameVariants.some(v => claimVariants.includes(v))) {
      score += 0.6;
      signals.push(`claim:${claim.name}`);
      break;
    }
  }

  // Signal 2: capability name in any reported file path
  let pathHits = 0;
  for (const f of reportFilesLower) {
    for (const v of nameVariants) {
      if (v.length < 4) continue; // ignore short tokens to avoid noise
      if (f.includes(v)) {
        pathHits++;
        break;
      }
    }
  }
  if (pathHits > 0) {
    score += Math.min(0.4, 0.1 + pathHits * 0.05);
    signals.push(`paths:${pathHits}`);
  }

  // Signal 3: phase body or directive list mentions the cap
  const phaseText = report.phases.map(p => p.body).join(' ').toLowerCase();
  const hitToken = descTokens.find(t => phaseText.includes(t)) ||
    nameVariants.find(v => v.length >= 4 && phaseText.includes(v));
  if (hitToken) {
    score += 0.15;
    signals.push(`phase:${hitToken}`);
  }

  return { score: Math.min(1, score), signals };
}

function classifyFile(f: string): 'backend' | 'frontend' | 'agent' | 'model' | 'other' {
  const lower = f.toLowerCase();
  const name = (f.split('/').pop() || '').toLowerCase();
  if (name.includes('agent') || lower.includes('/agents/') || lower.includes('/intelligence/')) return 'agent';
  if (name.endsWith('.tsx') || name.endsWith('.jsx') || lower.includes('/component') || lower.includes('/page') || lower.includes('/frontend/')) return 'frontend';
  if (lower.includes('/model') || lower.includes('/schema') || lower.includes('/entity') || lower.includes('/migration') || lower.includes('prisma')) return 'model';
  if (lower.includes('/service') || lower.includes('/route') || lower.includes('/controller') || lower.includes('/handler') || lower.includes('/api/') || lower.includes('/backend/')) return 'backend';
  if (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.py')) return 'backend';
  return 'other';
}

export async function applyKickoffReport(
  projectId: string,
  enrollmentId: string,
  report: ParsedReport,
): Promise<KickoffSyncResult> {
  const allClaimedFiles = [...report.filesCreated, ...report.filesModified];
  const claimedFilesLower = allClaimedFiles.map(f => f.toLowerCase());

  // Refresh the repo so file presence can be verified. Best-effort —
  // failures shouldn't block the sync (the report itself is evidence).
  let repoFiles: string[] = [];
  try {
    const { syncFileTree, getFileTree } = await import('./githubService');
    await syncFileTree(enrollmentId).catch(() => { /* ignore — fall back to cached tree */ });
    const tree = await getFileTree(enrollmentId);
    if (tree?.tree) {
      repoFiles = tree.tree.filter((t: any) => t.type === 'blob').map((t: any) => t.path);
    }
  } catch { /* repo refresh optional */ }
  const repoFilesLower = repoFiles.map(f => f.toLowerCase());
  const repoFileSet = new Set(repoFilesLower);

  // Verify which claimed files actually exist in the repo. We compare on
  // suffix matches because reports often use repo-relative paths and the
  // file tree returns the same — but trailing prose or dashes can
  // confuse exact matching, so allow includes-fallback.
  const filesMissingFromRepo: string[] = [];
  let filesVerifiedInRepo = 0;
  for (const f of allClaimedFiles) {
    const fl = f.toLowerCase();
    if (repoFileSet.has(fl) || repoFilesLower.some(rf => rf.endsWith('/' + fl) || fl.endsWith('/' + rf))) {
      filesVerifiedInRepo++;
    } else {
      filesMissingFromRepo.push(f);
    }
  }

  // Load every capability for this project. We score each one against
  // the report and apply updates to those above a confidence threshold.
  const caps = await Capability.findAll({ where: { project_id: projectId } });

  const deltas: CapabilityDelta[] = [];
  let advanced = 0;

  for (const cap of caps) {
    const capAny = cap as any;
    const capName: string = capAny.name || '';
    const capDesc: string | null = capAny.description || null;
    if (!capName || capName.toLowerCase().includes('uncategorized')) {
      // Skip the synthetic Uncategorized bucket — it shouldn't claim credit
      // for the foundation work; it's a holding pen for orphan requirements.
      deltas.push({ id: capAny.id, name: capName, matched: false, matchScore: 0, matchedBy: [], filesLinked: 0, requirementsVerified: 0, requirementsTotal: 0 });
      continue;
    }

    const { score, signals } = scoreCapabilityMatch(capName, capDesc, report, claimedFilesLower);
    const matched = score >= 0.25; // tunable threshold

    if (!matched) {
      const reqCount = await RequirementsMap.count({ where: { project_id: projectId, capability_id: capAny.id } });
      deltas.push({ id: capAny.id, name: capName, matched: false, matchScore: score, matchedBy: signals, filesLinked: 0, requirementsVerified: 0, requirementsTotal: reqCount });
      continue;
    }

    // Pick relevant files for this capability: any claimed file whose path
    // contains a name-variant of the capability. Then classify by layer.
    const nameVariants = normalizeForPath(capName).filter(v => v.length >= 4);
    const relevantFiles = allClaimedFiles.filter(f => {
      const fl = f.toLowerCase();
      return nameVariants.some(v => fl.includes(v));
    });
    // If no name-matched files, fall back to layer-balanced subset of claims
    // so the cap still gets evidence linked.
    const filesToLink = relevantFiles.length > 0 ? relevantFiles : allClaimedFiles.slice(0, 8);

    const backend: string[] = [];
    const frontend: string[] = [];
    const agents: string[] = [];
    const models: string[] = [];
    for (const f of filesToLink) {
      const layer = classifyFile(f);
      if (layer === 'backend') backend.push(f);
      else if (layer === 'frontend') frontend.push(f);
      else if (layer === 'agent') agents.push(f);
      else if (layer === 'model') models.push(f);
    }

    // Mark requirements as verified
    const reqs = await RequirementsMap.findAll({ where: { project_id: projectId, capability_id: capAny.id } });
    let verified = 0;
    for (const req of reqs) {
      const r = req as any;
      if (r.verified_by === 'manual') continue;
      r.status = 'verified';
      const reqText = (r.requirement_text || r.requirement_key || '').toLowerCase();
      const isUI = /\b(ui|page|component|display|layout|form|button|screen|view)\b/.test(reqText);
      const isAgent = /\b(agent|automat|monitor|schedule|autonomous|intelligence)\b/.test(reqText);
      const isData = /\b(model|database|table|schema|migration|persist|store)\b/.test(reqText);
      const layered = isUI && frontend.length ? frontend
        : isAgent && agents.length ? agents
        : isData && models.length ? models
        : backend.length ? backend
        : filesToLink;
      r.github_file_paths = layered.slice(0, 5);
      r.confidence_score = 1.0;
      r.verified_by = 'kickoff_sync';
      await r.save();
      verified++;
    }

    // Stamp last_execution + accumulate linked files
    const prevExec = capAny.last_execution || {};
    const prevBackend = capAny.linked_backend_services || [];
    const prevFrontend = capAny.linked_frontend_components || [];
    const prevAgents = capAny.linked_agents || [];
    capAny.linked_backend_services = [...new Set([...prevBackend, ...backend, ...models])];
    capAny.linked_frontend_components = [...new Set([...prevFrontend, ...frontend])];
    capAny.linked_agents = [...new Set([...prevAgents, ...agents])];
    capAny.last_execution = {
      ...prevExec,
      validation_report: {
        ...(prevExec.validation_report || {}),
        source: 'kickoff_sync',
        commitSha: report.commitSha || null,
        appliedAt: new Date().toISOString(),
        matchScore: score,
        matchedBy: signals,
        filesLinked: { backend, frontend, agents, models },
        requirementsVerified: verified,
      },
      status: 'complete',
      completed_steps: [...new Set([...(prevExec.completed_steps || []), 'kickoff_sync_applied'])],
    };
    capAny.changed('last_execution', true);
    capAny.changed('linked_backend_services', true);
    capAny.changed('linked_frontend_components', true);
    capAny.changed('linked_agents', true);
    await cap.save();

    advanced++;
    deltas.push({
      id: capAny.id,
      name: capName,
      matched: true,
      matchScore: score,
      matchedBy: signals,
      filesLinked: backend.length + frontend.length + agents.length + models.length,
      requirementsVerified: verified,
      requirementsTotal: reqs.length,
    });
  }

  return {
    commitSha: report.commitSha,
    filesClaimedTotal: allClaimedFiles.length,
    filesVerifiedInRepo,
    filesMissingFromRepo,
    phasesShipped: report.phases.filter(p => p.status === 'complete').length,
    phasesPartial: report.phases.filter(p => p.status === 'partial').length,
    phasesDeferred: report.phases.filter(p => p.status === 'deferred').length,
    capabilitiesAdvanced: advanced,
    capabilityDeltas: deltas,
  };
}
