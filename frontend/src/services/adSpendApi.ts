import api from '../utils/api';

// Ad spend ledger + ad profitability. Mirrors backend/src/services/marketing/adSpend/*.
// Money: the report is in DOLLARS; the ledger stores and accepts CENTS (amountCents).

export type Verdict = 'profitable' | 'paying_back' | 'slow' | 'no_payers' | 'no_signups' | 'no_spend';
export type SpendSource = 'meta_api' | 'csv' | 'manual';
export type Platform = 'meta' | 'google' | 'linkedin' | 'tiktok' | 'other';

export interface SourceSplit {
  utmSource: string | null;
  signups: number;
  payers: number;
  mrr: number;
  collected: number;
  spend: number | null;
  costPerSignup: number | null;
}

export interface ProfitRow {
  key: string;
  campaignRef: string | null;
  campaignName: string | null;
  platform: string | null;
  spend: number;
  signups: number;
  payers: number;
  mrr: number;
  collected: number;
  costPerSignup: number | null;
  cac: number | null;
  roas: number | null;
  profit: number;
  paybackMonths: number | null;
  verdict: Verdict;
  bySource: SourceSplit[];
  daysWithSpend: number;
  spendSources: SpendSource[];
}

export interface ProfitTotals {
  spend: number;
  unmatchedSpend: number;
  signups: number;
  payers: number;
  mrr: number;
  collected: number;
  costPerSignup: number | null;
  cac: number | null;
  roas: number | null;
  profit: number;
  paybackMonths: number | null;
  verdict: Verdict;
}

export interface MetaSyncStatus {
  meta: { configured: boolean; accountId: string | null; reason: string | null };
  lastSync: null | {
    startedAt: string; finishedAt: string | null; outcome: string; rowsWritten: number;
    errorClass: string | null; error: string | null; rangeStart: string | null; rangeEnd: string | null;
  };
}

export interface AdProfitability {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  rows: ProfitRow[];
  totals: ProfitTotals;
  unspentSignups: number;
  /** Already paying before they filled in the form; not counted as ad signups. */
  existingCustomers: number;
  coverage: { daysCovered: number; windowDays: number; lastDayRecorded: string | null; staleDays: number | null };
  paybackTargetMonths: number;
  sync: MetaSyncStatus;
}

export interface SpendRecord {
  id: number;
  platform: Platform;
  accountId: string | null;
  campaignRef: string;
  campaignName: string | null;
  placement: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  impressions: number | null;
  clicks: number | null;
  source: SpendSource;
  enteredBy: string | null;
  note: string | null;
  updatedAt: string;
}

export interface KnownCampaign { utmSource: string | null; utmCampaign: string; signups: number; lastSignup: string }

export interface SpendLedger {
  from: string;
  to: string;
  records: SpendRecord[];
  /** All rows in the range; `records` holds the newest 500 of them. */
  total: number;
  sync: MetaSyncStatus;
  knownCampaigns: KnownCampaign[];
}

export interface NewSpend {
  platform: Platform;
  campaignRef: string;
  campaignName?: string | null;
  placement?: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  note?: string | null;
}

export interface ImportResult {
  rows: number;
  totalCents: number;
  errors: Array<{ line: number; message: string }>;
  skippedTotals: number;
  mapping: Record<string, string | null>;
  preview: Array<NewSpend & { impressions?: number | null; clicks?: number | null }>;
  written: number;
  dryRun: boolean;
}

export interface SyncResult {
  outcome: 'success' | 'failure' | 'skipped';
  rowsWritten: number;
  /**
   * API rows the backend could not parse, and therefore did NOT store. Optional only
   * because a browser may be talking to a backend deployed before 2026-11-13; treat
   * undefined as "this build cannot tell you", not as zero.
   */
  rowsSkipped?: number;
  rangeStart: string;
  rangeEnd: string;
  errorClass: string | null;
  error: string | null;
}

export async function getAdProfitability(days: number): Promise<AdProfitability> {
  return (await api.get('/api/admin/marketing/ad-profitability', { params: { days } })).data;
}

export async function getSpendLedger(): Promise<SpendLedger> {
  return (await api.get('/api/admin/marketing/ad-spend')).data;
}

export async function addSpend(entry: NewSpend): Promise<{ written: number }> {
  return (await api.post('/api/admin/marketing/ad-spend', entry)).data;
}

export async function deleteSpend(id: number): Promise<void> {
  await api.delete(`/api/admin/marketing/ad-spend/${id}`);
}

export async function importSpendCsv(csv: string, dryRun: boolean, platform: Platform = 'meta'): Promise<ImportResult> {
  return (await api.post('/api/admin/marketing/ad-spend/import', { csv, dryRun, platform })).data;
}

export async function syncMetaSpend(days = 30): Promise<SyncResult> {
  return (await api.post('/api/admin/marketing/ad-spend/sync-meta', { days })).data;
}

/** The server's field-level 400 messages, or a generic line. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { issues?: Array<{ path: string; message: string }>; error?: string } } })?.response?.data;
  if (data?.issues?.length) return data.issues.map((i) => i.message).join('. ');
  return data?.error ?? fallback;
}
