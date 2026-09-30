import api from '../utils/api';

// Drill-down roster behind the "Explorer" tenure bucket on /admin/revenue —
// everyone still in free trial, tagged with their existing points-based
// engagement level (Apprentice/Builder/Architect/Principal).

export interface ExplorerRosterRow {
  enrollment_id: string;
  full_name: string;
  email: string;
  signed_up_at: string | null;
  points: number;
  level: number;
  level_name: string;
}

export async function getExplorerRoster(): Promise<ExplorerRosterRow[]> {
  const { data } = await api.get('/api/admin/revenue/explorers');
  return data.explorers;
}
