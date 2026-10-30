import type { NavSubListSource } from './adminNav';
import type { GovContractCard } from '../../services/adminGovContractsApi';
import type { AgentFactoryCard } from '../../services/agentFactoryApi';
import { adminGovContractNavEntries } from './useAdminGovContractsNav';
import { adminAgentNavEntries } from './useAdminAgentsNav';

/**
 * C92: the entries of a live sidebar sub-list (adminNav.ts `subLists`), from the raw cards its feed returns. The admin sidebar
 * (cards from /api/admin/...) and the Campus HQ building (the same cards from /api/portal/campus/hq-subnav, computed by the same
 * server functions for the same person) both go through THIS mapping, so a sub-item cannot differ between the two.
 */
export interface NavSubEntry { key: string; label: string; to: string; owner?: string }
export interface NavSubCards { gov?: GovContractCard[]; agents?: AgentFactoryCard[] }

export function subNavEntries(source: NavSubListSource, cards: NavSubCards): NavSubEntry[] {
  if (source === 'gov') return adminGovContractNavEntries(cards.gov ?? []);
  if (source === 'agents') return adminAgentNavEntries(cards.agents ?? []).map(({ key, label, to, owner }) => ({ key, label, to, owner }));
  // A source this build does not know yet shows nothing (never a guessed list); the compiler flags it here first.
  const unknown: never = source;
  return unknown;
}
