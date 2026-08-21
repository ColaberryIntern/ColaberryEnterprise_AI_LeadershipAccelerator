import api from '../utils/api';

// Org Chart v5 (2026-08-21, session CC-20260818-x4nk continued) — backs the
// Tickets page's real Creator filter <select>. Mirrors backend/src/services/
// ticketCreatorFilterResolver.ts's TicketCreatorOption field-for-field, same
// deliberate mirror pattern workforceOrgChartApi.ts already uses for the org
// chart's own types.
export interface TicketCreatorOption {
  agent_name: string;
  display_name: string;
}

interface TicketCreatorsResponse {
  creators: TicketCreatorOption[];
}

export async function getTicketCreatorOptions(): Promise<TicketCreatorOption[]> {
  const res = await api.get<TicketCreatorsResponse>('/api/admin/tickets/creators');
  return res.data.creators;
}
