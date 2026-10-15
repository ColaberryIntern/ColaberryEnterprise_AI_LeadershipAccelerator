import api from '../utils/api';

/**
 * The agent-domain read API (backend AF2.4, PR #3100).
 *
 * Two routes, answering two different questions, and conflating them is the mistake to avoid:
 *
 *   - `agent-domains-mine`        what the SIGNED-IN human owns. Scoped by the caller's own email
 *                                 from the verified token, never from a parameter.
 *   - `agent-domains-provisioned` all ten, read from the database.
 *
 * Section access decides whether you may ask; ownership decides what comes back. A full admin
 * reaches both routes and still gets only their own domains from `-mine`, which is the property
 * that makes the page meaningful rather than an admin-sees-everything dump.
 */

export interface AgentDomainRow {
  domain_key: string;
  student_project_id: string;
  anchor_id: string;
  /** Null means the lifecycle row is missing. A finding, not a default. */
  stage: string | null;
  entry_point: string | null;
  manager_identity_id: string | null;
  manager_email: string | null;
  manager_can_reach: boolean | null;
  manager_blocker: string | null;
  intended_builder_state: string | null;
  agent_id: string | null;
  releases: number;
  stories: number;
  stories_verified: number;
  build_authorizations: number;
}

export interface AgentDomainSummary {
  domains: number;
  releases: number;
  stories: number;
  stories_verified: number;
  build_authorizations: number;
  missing_lifecycle_row: number;
  managers_blocked: number;
  /** The backend's own words about whether this is a plan or progress. Rendered, never rephrased. */
  disclosure: string;
}

export interface MyDomainsResponse {
  caller_email: string;
  resolved_identities: number;
  summary: AgentDomainSummary;
  domains: AgentDomainRow[];
  /** Why the list is empty, when it is. Shown so an empty list is not read as a load failure. */
  note: string;
}

export async function fetchMyDomains(): Promise<MyDomainsResponse> {
  const { data } = await api.get<MyDomainsResponse>('/api/admin/agent-domains-mine');
  return data;
}

export async function fetchProvisionedDomains(): Promise<{
  summary: AgentDomainSummary;
  domains: AgentDomainRow[];
}> {
  const { data } = await api.get('/api/admin/agent-domains-provisioned');
  return data;
}

export function errorMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: string } } };
  return r?.response?.data?.error || fallback;
}
