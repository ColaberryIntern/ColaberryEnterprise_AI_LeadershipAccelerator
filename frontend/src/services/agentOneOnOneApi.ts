import api from '../utils/api';

// AI Agent Dashboard redesign, Checkpoint D, Performance slice (2026-09-02)
// — first frontend caller of the real, already-live AgentOneOnOne CRUD
// (agentOneOnOneService.ts). Only two real fields exist today — `agenda`
// and `outcomeNotes` — no wins/challenges/mistakes/lessons/commitments as
// distinct fields; the UI must not fabricate structure that isn't real.

export interface AgentOneOnOne {
  id: string;
  agenda: string;
  outcomeNotes: string | null;
  status: 'scheduled' | 'completed';
  createdByEmail: string;
  heldAt: string | null;
  createdAt: string;
}

interface OneOnOnesResponse {
  agentId: string;
  oneOnOnes: AgentOneOnOne[];
}

export async function listOneOnOnes(agentId: string): Promise<AgentOneOnOne[]> {
  const res = await api.get<OneOnOnesResponse>(`/api/admin/agents/${agentId}/one-on-ones`);
  return res.data.oneOnOnes;
}

export async function createOneOnOne(agentId: string, agenda: string): Promise<AgentOneOnOne> {
  const res = await api.post<AgentOneOnOne>(`/api/admin/agents/${agentId}/one-on-ones`, { agenda });
  return res.data;
}

export async function completeOneOnOne(agentId: string, oneOnOneId: string, outcomeNotes: string): Promise<AgentOneOnOne> {
  const res = await api.post<AgentOneOnOne>(`/api/admin/agents/${agentId}/one-on-ones/${oneOnOneId}/complete`, { outcomeNotes });
  return res.data;
}
