import cron from 'node-cron';
import { instrumentCronJob } from '../cronInstrumentation';
import { readMetaAdsConfig, syncMetaSpend } from '../marketing/adSpend/metaSpendSync';

/**
 * Daily Meta spend pull, so the profitability report is current without anyone pressing a button.
 *
 * 11:40 UTC = 5:40 AM CST / 6:40 AM CDT: after Meta has closed the previous day for the account's
 * Central timezone, and before the team starts work. It re-pulls the trailing 30 days (see
 * metaSpendSync.ts for why) and is idempotent, so a missed run is repaired by the next one.
 *
 * Dormant until configured: with no META_ADS_ACCESS_TOKEN / META_AD_ACCOUNT_ID it returns without
 * calling Meta or writing a sync row, so an unconfigured install does not log a failure every day.
 */
export const AD_SPEND_SYNC_SCHEDULE = '40 11 * * *';
export const AD_SPEND_SYNC_AGENT = 'MetaAdSpendSync';

/**
 * Tracked under the ai_agents row MetaAdSpendSync (agentRegistrySeed.ts), which ships
 * `enabled: false` like the Growth Journey rows: a disabled row is a logged skip in
 * instrumentCronJob. So turning the daily pull on is two steps, both visible: set the two env
 * values, and enable the row in Admin > Agents. "Sync now" on the Ad spend page works without
 * the row being enabled.
 */
export function registerAdSpendCrons(): void {
  cron.schedule(AD_SPEND_SYNC_SCHEDULE, () => {
    if (!readMetaAdsConfig().configured) return;
    // A literal, not AD_SPEND_SYNC_AGENT: the cron registry guard reads names from source, and a
    // constant resolves to no name it can match against the seed row.
    instrumentCronJob('MetaAdSpendSync', async () => {
      const result = await syncMetaSpend({ days: 30, triggeredBy: 'schedule' });
      if (result.outcome === 'failure') throw new Error(`[${result.errorClass}] ${result.error}`);
    }).catch((err) => {
      console.error('[Scheduler] MetaAdSpendSync failed:', err);
    });
  });
}
