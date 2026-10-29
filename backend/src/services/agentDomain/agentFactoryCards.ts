import type { ProvisionedDomainRow } from './agentDomainProvisionedReader';

/**
 * agentFactoryCards — assemble the admin Interns-hub "Agents" tab cards (mgmt-portal M2).
 *
 * A card merges three sources that each hold part of the truth:
 *   - the PROVISIONED row (`agent_domain_projects`, via `loadProvisionedDomains`/`loadMyDomains`):
 *     the live link to a student project + agent, and the build counts (stories / stories_verified);
 *   - the REGISTRY entry (`agentDomainRegistry.ts`, by `domain_key`): the display title and the
 *     intended builder NAME, neither of which the provisioned row carries;
 *   - the REPO pointer (`resolveProjectRepos`, by `student_project_id`): whether a GitHub repo is
 *     connected, which — together with the verified-story count — is the honest "is this agent's
 *     work syncing" signal without reaching into the webhook-delivery internals.
 *
 * PURE: no I/O. Selection (all domains vs the caller's own) and the three lookups happen in the
 * route; this only shapes rows + their looked-up registry/repo facts into cards, so the merge is
 * testable from literals. A missing registry entry falls back to the domain_key (never blank); a
 * missing repo is `repoConnected: false` (a real state — no repo linked yet — not an error).
 */

export interface AgentFactoryCard {
  domainKey: string;
  title: string;
  managerEmail: string | null;
  intendedBuilder: string | null;
  intendedBuilderState: string | null;
  /** `ai_agents.id` for the (today 2 of 10) domains that have a built agent; null otherwise. */
  agentId: string | null;
  built: boolean;
  studentProjectId: string;
  repoUrl: string | null;
  repoConnected: boolean;
  /** Build progress — the verified-against-total story count, the sync outcome. */
  stories: number;
  storiesVerified: number;
  releases: number;
}

export interface RegistryEntry {
  title: string;
  intended_builder: string | null;
}

export interface RepoFact {
  url: string | null;
}

export function assembleAgentCards(
  rows: readonly ProvisionedDomainRow[],
  registryByKey: ReadonlyMap<string, RegistryEntry>,
  reposByProjectId: ReadonlyMap<string, RepoFact>,
): AgentFactoryCard[] {
  return rows.map((r) => {
    const reg = registryByKey.get(r.domain_key);
    const repo = reposByProjectId.get(r.student_project_id);
    const repoUrl = repo?.url ?? null;
    return {
      domainKey: r.domain_key,
      title: reg?.title ?? r.domain_key,
      managerEmail: r.manager_email,
      intendedBuilder: reg?.intended_builder ?? null,
      intendedBuilderState: r.intended_builder_state,
      agentId: r.agent_id,
      built: r.agent_id != null && r.agent_id !== '',
      studentProjectId: r.student_project_id,
      repoUrl,
      repoConnected: repoUrl != null && repoUrl !== '',
      stories: r.stories,
      storiesVerified: r.stories_verified,
      releases: r.releases,
    };
  });
}
