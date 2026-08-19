import api from '../utils/api';

// Org-chart hierarchy build (2026-08-19) — real Human Employees -> AI
// Leadership -> AI Staff tree (backend: GET /api/admin/workforce/org-chart).
// Mirrors backend/src/services/workforce/orgChartService.ts's OrgChartResponse
// (and its Zod contract, backend/src/schemas/workforceOrgChartSchema.ts) field
// for field.

export interface OrgChartTask {
  id: string;
  ticket_number: number | null;
  title: string;
  status: string;
  priority: string;
  type: string;
  created_at: string | null;
}

export interface OrgChartHuman {
  id: string;
  name: string;
  email: string;
  team: string | null;
  role: 'manager' | 'member';
  leadership_agent_ids: string[];
  staff_count: number;
  /** The one throttled, most-recent OPEN task for this human, or null when
   * they genuinely have none yet — an honest empty state, never fabricated. */
  task: OrgChartTask | null;
}

export interface OrgChartLeadershipAgent {
  id: string;
  agent_name: string;
  display_name: string;
  reports_to_human_id: string;
  staff_ids: string[];
  open_ticket_count: number;
}

export interface OrgChartStaffAgent {
  id: string;
  agent_name: string;
  display_name: string;
  reports_to_agent_id: string;
  open_ticket_count: number;
}

export interface OrgChartUnresolvedAgent {
  id: string;
  agent_name: string;
  reason: string;
}

export interface OrgChartResponse {
  organization: { id: string; name: string };
  humans: OrgChartHuman[];
  leadership: OrgChartLeadershipAgent[];
  staff: OrgChartStaffAgent[];
  unresolved: OrgChartUnresolvedAgent[];
  generated_at: string;
}

export async function getOrgChart(): Promise<OrgChartResponse> {
  const res = await api.get<OrgChartResponse>('/api/admin/workforce/org-chart');
  return res.data;
}
