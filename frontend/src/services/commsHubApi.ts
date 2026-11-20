import api from '../utils/api';

/**
 * commsHubApi: the Communications Hub's data calls (CH1.3 onward). Every call is under
 * /api/admin/comms-hub, gated 'comms_hub' on the server. Shapes mirror
 * backend/src/services/commsHub/commsHubSchemas.ts exactly.
 */

/** The Today tiles and the header's pause state. An empty hub is all zeros. */
export interface CommsHubSummary {
  awaiting_approval: number;
  scheduled_next_7_days: number;
  upcoming_events: number;
  events_missing_thumbnail: number;
  needs_attention: number;
  sending_paused: boolean;
}

export async function getCommsHubSummary(): Promise<CommsHubSummary> {
  const { data } = await api.get<CommsHubSummary>('/api/admin/comms-hub/summary');
  return data;
}
