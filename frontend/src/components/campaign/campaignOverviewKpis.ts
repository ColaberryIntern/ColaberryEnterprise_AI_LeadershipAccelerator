import { toDrilldownUrl, type DrilldownTarget } from '../../adminOs/drilldown';

/**
 * campaignOverviewKpis — the Campaign 360 Overview KPIs as data, each with a drill-down.
 *
 * WHY THIS IS A MODULE. The Overview tab rendered five near-identical KPI cards by hand, and
 * none of them went anywhere. A KPI with no drill-down is a number the reader has to take on
 * faith: they cannot open the rows behind it, cannot reconcile the count, and cannot tell
 * whether "Active: 42" means forty-two people or forty-two rows including duplicates. The
 * drill-down contract in adminOs/drilldown exists so that every headline number is a link to
 * exactly the population it counted, with the filters in the URL so Back works and the view
 * can be shared.
 *
 * Defining the KPIs as data is what makes "every KPI exposes a drill-down" a property a test
 * can assert over the whole set, rather than something checked card by card and forgotten the
 * next time one is added.
 */

export interface OverviewKpi {
  key: string;
  label: string;
  value: number;
  tone: 'default' | 'success' | 'info' | 'danger' | 'warning';
  drilldown: DrilldownTarget;
  /** Filters the drill-down MUST carry for its count to reconcile with this KPI. */
  requiredFilters: readonly string[];
}

export interface CampaignStatusCounts {
  active?: number;
  completed?: number;
  removed?: number;
  paused?: number;
}

/** The registry key these counts are drawn from. All are counts of campaign_leads rows. */
export const CAMPAIGN_LEAD_STATUS_METRIC = 'marketing.campaign_lead_status';

function target(campaignId: string, status?: string): DrilldownTarget {
  return {
    kind: 'people.roster',
    metricKey: CAMPAIGN_LEAD_STATUS_METRIC,
    // `campaign` is always present; `status` only when the KPI is a status slice. Omitting it
    // for the total (rather than writing status=all) keeps the roster's meaning "every lead in
    // this campaign" without a sentinel the roster would have to know about.
    filters: status ? { campaign: campaignId, status } : { campaign: campaignId },
  };
}

export function buildOverviewKpis(
  campaignId: string,
  counts: CampaignStatusCounts,
  totalEnrolled: number,
): OverviewKpi[] {
  // The tab used to read `removed || dnc`. There is no dnc bucket: `getCampaignStats` counts
  // campaign_leads by its five statuses and dnc is not one of them, so the card was promising
  // a number nothing measures. It is Removed, and it drills to status=removed.
  const removed = counts.removed ?? 0;

  return [
    {
      key: 'total',
      label: 'Total Enrolled',
      value: totalEnrolled,
      tone: 'default',
      drilldown: target(campaignId),
      requiredFilters: ['campaign'],
    },
    {
      key: 'active',
      label: 'Active',
      value: counts.active ?? 0,
      tone: 'success',
      drilldown: target(campaignId, 'active'),
      requiredFilters: ['campaign', 'status'],
    },
    {
      key: 'completed',
      label: 'Completed',
      value: counts.completed ?? 0,
      tone: 'info',
      drilldown: target(campaignId, 'completed'),
      requiredFilters: ['campaign', 'status'],
    },
    {
      key: 'removed',
      label: 'Removed',
      value: removed,
      tone: 'danger',
      drilldown: { ...target(campaignId), filters: { campaign: campaignId, status: 'removed' } },
      requiredFilters: ['campaign', 'status'],
    },
    {
      key: 'paused',
      label: 'Paused',
      value: counts.paused ?? 0,
      tone: 'warning',
      drilldown: target(campaignId, 'paused'),
      requiredFilters: ['campaign', 'status'],
    },
  ];
}

/** The URL a KPI card links to. Thin wrapper so the tab never builds a URL by hand. */
export function kpiHref(kpi: OverviewKpi): string {
  return toDrilldownUrl(kpi.drilldown);
}
