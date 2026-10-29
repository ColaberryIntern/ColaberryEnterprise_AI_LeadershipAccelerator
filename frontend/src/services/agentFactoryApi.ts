import api from '../utils/api';

/**
 * agentFactoryApi — the admin Interns-hub "Agents" tab's one data call.
 *
 * `GET /api/admin/agent-factory` (gated `agents`) returns the factory's agent domains this caller
 * may see: every domain for a management/operator viewer, or the caller's own for a scoped viewer.
 * `scope` echoes which. The shape mirrors the backend `AgentFactoryCard` (services/agentDomain/
 * agentFactoryCards.ts) exactly.
 */

export interface AgentFactoryCard {
  domainKey: string;
  title: string;
  managerEmail: string | null;
  intendedBuilder: string | null;
  intendedBuilderState: string | null;
  agentId: string | null;
  built: boolean;
  studentProjectId: string;
  repoUrl: string | null;
  repoConnected: boolean;
  stories: number;
  storiesVerified: number;
  releases: number;
}

export interface AgentFactoryResponse {
  agents: AgentFactoryCard[];
  scope: 'all' | 'mine';
}

export async function fetchAgentFactory(): Promise<AgentFactoryResponse> {
  const { data } = await api.get('/api/admin/agent-factory');
  return data as AgentFactoryResponse;
}

export function errorMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: string } } };
  return r?.response?.data?.error ?? fallback;
}
