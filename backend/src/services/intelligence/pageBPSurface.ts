/**
 * Page BP Surface Discovery
 *
 * For an auto-discovered Page BP, build a wider "attachable surface" set:
 * any backend service / agent that could reasonably be exposed by the page
 * or monitor the page. The recommendation engine consumes this to suggest
 * "Surface more of <service> on this page" / "Add <agent> to monitor this
 * page" — recommendations that are specific to the page's context rather
 * than generic backend retry-logic suggestions that don't apply.
 *
 * Deterministic. No LLM. The matching radius is wider than the per-BP
 * clusterer (which only includes files explicitly linked to the BP).
 */

interface AttachableSurface {
  attachable_backend: string[];
  attachable_agents: Array<{ name: string; category?: string | null; description?: string | null }>;
}

/**
 * Extract searchable tokens from a Page BP. We look at the route segments
 * (e.g. /auth/login → ['auth', 'login']) and the BP name words. Filter to
 * tokens that are at least 3 chars and not generic stopwords.
 */
function extractTokens(bpName: string, frontendRoute: string | null | undefined): string[] {
  const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'page', 'screen', 'view', 'detail', 'show', 'all']);
  const tokens = new Set<string>();
  const collect = (raw: string) => {
    for (const t of raw.toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length >= 3 && !STOPWORDS.has(t)) tokens.add(t);
    }
  };
  if (bpName) collect(bpName);
  if (frontendRoute) collect(frontendRoute);
  return [...tokens];
}

/**
 * Build the attachable surface for a Page BP.
 *
 * @param cap - the Capability (must be a Page BP for this to make sense; caller filters)
 * @param repoFileTree - flat list of file paths in the project's repo
 * @param projectAgents - rows from AiAgent table for this project
 * @param alreadyLinkedBackend - implementation_links.backend (don't re-suggest)
 * @param alreadyLinkedAgents - linked_agents (don't re-suggest)
 */
export function discoverPageBPSurface(
  cap: { name?: string; frontend_route?: string | null },
  repoFileTree: string[],
  projectAgents: Array<{ agent_name: string; category?: string | null; description?: string | null }>,
  alreadyLinkedBackend: string[] = [],
  alreadyLinkedAgents: string[] = [],
): AttachableSurface {
  const tokens = extractTokens(cap.name || '', cap.frontend_route);
  if (tokens.length === 0) return { attachable_backend: [], attachable_agents: [] };

  const linkedBackendSet = new Set(alreadyLinkedBackend.map(f => f.toLowerCase()));
  const linkedAgentsSet = new Set(alreadyLinkedAgents.map(a => a.toLowerCase()));

  // Backend file matching — focus on service / route / controller / handler /
  // model files. Skip frontend, test, build, generated, and deps.
  const isBackendFile = (f: string): boolean => {
    const lower = f.toLowerCase();
    if (!/\.(ts|js|py|go|rb|java|cs)$/.test(lower)) return false;
    if (/(^|\/)node_modules\//.test(lower)) return false;
    if (/\.(test|spec)\.(ts|js)$/.test(lower)) return false;
    if (/(^|\/)(dist|build|coverage|\.next)\//.test(lower)) return false;
    if (/(^|\/)(public|static|assets)\//.test(lower)) return false;
    // Heuristic — backend-ish paths
    return /\/(service|services|route|routes|controller|controllers|handler|handlers|model|models|api|server|backend)\b/i.test(lower)
      || /(service|controller|handler|repository|model)\.(ts|js|py)$/i.test(lower);
  };

  const backendCandidates = new Set<string>();
  for (const f of repoFileTree) {
    if (!isBackendFile(f)) continue;
    if (linkedBackendSet.has(f.toLowerCase())) continue;
    const lower = f.toLowerCase();
    if (tokens.some(t => lower.includes(t))) backendCandidates.add(f);
  }

  // Agent matching — match on name, category, or description containing
  // any of the tokens. Skip agents already linked to the BP.
  const agentCandidates: AttachableSurface['attachable_agents'] = [];
  for (const a of projectAgents) {
    if (!a.agent_name) continue;
    if (linkedAgentsSet.has(a.agent_name.toLowerCase())) continue;
    const haystack = `${a.agent_name} ${a.category || ''} ${a.description || ''}`.toLowerCase();
    if (tokens.some(t => haystack.includes(t))) {
      agentCandidates.push({ name: a.agent_name, category: a.category || null, description: a.description || null });
    }
  }

  return {
    attachable_backend: [...backendCandidates].slice(0, 15),
    attachable_agents: agentCandidates.slice(0, 10),
  };
}
