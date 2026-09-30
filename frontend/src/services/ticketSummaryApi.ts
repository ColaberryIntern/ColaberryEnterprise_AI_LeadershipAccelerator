import api from '../utils/api';

// Agent Detail polish round 4 (2026-09-30) — Ali, live: "when I click on Explain this decision,
// the results doesn't tell me anything beneficial." The real, already-proven-in-production
// per-ticket "why" data is this same summary endpoint StoryTab.tsx (the ticket board's own
// default detail tab) already fetches — reused here for an inline explanation on the Agent
// Detail page's Work tab, not duplicated as a new backend concept.

export interface TicketSummary {
  outcome: string;
  proof: string;
  humanAction: string;
  hasEvidence: boolean;
}

export async function getTicketSummary(ticketId: string): Promise<TicketSummary> {
  const res = await api.get(`/api/admin/tickets/${ticketId}/summary`);
  return res.data;
}
