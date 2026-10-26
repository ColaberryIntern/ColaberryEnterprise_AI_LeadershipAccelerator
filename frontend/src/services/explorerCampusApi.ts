import api from '../utils/api';

/**
 * Explorer Growth tied to the campus (2026-10-26): the campus activity totals and the staff outreach list. Mirrors
 * backend/src/services/explorerGrowth/explorerCampusService.ts and explorerOutreachRanking.ts (the backend is the contract).
 */
export interface CampusActivity {
  explorers: number;
  open_house: { people: number; rsvps: number; last_7_days: number };
  assignments: { completed: number; people: number; last_7_days: number };
  admissions_calls: { booked: number; upcoming: number; cancelled: number; people: number };
  tours: { started: number; finished: number; by_stop: { stop: number; total: number; people: number }[] };
  on_campus: { last_24h: number; last_7_days: number };
  /** The day tours and campus admissions bookings started being recorded. */
  tracked_since: string;
}

export type OutreachView = 'reach_out' | 'engaged';

export interface OutreachRow {
  enrollment_id: string;
  email: string;
  name: string | null;
  primary_state: string;
  overlays: string[];
  e_score: number;
  i_score: number;
  cards: number;
  rsvps: number;
  calls: number;
  next_call: string | null;
  tour_furthest: number | null;
  tour_total: number | null;
  tour_finished: boolean;
  last_seen: string | null;
  last_contacted_at: string | null;
  score: number;
  reasons: string[];
  /** 2026-10-26: the 360 and GHL links. */
  lead_id: number | null;
  ghl_url: string | null;
}

export interface OutreachList { view: OutreachView; rows: OutreachRow[]; tracked_since: string }

const BASE = '/api/admin/explorer-growth';

export async function getCampusActivity(): Promise<CampusActivity> {
  const { data } = await api.get<CampusActivity>(`${BASE}/campus`);
  return data;
}

export async function getOutreach(view: OutreachView, limit = 25): Promise<OutreachList> {
  const { data } = await api.get<OutreachList>(`${BASE}/outreach`, { params: { view, limit: String(limit) } });
  return data;
}
