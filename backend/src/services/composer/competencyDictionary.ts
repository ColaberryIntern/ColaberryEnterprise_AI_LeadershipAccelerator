/**
 * competencyDictionary — the single source of truth that makes Composer
 * competency coverage HONEST. It does three deterministic jobs:
 *
 *   1) NORMALIZE competency ids so spelling / casing / spacing / plural variants
 *      collapse to one id ("Agentic Loop" == "agentic_loop" == "agentic_loops").
 *   2) CANONICALIZE via a small, conservative synonym table (true equivalences
 *      only — never sub-skill → parent, which would fake coverage).
 *   3) Map architect DOMAINS → their constituent competencies, so domain coverage
 *      stops requiring the domain string to literally equal a competency string
 *      (the old bug that pinned "Architect domains" near 0%).
 *
 * Pure + data-driven. Unknown competencies pass through normalized — they are
 * counted, never silently dropped. SYNONYMS and DOMAIN_COMPETENCIES are TUNABLE
 * data: extend them as the taxonomy evolves. Nothing here calls an LLM.
 */

/** Lowercase, trim, collapse whitespace/hyphens/dots to a single underscore, strip junk. */
export function normalizeCompetency(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-.]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * canonical_id → [alias variants]. Conservative: only genuine equivalences and
 * spelling/plural variants. Each alias is stored normalized. Add entries here as
 * new blueprint vocabulary appears; do NOT map a narrow sub-skill onto a broad
 * parent (e.g. do not fold "plan_mode" into "claude_code") — that inflates
 * coverage. Real coverage of taught-but-untyped skills comes from a week's
 * session_competencies, not from aliasing.
 */
const SYNONYMS: Record<string, string[]> = {
  agentic_loops: ['agentic_loop', 'the_agentic_loop', 'agent_loop', 'agentic_loops'],
  prompt_engineering: ['prompting', 'prompt_design', 'prompt_craft', 'prompting_basics'],
  context_engineering: ['context_window_management'],
  context_management: ['context_window', 'context_control'],
  claude_md: ['claudemd', 'claude_dot_md'],
  explore_plan_code_commit: ['epcc', 'explore_plan_code_commit_loop'],
  ai_governance: ['governance_ai', 'responsible_ai'],
  ai_literacy: ['ai_fluency', 'ai_foundations', 'ai_basics'],
  systems_thinking: ['system_thinking', 'systems_design_thinking'],
  decision_making: ['decisioning', 'decision_frameworks'],
};

/** Reverse index: normalized alias → canonical id. Built once at module load. */
const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
    const canon = normalizeCompetency(canonical);
    m.set(canon, canon);
    for (const a of aliases) m.set(normalizeCompetency(a), canon);
  }
  return m;
})();

/** Normalize then canonicalize a single competency to its stable id. */
export function resolveCompetency(raw: string): string {
  const n = normalizeCompetency(raw);
  return ALIAS_TO_CANONICAL.get(n) || n;
}

/** Resolve a list into a de-duplicated Set of canonical ids (empties dropped). */
export function resolveCompetencies(list: readonly string[] | undefined | null): Set<string> {
  const out = new Set<string>();
  for (const c of list || []) {
    const r = resolve(c);
    if (r) out.add(r);
  }
  return out;
}
const resolve = resolveCompetency; // local alias (typeRegistry also exports a `resolve`)

/**
 * architect domain id → competencies that count as "touching" that domain.
 * Grounded in the week-blueprint pairings (data/weekBlueprints.ts) and the
 * canonical course domains (data/canonicalCourse.ts). Tunable. A domain is also
 * always covered by its own id appearing as a competency (back-compat).
 */
const DOMAIN_COMPETENCIES: Record<string, string[]> = {
  build_discipline: [
    'claude_code', 'agentic_loops', 'workspace_setup', 'explore_plan_code_commit',
    'context_management', 'plan_mode', 'permission_modes', 'claude_md',
    'testing', 'deployment', 'implementation', 'architecture', 'build', 'github',
  ],
  ai_systems_architecture: [
    'architecture', 'systems_thinking', 'context_engineering', 'mcp', 'subagents',
    'tradeoffs', 'integration', 'orchestration', 'ai_systems_architecture',
  ],
  requirements: [
    'requirements', 'documentation', 'specification', 'user_stories', 'scoping',
  ],
  governance: [
    'ai_governance', 'security', 'evals', 'safety', 'compliance', 'risk', 'governance',
  ],
  executive_authority: [
    'leadership', 'communication', 'decision_making', 'strategy', 'stakeholder_management',
  ],
  strategy_trust: [
    'strategy', 'trust', 'communication', 'change_management', 'ai_literacy',
  ],
};

/** Canonicalized domain → competency-id Set, built once. */
const DOMAIN_TO_COMPS: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const [domain, comps] of Object.entries(DOMAIN_COMPETENCIES)) {
    m.set(normalizeCompetency(domain), resolveCompetencies(comps));
  }
  return m;
})();

/**
 * Is an architect domain "touched" by the present (canonical) competencies?
 * True when the domain's own id is present, OR any of its constituent
 * competencies is present. Replaces the old exact-string-equality check.
 */
export function domainTouched(domain: string, presentCanonical: Set<string>): boolean {
  const d = normalizeCompetency(domain);
  if (presentCanonical.has(d)) return true;
  const comps = DOMAIN_TO_COMPS.get(d);
  if (!comps) return false;
  for (const c of comps) if (presentCanonical.has(c)) return true;
  return false;
}
