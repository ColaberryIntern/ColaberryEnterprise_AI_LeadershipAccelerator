import api from '../utils/api';
import type { HeatMapWord } from '../components/admin/missedOpportunities/MissedOpportunitiesHeatMap';

const BASE = '/api/admin/inbox/missed-opportunities';

export interface ScoreFactor { factor: string; label: string; points: number; detail?: string }
export interface ScoreTopic { topic: string; weight: number }

export interface MissedEmailRow {
  emailId: string;
  score: number;
  band: string;
  subject: string;
  fromName: string | null;
  fromAddress: string;
  receivedAt: string;
  currentFolder: string;
  reasonHidden: string | null;
  explanation: string;
  factors: ScoreFactor[];
  topics: ScoreTopic[];
  confidence: number;
}

export interface ExecutiveSummary {
  reportDate: string;
  totalProcessed: number;
  totalHidden: number;
  surfacedToInbox: number;
  potentiallyValuable: number;
  mediumValue: number;
  deletedFlagged: number;
  topThemes: string[];
}

export interface MissedOpportunitiesReport {
  summary: ExecutiveSummary;
  heatMap: HeatMapWord[];
  topMissed: MissedEmailRow[];
  deletedButValuable: MissedEmailRow[];
  learning: { restored: number; reopened: number; markedImportant: number; movedToInbox: number; surfacePreferences: number };
  generatedAt: string;
}

export interface TopicDrilldown {
  topic: string;
  reportDate: string;
  totalEmails: number;
  routingBreakdown: Record<string, number>;
  topSenders: Array<{ sender: string; count: number }>;
  topOrganizations: Array<{ org: string; count: number }>;
  emails: MissedEmailRow[];
  avgScore: number;
}

export type FeedbackAction = 'restored' | 'reopened' | 'marked_important' | 'moved_to_inbox';

export const missedOpportunitiesApi = {
  getReport: (date?: string) =>
    api.get<MissedOpportunitiesReport>(`${BASE}/report`, { params: date ? { date } : {} }).then((r) => r.data),
  getTopic: (topic: string, date?: string) =>
    api.get<TopicDrilldown>(`${BASE}/topic/${encodeURIComponent(topic)}`, { params: date ? { date } : {} }).then((r) => r.data),
  getEmail: (emailId: string) => api.get(`${BASE}/email/${emailId}`).then((r) => r.data),
  feedback: (emailId: string, action: FeedbackAction) =>
    api.post(`${BASE}/feedback`, { emailId, action }).then((r) => r.data),
  restorePreference: (emailId: string, patternType: 'sender' | 'domain' = 'sender') =>
    api.post(`${BASE}/restore-preference`, { emailId, patternType }).then((r) => r.data),
  send: (recipients?: string[]) => api.post(`${BASE}/send`, { recipients }).then((r) => r.data),
};
