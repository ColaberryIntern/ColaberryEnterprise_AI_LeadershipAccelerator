import { useEffect, useState } from 'react';
import { fetchAgentFactory, AgentFactoryCard } from '../../services/agentFactoryApi';

/**
 * The agent domains to show as sub-items under the admin left-nav "Interns → Agents" node. Backed by
 * GET /api/admin/agent-factory (fetchAgentFactory), already row-scoped server-side: an owner/admin
 * (broad) gets all 10 domains; a scoped builder gets their own. `enabled` is `canSection('agents')`, so
 * the fetch only fires for a viewer who holds the section. Fail-soft: any error leaves the list empty.
 */
export function useAdminAgentsNav(enabled: boolean): AgentFactoryCard[] {
  const [cards, setCards] = useState<AgentFactoryCard[]>([]);
  useEffect(() => {
    if (!enabled) { setCards([]); return; }
    let live = true;
    fetchAgentFactory()
      .then((r) => { if (live) setCards(r.agents); })
      .catch(() => { /* no agents access / offline — leave the node hidden */ });
    return () => { live = false; };
  }, [enabled]);
  return cards;
}

/** One left-nav sub-item per agent domain. `owner` is the builder (or manager). `built` = it has a live agent. */
export interface AdminAgentNavEntry { key: string; label: string; to: string; owner?: string; built: boolean; }

/**
 * Pure: one nav sub-item per agent domain — ALL of them (unlike gov, which filters), so every agent is
 * reachable. A BUILT agent (a live `agentId`, from the runtime factory data — NOT the static planning
 * registry, which undercounts) links to its immersive dashboard at /admin/agents/:agentId; an unbuilt
 * domain links to its per-agent page /admin/internship/agent/:domainKey (a child of /admin/internship, so
 * it inherits the `internship` route gate; the backend factory endpoint is the real `agents` gate). Owner =
 * the builder (`intendedBuilder`), else the accountable manager (`managerEmail`).
 */
export function adminAgentNavEntries(cards: AgentFactoryCard[]): AdminAgentNavEntry[] {
  return cards.map((c) => ({
    key: c.domainKey,
    label: c.title,
    to: c.built && c.agentId ? `/admin/agents/${c.agentId}` : `/admin/internship/agent/${c.domainKey}`,
    owner: c.intendedBuilder ?? c.managerEmail ?? undefined,
    built: c.built,
  }));
}
