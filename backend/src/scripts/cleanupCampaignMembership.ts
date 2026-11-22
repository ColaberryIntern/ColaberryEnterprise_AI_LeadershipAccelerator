/**
 * OH1w: finish the campaign members who are stuck "in" a campaign with nothing left to send,
 * then switch on the membership rules. DRY RUN by default; --apply only on Ali's word.
 *
 *   node dist/scripts/cleanupCampaignMembership.js            # dry run: the numbers, by category and campaign
 *   node dist/scripts/cleanupCampaignMembership.js --apply    # finishes categories 1, 2b, 3b; sets the settings; turns the rules on
 *
 * Categories (every enrolled/active campaign_leads row, CATEGORY_SQL):
 *   1   the campaign is over (completed or archived)                     -> finished
 *   2a  the campaign is paused/draft and still has sends queued           -> KEPT (resuming it sends them)
 *   2b  the campaign is paused/draft and nothing is queued                -> finished
 *   3a  running campaign, enrolled, never sent anything (a ramp queue)    -> KEPT
 *   3b  running campaign, every step already handled                      -> finished
 *   4   running campaign, sends still queued                              -> KEPT
 * "Finished" = status 'completed', outcome 'cleanup', the category recorded in metadata.exit.
 * Nothing is deleted and no message is cancelled (categories that keep queued sends are kept).
 *
 * --apply also: marks the Open House countdown, Payment Readiness and Class Readiness campaigns
 * takes_precedence (joining them moves a person out of any other campaign), sets the countdown's
 * "when someone finishes" to move into the Open House follow-up, and turns on
 * campaign_membership_rules_enabled. Idempotent: a second run finds nothing to finish.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { MEMBERSHIP_RULES_SETTING } from '../services/campaignMembership';
import { OPEN_HOUSE_COUNTDOWN_KEY } from '../services/openHouseCountdown';
import { OPEN_HOUSE_FOLLOWUP_KEY } from '../services/openHouseFollowup';

export const FINISH_CATEGORIES = ['1', '2b', '3b'] as const;
export const PRECEDENCE_CAMPAIGN_NAMES = ['Payment Readiness Campaign', 'Class Readiness Campaign'];

export const CATEGORY_SQL = `
WITH m AS (
  SELECT cl.id, cl.lead_id, cl.campaign_id, cl.status AS member_status, c.name, c.status AS campaign_status, c.archived_at,
         EXISTS (SELECT 1 FROM scheduled_emails se WHERE se.lead_id = cl.lead_id AND se.campaign_id = cl.campaign_id
                  AND se.status IN ('pending', 'processing', 'paused')) AS has_pending,
         EXISTS (SELECT 1 FROM scheduled_emails se WHERE se.lead_id = cl.lead_id AND se.campaign_id = cl.campaign_id) AS has_any
    FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id
   WHERE cl.status IN ('enrolled', 'active')
)
SELECT id, lead_id, campaign_id, name, campaign_status, CASE
    WHEN archived_at IS NOT NULL OR campaign_status = 'completed' THEN '1'
    WHEN campaign_status IN ('paused', 'draft') AND has_pending THEN '2a'
    WHEN campaign_status IN ('paused', 'draft') THEN '2b'
    WHEN has_pending THEN '4'
    WHEN member_status = 'enrolled' AND NOT has_any THEN '3a'
    ELSE '3b'
  END AS category
  FROM m`;

const LABEL: Record<string, string> = {
  '1': 'campaign over (completed/archived) -> finish',
  '2a': 'paused/draft campaign, sends still queued -> KEEP',
  '2b': 'paused/draft campaign, nothing queued -> finish',
  '3a': 'running campaign, enrolled, never sent anything -> KEEP',
  '3b': 'running campaign, all steps done -> finish',
  '4': 'running campaign, sends still queued -> KEEP',
};

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const tag = apply ? '' : '[dry run] ';
  const byCat = await sequelize.query<{ category: string; rows: number; people: number }>(
    `SELECT category, COUNT(*)::int AS rows, COUNT(DISTINCT lead_id)::int AS people FROM (${CATEGORY_SQL}) x GROUP BY category ORDER BY category`,
    { type: QueryTypes.SELECT },
  );
  for (const c of byCat) console.log(`${tag}${c.category.padEnd(3)} ${String(c.rows).padStart(6)} rows, ${String(c.people).padStart(6)} people  ${LABEL[c.category]}`);
  const top = await sequelize.query<{ category: string; name: string; rows: number }>(
    `SELECT category, name, COUNT(*)::int AS rows FROM (${CATEGORY_SQL}) x WHERE category IN (:cats)
      GROUP BY category, name ORDER BY rows DESC LIMIT 15`,
    { replacements: { cats: [...FINISH_CATEGORIES] }, type: QueryTypes.SELECT },
  );
  console.log(`${tag}largest groups to finish:`);
  for (const t of top) console.log(`${tag}  ${t.category.padEnd(3)} ${String(t.rows).padStart(6)}  ${t.name}`);
  const total = byCat.filter((c) => (FINISH_CATEGORIES as readonly string[]).includes(c.category)).reduce((n, c) => n + c.rows, 0);
  console.log(`${tag}would finish ${total} memberships; keeps every row with sends still queued`);
  if (!apply) return;

  const finished = await sequelize.transaction(async (t) => {
    const [, n] = await sequelize.query(
      `UPDATE campaign_leads cl SET status = 'completed', completed_at = NOW(), outcome = COALESCE(cl.outcome, 'cleanup'),
              metadata = COALESCE(cl.metadata, '{}'::jsonb) || jsonb_build_object('exit', jsonb_build_object('reason', 'cleanup', 'category', x.category, 'at', NOW()))
         FROM (${CATEGORY_SQL}) x
        WHERE cl.id = x.id AND x.category IN (:cats) AND cl.status IN ('enrolled', 'active')`,
      { replacements: { cats: [...FINISH_CATEGORIES] }, transaction: t },
    ) as unknown as [unknown, unknown];
    const mergeSettings = async (where: string, repl: Record<string, unknown>, patch: Record<string, unknown>) => {
      await sequelize.query(
        `UPDATE campaigns SET settings = COALESCE(settings, '{}'::jsonb) || CAST(:patch AS jsonb), updated_at = NOW() WHERE ${where}`,
        { replacements: { ...repl, patch: JSON.stringify(patch) }, transaction: t },
      );
    };
    await mergeSettings(`settings->>'campaign_key' = :key AND archived_at IS NULL`, { key: OPEN_HOUSE_COUNTDOWN_KEY },
      { takes_precedence: true, on_complete: { action: 'move', move_to_campaign_key: OPEN_HOUSE_FOLLOWUP_KEY } });
    await mergeSettings(`name IN (:names) AND archived_at IS NULL`, { names: PRECEDENCE_CAMPAIGN_NAMES }, { takes_precedence: true });
    return affectedRowCount(n);
  });
  console.log(`finished ${finished} memberships; countdown, payment and class readiness take precedence; countdown moves people to the follow-up`);
  const { setSetting } = await import('../services/settingsService');
  await setSetting(MEMBERSHIP_RULES_SETTING, true);
  console.log(`${MEMBERSHIP_RULES_SETTING} = true: one campaign at a time, the hourly exit sweep and the Explorer Growth hold are on`);
}

/**
 * Rows touched by a raw UPDATE. On Postgres, Sequelize hands back the driver's Result object
 * ({ rowCount, ... }) as the second element, not a number; `Number()` of that object is NaN,
 * which is what the Nov 21 apply printed for 15,830 finished rows. Other dialects return a number.
 */
export function affectedRowCount(meta: unknown): number {
  if (typeof meta === 'number' && Number.isFinite(meta)) return meta;
  const rc = (meta as { rowCount?: unknown } | null | undefined)?.rowCount;
  return typeof rc === 'number' && Number.isFinite(rc) ? rc : 0;
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error('[cleanupCampaignMembership] failed:', err?.message); process.exit(1); });
}
