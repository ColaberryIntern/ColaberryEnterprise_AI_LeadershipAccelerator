/**
 * agentAttributionClassifier — 2026-05-20.
 *
 * Turns brownfield's noisy linked_agents into authoritative
 * capability_agent_maps via gpt-4o-mini. For each (cap, candidate agent)
 * pair, asks the model to rate confidence 0.0–1.0 that the agent file
 * serves that capability.
 *
 *   confidence >= 0.7        → write a capability_agent_maps row
 *                              (linked_by: 'llm', role from model)
 *   confidence in [0.5, 0.7) → uncertain — surface in cap detail for
 *                              one-click operator confirm/reject
 *   confidence < 0.5         → reject silently
 *
 * Verdicts persist to cap.agent_roles_cache.classifications[] so the
 * cap detail can show LLM reasoning + a per-classification override.
 *
 * Cache key per pair: sha256(cap.name + agent_path + agent_file_sha).
 * Stable name + unchanged file = no second LLM call.
 *
 * Wired into:
 *   - discoverBrownfieldCapabilities (runs at end of each scan)
 *   - POST /api/portal/project/agents/reclassify (manual re-run)
 *   - scripts/backfillAgentAttribution.js (one-shot for existing projects)
 */
import crypto from 'crypto';

interface ClassificationVerdict {
  agent_path: string;
  agent_file_sha: string;
  confidence: number;          // 0.0–1.0
  role: string;                // 'executor' | 'monitor' | 'classifier' | ...
  reasoning: string;           // ~1 sentence
  classified_at: string;       // ISO
  cache_key: string;           // sha256
  decision: 'confirmed' | 'uncertain' | 'rejected';
  operator_override?: 'confirm' | 'reject' | null;
}

export interface ClassifyProjectResult {
  caps_scanned: number;
  pairs_classified: number;
  pairs_cache_hit: number;
  confirmed: number;
  uncertain: number;
  rejected: number;
  llm_errors: number;
}

const CONFIDENCE_CONFIRM = 0.7;
const CONFIDENCE_UNCERTAIN = 0.5;

const SYSTEM_PROMPT = `You judge whether a backend "agent" file (a service/worker/orchestrator) is a primary implementation of a specific business capability.

You will receive:
  - a capability: name + description
  - a candidate agent file: path + head of source

Return JSON: { "confidence": 0.0-1.0, "role": "executor|monitor|classifier|orchestrator|other", "reasoning": "one sentence" }

Confidence guide:
  0.85+  the file's stated purpose IS the capability (filename/docstring match)
  0.70–0.85  the file is one of several services that implement this capability
  0.50–0.70  the file participates but isn't dedicated to this capability
  0.20–0.50  the file is loosely related but better attributed elsewhere
  <0.20   the file should not be attributed to this capability

Be strict. Most caps have 0–2 dedicated agents, not 5+. Shared utility files attributed by keyword match should rate <0.5.`;

interface CapInput {
  id: string;
  name: string;
  description: string | null;
  linked_agents: string[];
  agent_roles_cache: any | null;
}

interface AgentFileSnapshot {
  path: string;
  sha: string;
  head: string;
}

export async function classifyProjectAgentAttribution(
  enrollmentId: string,
  projectId: string,
): Promise<ClassifyProjectResult> {
  const stats: ClassifyProjectResult = {
    caps_scanned: 0,
    pairs_classified: 0,
    pairs_cache_hit: 0,
    confirmed: 0,
    uncertain: 0,
    rejected: 0,
    llm_errors: 0,
  };

  const { default: Capability } = await import('../models/Capability');
  const { Op } = await import('sequelize');
  const caps: any[] = await Capability.findAll({
    where: {
      project_id: projectId,
      applicability_status: 'active',
      linked_agents: { [Op.ne]: null as any },
    },
  });

  // De-dup file fetches: same agent file may appear under many caps.
  const allAgentPaths = new Set<string>();
  const capInputs: CapInput[] = [];
  for (const c of caps) {
    const linked = (c.linked_agents || []) as string[];
    if (linked.length === 0) continue;
    capInputs.push({
      id: c.id,
      name: c.name,
      description: c.description,
      linked_agents: linked,
      agent_roles_cache: c.agent_roles_cache,
    });
    for (const p of linked) allAgentPaths.add(p);
  }
  stats.caps_scanned = capInputs.length;

  // Fetch agent file heads in parallel; tolerate missing files.
  const fileMap = new Map<string, AgentFileSnapshot>();
  await Promise.all(Array.from(allAgentPaths).map(async (path) => {
    const snap = await loadAgentSnapshot(enrollmentId, path);
    if (snap) fileMap.set(path, snap);
  }));

  // Classify each (cap, agent) pair.
  for (const cap of capInputs) {
    const existing = cap.agent_roles_cache || {};
    const priorClassifications: ClassificationVerdict[] = Array.isArray(existing.classifications)
      ? existing.classifications
      : [];
    const verdictByCacheKey = new Map(priorClassifications.map(v => [v.cache_key, v]));
    const newVerdicts: ClassificationVerdict[] = [];

    for (const agentPath of cap.linked_agents) {
      const snap = fileMap.get(agentPath);
      if (!snap) {
        // file unreadable — record a stub rejection so the row doesn't
        // re-fire LLM forever; surfaces as "rejected (file unreadable)"
        newVerdicts.push({
          agent_path: agentPath,
          agent_file_sha: 'unreadable',
          confidence: 0,
          role: 'other',
          reasoning: 'Agent file could not be read from the repository.',
          classified_at: new Date().toISOString(),
          cache_key: cacheKey(cap.name, agentPath, 'unreadable'),
          decision: 'rejected',
        });
        stats.rejected += 1;
        continue;
      }
      const key = cacheKey(cap.name, agentPath, snap.sha);
      const cached = verdictByCacheKey.get(key);
      if (cached && cached.operator_override !== undefined && cached.operator_override !== null) {
        // operator made an explicit override — never re-classify
        newVerdicts.push(cached);
        stats.pairs_cache_hit += 1;
        continue;
      }
      if (cached) {
        newVerdicts.push(cached);
        stats.pairs_cache_hit += 1;
        continue;
      }
      try {
        const verdict = await classifyPair(cap, snap, key);
        newVerdicts.push(verdict);
        stats.pairs_classified += 1;
        if (verdict.decision === 'confirmed') stats.confirmed += 1;
        else if (verdict.decision === 'uncertain') stats.uncertain += 1;
        else stats.rejected += 1;
      } catch (err: any) {
        console.warn(`[agentAttrib] classify failed for ${cap.name} ↔ ${agentPath}: ${err?.message}`);
        stats.llm_errors += 1;
      }
    }

    // Persist verdicts on the cap.
    await Capability.update(
      { agent_roles_cache: { ...(existing || {}), classifications: newVerdicts, classified_at: new Date().toISOString() } } as any,
      { where: { id: cap.id } },
    );

    // Sync capability_agent_maps: confirm verdicts that say 'confirmed';
    // unlink any prior LLM-confirmed agents that flipped to rejected/uncertain.
    await syncMapForCap(cap.id, newVerdicts);
  }

  return stats;
}

function cacheKey(capName: string, agentPath: string, fileSha: string): string {
  return crypto.createHash('sha256')
    .update(`${capName}||${agentPath}||${fileSha}`)
    .digest('hex')
    .slice(0, 16);
}

async function loadAgentSnapshot(enrollmentId: string, path: string): Promise<AgentFileSnapshot | null> {
  const { readFileFromRepo } = await import('./githubService');
  const content = await readFileFromRepo(enrollmentId, path).catch(() => null);
  if (!content) return null;
  // Head: first 150 lines, capped at 6000 chars to keep prompt token-light.
  const head = content.split(/\r?\n/).slice(0, 150).join('\n').slice(0, 6000);
  const sha = crypto.createHash('sha1').update(content).digest('hex');
  return { path, sha, head };
}

async function classifyPair(
  cap: CapInput,
  snap: AgentFileSnapshot,
  cacheKeyForVerdict: string,
): Promise<ClassificationVerdict> {
  const { callLLMWithAudit } = await import('./llmCallWrapper');
  const userPrompt = [
    `## Capability`,
    `Name: ${cap.name}`,
    `Description: ${(cap.description || '').slice(0, 800) || '(no description)'}`,
    ``,
    `## Candidate Agent File`,
    `Path: ${snap.path}`,
    ``,
    '```',
    snap.head,
    '```',
    ``,
    `Return JSON only.`,
  ].join('\n');

  const result = await callLLMWithAudit({
    lessonId: 'agent-attribution',
    generationType: 'admin_structure',
    step: 'agent_attribution_classify_pair',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    model: 'gpt-4o-mini',
    temperature: 0,
    maxTokens: 200,
    responseFormat: { type: 'json_object' },
  });

  let parsed: any = {};
  try { parsed = JSON.parse(result.content); } catch { parsed = {}; }
  const confidence = clamp01(Number(parsed.confidence));
  const role = String(parsed.role || 'other').toLowerCase().slice(0, 24);
  const reasoning = String(parsed.reasoning || '').slice(0, 400);
  const decision: ClassificationVerdict['decision'] =
    confidence >= CONFIDENCE_CONFIRM ? 'confirmed'
    : confidence >= CONFIDENCE_UNCERTAIN ? 'uncertain'
    : 'rejected';

  return {
    agent_path: snap.path,
    agent_file_sha: snap.sha,
    confidence,
    role,
    reasoning,
    classified_at: new Date().toISOString(),
    cache_key: cacheKeyForVerdict,
    decision,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Reconcile capability_agent_maps for a single cap against the latest
 * verdict set. Confirms what's confirmed; tears down map rows that
 * previously came from LLM but are now rejected/uncertain (preserves
 * operator-linked rows — linked_by !== 'llm').
 */
async function syncMapForCap(capabilityId: string, verdicts: ClassificationVerdict[]): Promise<void> {
  const { linkAgent, unlinkAgent } = await import('./capabilityAgentMapService');
  const { default: CapabilityAgentMap } = await import('../models/CapabilityAgentMap');
  const existingMaps: any[] = await CapabilityAgentMap.findAll({
    where: { capability_id: capabilityId, status: 'active' },
  });
  const existingByAgent = new Map(existingMaps.map((m: any) => [m.agent_name, m]));

  for (const v of verdicts) {
    const effectiveDecision = v.operator_override === 'confirm'
      ? 'confirmed'
      : v.operator_override === 'reject'
        ? 'rejected'
        : v.decision;
    const agentName = agentNameFromPath(v.agent_path);
    if (effectiveDecision === 'confirmed') {
      const cur = existingByAgent.get(agentName);
      // Don't stomp operator-linked rows; do create/refresh LLM-linked rows.
      if (!cur || cur.linked_by === 'llm') {
        await linkAgent(capabilityId, agentName, {
          role: v.role || 'executor',
          linkedBy: v.operator_override === 'confirm' ? 'operator' : 'llm',
          config: { agent_path: v.agent_path, confidence: v.confidence, reasoning: v.reasoning },
        });
      }
      existingByAgent.delete(agentName); // mark as still-wanted
    } else {
      // Not confirmed: if a prior LLM-linked row exists, unlink it —
      // but ONLY when the new verdict is a REAL rejection (LLM saw the
      // file and decided no). A verdict generated from an unreadable
      // file (agent_file_sha === 'unreadable') is a fetch failure, not
      // a classification — preserve the prior map row so transient
      // GitHub-rate-limit blips don't tear down good attribution.
      // (2026-05-21: caught when Campaign Management's 3 confirmed maps
      // got nuked by a re-run that couldn't fetch any agent file.)
      const cur = existingByAgent.get(agentName);
      const isUnreadable = v.agent_file_sha === 'unreadable';
      if (cur && cur.linked_by === 'llm' && !isUnreadable) {
        await unlinkAgent(capabilityId, agentName);
      }
    }
  }
}

function agentNameFromPath(p: string): string {
  const file = p.split('/').pop() || p;
  return file.replace(/\.(ts|tsx|js|jsx)$/i, '');
}
