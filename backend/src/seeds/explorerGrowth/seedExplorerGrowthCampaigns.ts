import { Campaign, FollowUpSequence } from '../../models';
import { EXPLORER_CAMPAIGNS, EXPLORER_CAMPAIGN_TYPE } from './explorerCampaignDefinitions';
import { EXPLORER_SEQUENCES } from './explorerSequenceDefinitions';

/**
 * Explorer Growth OS — EPIC 6 T003. Seed the eight campaigns and their sequences.
 *
 * RUNS ON EVERY SERVER BOOT via `seedAllCampaigns()` (`server.ts:2884`). Everything
 * below is shaped by that: it must be idempotent, it must never override an
 * operator's hand, and one failure must not take down the other seven.
 *
 * ─── THE ONE THING THAT ACTUALLY STOPS A SEND ───────────────────────────────
 *
 * `follow_up_sequences.is_active = false`.
 *
 * `sequenceService.ts:303-304` throws `Sequence not found or inactive` BEFORE any
 * `ScheduledEmail` row is created. It is the single first-enqueue gate that every
 * campaign enrollment path funnels through, and `POST /api/admin/production-activate`
 * does not touch that table.
 *
 * This matters more than it looks, because the campaign-level settings are weaker
 * than they appear:
 *   - `approval_status: 'draft'` is read by NO send path at all.
 *   - `status: 'draft'` is cleared for EVERY campaign by that one admin call, and
 *     `schedulerService.ts:3251-3261` auto-activates anything named `%Cold Outbound%`.
 *   - `settings.test_mode_enabled` is cleared by the same admin call.
 *   - `alumniReferralService.ts:226-231` falls back to the newest ACTIVE
 *     `warm_nurture` campaign and enrolls a referred lead into it — and these
 *     eight, freshly seeded, are the newest. That path is HTTP-reachable by an
 *     alumnus with no admin involvement.
 *
 * So: activate these campaigns and one alumni referral is enough to enrol a real
 * person. What stops it is `is_active: false` on the sequence.
 *
 * ─── AND WHY IT IS WRITTEN HERE, BY HAND ────────────────────────────────────
 *
 * `sequenceService.createSequence()` MUST NOT be used. It hardcodes
 * `is_active: true` (`sequenceService.ts:227`) and its `CreateSequenceParams` type
 * has no `is_active` field, so a definition carrying `false` is silently dropped —
 * no type error, because the definition is a variable and excess-property checking
 * never fires. Eight live sequences, `tsc` clean, every test green, on the boot
 * path. The safe value is not the default (`FollowUpSequence.ts:71-75` defaults it
 * to `true`), so it is stated explicitly on both the create and the update path.
 */

/** Set once at creation, owned by a human thereafter. Never written on update. */
const INERT_ON_CREATE = {
  status: 'draft',
  approval_status: 'draft',
  campaign_mode: 'standard',
} as const;

export interface SeedResult {
  created: number;
  updated: number;
  failed: { key: string; error: string }[];
}

/**
 * Find a campaign by its key, never by its name.
 *
 * `campaigns` has no key column, so this reads `settings.campaign_key`. Names are
 * human-editable labels — someone renaming a campaign in Admin must not orphan it
 * from the Governor.
 */
async function findByKey(key: string): Promise<Campaign | null> {
  return Campaign.findOne({ where: { settings: { campaign_key: key } } as any });
}

/**
 * The sequence for one campaign.
 *
 * Creates with `is_active: false`, and — critically — RE-ASSERTS it on a
 * pre-existing row. A sequence carrying one of these eight names might exist from
 * an earlier partial run, or from a rollback that removed the campaigns but left
 * the sequences; inheriting whatever state it is in would make the invariant a
 * matter of history rather than of code.
 */
async function upsertSequence(name: string): Promise<FollowUpSequence> {
  const def = EXPLORER_SEQUENCES.find((s) => s.name === name);
  if (!def) throw new Error(`no sequence definition named "${name}"`);

  const existing = await FollowUpSequence.findOne({ where: { name } });
  if (existing) {
    // is_active is re-asserted, not assumed. Steps and description are refreshed
    // so a definition edit reaches the database; nothing else is touched.
    await existing.update({
      description: def.description,
      steps: def.steps as any,
      is_active: false,
    } as any);
    return existing;
  }

  return FollowUpSequence.create({
    name: def.name,
    description: def.description,
    steps: def.steps as any,
    // EXPLICIT. The model defaults this to true; omitting it ships the sequence live.
    is_active: false,
  } as any);
}

/**
 * Seed one campaign. Create sets the inert properties; update never touches them.
 *
 * THE SETTINGS WRITE IS A MERGE, ALWAYS. Sequelize replaces a JSONB column
 * wholesale, and `settings` holds BOTH `campaign_key` and `test_mode_enabled`. A
 * whole-object write drops the key and the test-mode flag together — then the next
 * boot's lookup misses, creates a duplicate row, and leaves the paused original
 * invisible to both the seed and the Governor. One careless line, three failures.
 */
async function seedOne(
  def: (typeof EXPLORER_CAMPAIGNS)[number],
  result: SeedResult,
): Promise<void> {
  const sequence = await upsertSequence(def.sequenceName);
  const existing = await findByKey(def.key);

  if (existing) {
    const currentSettings = (existing.get('settings') as Record<string, any>) ?? {};
    await existing.update({
      description: def.description,
      sequence_id: sequence.id,
      // MERGE, never replace. Preserves campaign_key and test_mode_enabled even
      // though neither is written here.
      settings: { ...currentSettings, explorer_tier: def.tier },
      // status, approval_status and settings.test_mode_enabled are DELIBERATELY
      // ABSENT. An operator's pause must survive every boot.
    } as any);
    result.updated += 1;
    return;
  }

  await Campaign.create({
    name: def.name,
    description: def.description,
    type: EXPLORER_CAMPAIGN_TYPE,
    sequence_id: sequence.id,
    ...INERT_ON_CREATE,
    settings: {
      campaign_key: def.key,
      test_mode_enabled: true,
      explorer_tier: def.tier,
    },
  } as any);
  result.created += 1;
}

/**
 * Seed all eight.
 *
 * Each is wrapped individually: this runs on the boot path, and one bad definition
 * must not cost the other seven. Failures are collected and reported rather than
 * thrown — a seed that aborts the boot is worse than a seed that reports a gap.
 */
export async function seedExplorerGrowthCampaigns(): Promise<SeedResult> {
  const result: SeedResult = { created: 0, updated: 0, failed: [] };

  for (const def of EXPLORER_CAMPAIGNS) {
    try {
      await seedOne(def, result);
    } catch (err: any) {
      result.failed.push({ key: def.key, error: err?.message ?? String(err) });
      console.warn(`[Seed] Explorer campaign "${def.key}" failed:`, err?.message);
    }
  }

  console.log(
    `[Seed] Explorer campaigns: ${result.created} created, ${result.updated} updated, ${result.failed.length} failed`,
  );
  return result;
}
