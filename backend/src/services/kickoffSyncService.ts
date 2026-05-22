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
  // 2026-05-22 (D1c): agent layer requires a code-file extension and rejects
  // test files; mirrors the tightening in brownfieldDiscoveryService.ts.
  const isAgentCandidate = name.includes('agent') || lower.includes('/agents/') || lower.includes('/intelligence/');
  const isCodeFile = /\.(tsx?|jsx?)$/i.test(name);
  const isTestFile = /\.(test|spec)\.(t|j)sx?$/i.test(name);
  if (isAgentCandidate && isCodeFile && !isTestFile) return 'agent';
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
    // contains a name-variant of the capability. **Strict** — no fallback
    // to "first 8 of all claimed files". Linking unrelated files makes
    // u.frontend / u.backend lie about layer presence and lights up
    // filters (Frontend, Backend, Agents) for capabilities that don't
    // actually have that layer. Better to link nothing than to pollute.
    const nameVariants = normalizeForPath(capName).filter(v => v.length >= 4);
    const relevantFiles = allClaimedFiles.filter(f => {
      const fl = f.toLowerCase();
      return nameVariants.some(v => fl.includes(v));
    });

    const backend: string[] = [];
    const frontend: string[] = [];
    const agents: string[] = [];
    const models: string[] = [];
    for (const f of relevantFiles) {
      const layer = classifyFile(f);
      if (layer === 'backend') backend.push(f);
      else if (layer === 'frontend') frontend.push(f);
      else if (layer === 'agent') agents.push(f);
      else if (layer === 'model') models.push(f);
    }

    // Foundation work is scaffolding, NOT requirement-level evidence.
    // Don't change req.status at all. Coverage = matched/total counts
    // both 'matched' and 'verified', so any bump there inflates
    // completion to 100% when only a foundation exists.
    //
    // Instead, just attach hint files to requirements (without
    // changing status) so the per-BP build flow has a head start
    // when the user runs that capability's prompt later. The
    // requirement still shows 'unmatched' until per-BP validation
    // explicitly verifies it.
    //
    // We still snapshot github_file_paths so the reset endpoint can
    // unlink the kickoff's hint files cleanly.
    const reqs = await RequirementsMap.findAll({ where: { project_id: projectId, capability_id: capAny.id } });
    const reqSnapshot: Array<{ id: string; prev_status: string; prev_verified_by: string | null; prev_files: string[] }> = [];
    let touched = 0;
    const shouldHintFiles = score >= 0.6 && (backend.length + frontend.length + agents.length + models.length) > 0;
    for (const req of reqs) {
      const r = req as any;
      if (r.verified_by === 'manual') continue;
      reqSnapshot.push({
        id: r.id,
        prev_status: r.status,
        prev_verified_by: r.verified_by || null,
        prev_files: Array.isArray(r.github_file_paths) ? r.github_file_paths : [],
      });
      if (shouldHintFiles && (!r.github_file_paths || r.github_file_paths.length === 0)) {
        const reqText = (r.requirement_text || r.requirement_key || '').toLowerCase();
        const isUI = /\b(ui|page|component|display|layout|form|button|screen|view)\b/.test(reqText);
        const isAgent = /\b(agent|automat|monitor|schedule|autonomous|intelligence)\b/.test(reqText);
        const isData = /\b(model|database|table|schema|migration|persist|store)\b/.test(reqText);
        const layered = isUI && frontend.length ? frontend
          : isAgent && agents.length ? agents
          : isData && models.length ? models
          : backend.length ? backend
          : [];
        if (layered.length > 0) {
          r.github_file_paths = layered.slice(0, 5);
          r.verified_by = 'kickoff_inferred'; // marker only — status untouched
          await r.save();
          touched++;
        }
      }
    }

    // Stamp last_execution. Status is 'foundation_built', not 'complete'
    // — so isProcessComplete won't fire on this cap from the kickoff
    // alone. The cap is no longer fresh (has last_execution) but its
    // completion still tracks reqCoverage, which is no longer 100% just
    // from kickoff sync.
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
        requirementsTouched: touched,
        reqSnapshot, // for the reset endpoint
      },
      status: 'foundation_built',
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
      requirementsVerified: touched,
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

/**
 * Reset every capability that was touched by a previous kickoff sync.
 *
 * Used to undo the contaminated state from earlier kickoff runs that:
 *  - flipped requirements to 'verified' (inflating reqCoverage to 100%)
 *  - dumped unrelated files into linked_*_components (lighting up
 *    the wrong layer filters)
 *  - stamped last_execution.status='complete'
 *
 * For each affected cap:
 *  - Restores requirement statuses from the per-cap reqSnapshot.
 *  - Strips the kickoff_sync's contributed files from each layer's
 *    linked_*_components array (using filesLinked we recorded).
 *  - Clears last_execution.validation_report and resets status.
 *  - Removes 'kickoff_sync_applied' from completed_steps.
 */
export async function resetKickoffSync(projectId: string): Promise<{
  capabilitiesReset: number;
  requirementsRestored: number;
  filesUnlinked: number;
}> {
  const caps = await Capability.findAll({ where: { project_id: projectId } });
  let capsReset = 0;
  let reqsRestored = 0;
  let filesUnlinked = 0;

  for (const cap of caps) {
    const capAny = cap as any;
    const le = capAny.last_execution || {};
    const vr = le.validation_report;
    if (!vr || vr.source !== 'kickoff_sync') continue;

    // 1. Restore requirements from snapshot when present.
    const snapshot = Array.isArray(vr.reqSnapshot) ? vr.reqSnapshot : [];
    const snapshotIds = new Set(snapshot.map((s: any) => s.id));
    for (const snap of snapshot) {
      const req = await RequirementsMap.findByPk(snap.id);
      if (!req) continue;
      const r = req as any;
      if (r.verified_by === 'kickoff_inferred' || r.verified_by === 'kickoff_sync') {
        r.status = snap.prev_status;
        r.verified_by = snap.prev_verified_by;
        r.github_file_paths = Array.isArray(snap.prev_files) ? snap.prev_files : [];
        await r.save();
        reqsRestored++;
      }
    }

    // 1b. Snapshot-less fallback: caps from prior kickoff runs (before
    // the snapshot field existed) won't have one. For those, find any
    // requirement on the cap whose verified_by came from the kickoff
    // and roll it back to 'unmatched' — the safe default. This loses
    // the original prev_status detail but cleans up the pollution.
    const orphanReqs = await RequirementsMap.findAll({
      where: { project_id: projectId, capability_id: capAny.id, verified_by: { [Op.in]: ['kickoff_sync', 'kickoff_inferred'] } as any } as any,
    });
    for (const req of orphanReqs) {
      const r = req as any;
      if (snapshotIds.has(r.id)) continue; // already handled above
      r.status = 'unmatched';
      r.verified_by = null;
      r.github_file_paths = [];
      r.confidence_score = 0;
      await r.save();
      reqsRestored++;
    }

    // 2. Strip kickoff-contributed files from linked layers
    const linked = vr.filesLinked || {};
    const stripFrom = (existing: string[], toRemove: string[]): string[] => {
      const remove = new Set(toRemove || []);
      const kept = (existing || []).filter((f: string) => !remove.has(f));
      filesUnlinked += (existing || []).length - kept.length;
      return kept;
    };
    capAny.linked_backend_services = stripFrom(capAny.linked_backend_services, [...(linked.backend || []), ...(linked.models || [])]);
    capAny.linked_frontend_components = stripFrom(capAny.linked_frontend_components, linked.frontend || []);
    capAny.linked_agents = stripFrom(capAny.linked_agents, linked.agents || []);

    // 3. Clear the validation_report and rewind the status / step list
    const completedSteps = (le.completed_steps || []).filter((s: string) => s !== 'kickoff_sync_applied');
    const { validation_report, status, ...restExec } = le;
    capAny.last_execution = (Object.keys(restExec).length > 0 || completedSteps.length > 0)
      ? { ...restExec, completed_steps: completedSteps }
      : null;

    capAny.changed('last_execution', true);
    capAny.changed('linked_backend_services', true);
    capAny.changed('linked_frontend_components', true);
    capAny.changed('linked_agents', true);
    await cap.save();
    capsReset++;
  }

  return { capabilitiesReset: capsReset, requirementsRestored: reqsRestored, filesUnlinked };
}
