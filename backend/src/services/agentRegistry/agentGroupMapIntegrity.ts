/**
 * AGENT_GROUP_MAP integrity checks (2026-10-06).
 *
 * WHY THIS EXISTS. `ai_agents.agent_group` is a SINGLE column, so an agent
 * belongs to exactly ONE super-agent group. agentRegistrySeed.ts's
 * assignAgentGroups() writes with `where: { agent_name, agent_group: null }`,
 * so the FIRST key in AGENT_GROUP_MAP to name an agent claims it for good and
 * every later listing of that same name is an UPDATE THAT MATCHES NO ROW — a
 * silent no-op. A group defined as a subset of a group declared above it can
 * therefore never have a single member.
 *
 * That is not a theoretical hazard, it is a seven-month production outage.
 * `content_engine` was defined as ['ContentOptimizationAgent',
 * 'ConversationOptimizationAgent'], both already listed under `campaign_ops`,
 * which is iterated first. Production confirms the result: `SELECT agent_group,
 * count(*) FROM ai_agents GROUP BY 1` returns no content_engine row at all,
 * while ContentEngineSuperAgent published 9,369 consecutive department reports
 * reading "Content Engine: 0/0 healthy, 0 errored, 0 paused. 0 anomalies
 * detected." between 2026-03-17 and 2026-10-06. Every one of those 9,369 rows
 * printed the number that proves the check is blind next to the word healthy.
 *
 * The quieter variant of the same bug is a name with no AGENT_REGISTRY entry
 * behind it. `admissions` listed 'AdmissionsAppointmentAgent',
 * 'AdmissionsCallComplianceAgent' and 'AdmissionsCallbackAgent' — names copied
 * from the SOURCE FILES, not the registered agent_names
 * (AdmissionsAppointmentSchedulingAgent, AdmissionsCallComplianceMonitor,
 * AdmissionsCallbackManagementAgent). Three updates matched nothing. Production
 * holds 17 admissions rows where the map intended 20, and the live report reads
 * "Admissions: 11/17 healthy" — a super agent supervising a department three
 * agents larger than the one it can see.
 *
 * Pure and dependency-free on purpose. The map is static data, so every defect
 * it can carry is detectable with no database, which puts the failure in CI
 * instead of in the first boot after a bad merge.
 */

/** One agent name claimed by more than one group. */
export interface DuplicateGroupClaim {
  agent_name: string;
  /** Every group that lists this name, in map key order. */
  groups: string[];
  /** The only group that can ever win: the first to claim the name. */
  effective_group: string;
  /** Groups whose update for this name silently matches no row. */
  losing_groups: string[];
}

/** One name in the map with no AGENT_REGISTRY entry behind it. */
export interface UnseededGroupMember {
  agent_name: string;
  group: string;
}

export interface AgentGroupMapDefects {
  duplicates: DuplicateGroupClaim[];
  unseeded: UnseededGroupMember[];
  /**
   * Groups that cannot hold a single row once the two defects above are
   * accounted for — either declared `[]`, or listing nothing but names another
   * group already claimed / names no registry entry matches. Reported
   * separately from `duplicates`/`unseeded` because a group deliberately
   * declared empty is a product decision, not a defect: the super agent must
   * then report UNKNOWN rather than healthy (superAgentHealth.ts). It is still
   * surfaced so a group that becomes empty by ACCIDENT is visible.
   */
  emptyGroups: string[];
}

/**
 * Audit a group map against the set of agent_names that are actually
 * registered. Both inputs are parameters rather than module imports so the
 * check can be exercised against a deliberately broken map — a duplicate
 * detector that has never been shown to fire is not a detector.
 *
 * `seededAgentNames` must come from AGENT_REGISTRY, which is the authoritative
 * universe of agent_names: the identity seeders (Reese, Dara, ticket creators)
 * refuse to run at all without an existing registry row
 * (agentIdentitySeed.ts), so there is no second source of AiAgent rows for the
 * group map to legitimately target.
 */
export function auditAgentGroupMap(
  map: Readonly<Record<string, readonly string[]>>,
  seededAgentNames: ReadonlySet<string>,
): AgentGroupMapDefects {
  // Claims in map key order — Object.entries preserves insertion order for
  // string keys, which is exactly the order assignAgentGroups() iterates, so
  // claims[0] is genuinely the group that wins at runtime.
  const claimsByName = new Map<string, string[]>();
  for (const [group, names] of Object.entries(map)) {
    for (const name of names) {
      const claims = claimsByName.get(name);
      if (claims) claims.push(group);
      else claimsByName.set(name, [group]);
    }
  }

  const duplicates: DuplicateGroupClaim[] = [];
  for (const [agent_name, groups] of claimsByName) {
    // length > 1 also catches the same name listed twice inside ONE group,
    // which is the same silent no-op wearing a less obvious disguise.
    if (groups.length < 2) continue;
    duplicates.push({
      agent_name,
      groups: [...groups],
      effective_group: groups[0],
      losing_groups: groups.slice(1),
    });
  }

  const unseeded: UnseededGroupMember[] = [];
  for (const [group, names] of Object.entries(map)) {
    for (const name of names) {
      if (!seededAgentNames.has(name)) unseeded.push({ agent_name: name, group });
    }
  }

  const emptyGroups = Object.entries(map)
    .filter(([group, names]) =>
      // `every` on an empty array is true, so a group declared `[]` is
      // correctly reported as empty.
      names.every((name) => !seededAgentNames.has(name) || claimsByName.get(name)![0] !== group),
    )
    .map(([group]) => group);

  return { duplicates, unseeded, emptyGroups };
}

/**
 * Render the DEFECTS (duplicates and unseeded names) as log lines. Deliberately
 * excludes `emptyGroups`: a declared-empty group is a known state, and a guard
 * that shouts about a known state on every boot is one somebody mutes.
 *
 * Returns [] when the map is clean, so the caller's loop emits nothing.
 */
export function formatAgentGroupMapDefects(defects: AgentGroupMapDefects): string[] {
  const lines: string[] = [];

  for (const d of defects.duplicates) {
    lines.push(
      `'${d.agent_name}' is listed under ${d.groups.length} groups (${d.groups.join(', ')}). ` +
        `ai_agents.agent_group is a single column, so only '${d.effective_group}' can ever win — ` +
        `the assignment for ${d.losing_groups.map((g) => `'${g}'`).join(', ')} matches no row and is a ` +
        'silent no-op. Give the agent one group.',
    );
  }

  for (const u of defects.unseeded) {
    lines.push(
      `'${u.agent_name}' (group '${u.group}') has no AGENT_REGISTRY entry, so its agent_group ` +
        'assignment matches no row and the group silently loses a member. Use the REGISTERED ' +
        'agent_name, which is not always the name of the source file.',
    );
  }

  return lines;
}
