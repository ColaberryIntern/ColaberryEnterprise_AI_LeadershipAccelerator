import api from '../../../utils/api';

/**
 * The acquisition funnel: what happened to the people who clicked.
 *
 * Separate from the campaign funnel graph on the same tab, which is driven by the campaign engine
 * and has reported "no data available" since that engine was paused in August, however much ad
 * traffic actually arrives.
 */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** `sessions` for the ad-click row, `people` everywhere else. Shown, not assumed. */
  unit: 'people' | 'sessions';
  note: string;
}

export interface FunnelPageRow {
  slug: string;
  brand_slug: string | null;
  status: string;
  /** Null means the page carries no tracker, so its zeros mean "cannot be measured". */
  site_slug: string | null;
  visitors: number;
  sessions: number;
  views: number;
  ad_clicks: number;
  cta_clickers: number;
  engaged_visitors: number;
  identified_leads: number;
  last_seen: string | null;
}

export interface FunnelCampaignRow {
  utm_source: string | null;
  utm_campaign: string | null;
  signups: number;
  accounts: number;
  in_crm: number;
}

export interface AcquisitionFunnel {
  windowDays: number;
  stages: FunnelStage[];
  pages: FunnelPageRow[];
  untrackedPages: string[];
  campaigns: FunnelCampaignRow[];
  empty: boolean;
}

export async function fetchAcquisitionFunnel(days = 30): Promise<AcquisitionFunnel> {
  const res = await api.get('/api/admin/marketing/funnel/acquisition', { params: { days } });
  return res.data;
}
