import api from '../utils/api';

// AI Agent Dashboard redesign, Checkpoint E — Trust & Control (2026-09-03) —
// first frontend caller of the real, already-live AgentMemoryProposal CRUD
// (AI Workforce Management, Checkpoint E). This is the governed-memory
// approval gate: a proposal never reaches the agent's runtime context
// (getApprovedMemoryTexts()) until a real, separate approve call flips its
// status — the UI must render that gate as real, not decorative.

export interface AgentMemoryProposal {
  id: string;
  agentId: string;
  content: string;
  evidence: string | null;
  status: 'pending' | 'approved' | 'rejected';
  proposedByEmail: string;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

interface MemoryProposalsResponse {
  agentId: string;
  proposals: AgentMemoryProposal[];
}

export async function listMemoryProposals(agentId: string): Promise<AgentMemoryProposal[]> {
  const res = await api.get<MemoryProposalsResponse>(`/api/admin/agents/${agentId}/memory-proposals`);
  return res.data.proposals;
}

export async function proposeMemory(agentId: string, content: string, evidence?: string): Promise<AgentMemoryProposal> {
  const res = await api.post<AgentMemoryProposal>(`/api/admin/agents/${agentId}/memory-proposals`, { content, evidence });
  return res.data;
}

export async function approveMemoryProposal(agentId: string, proposalId: string): Promise<AgentMemoryProposal> {
  const res = await api.post<AgentMemoryProposal>(`/api/admin/agents/${agentId}/memory-proposals/${proposalId}/approve`);
  return res.data;
}

export async function rejectMemoryProposal(agentId: string, proposalId: string): Promise<AgentMemoryProposal> {
  const res = await api.post<AgentMemoryProposal>(`/api/admin/agents/${agentId}/memory-proposals/${proposalId}/reject`);
  return res.data;
}
