/**
 * Backfill script: stamps the resolved CAPE Phase 3 skill mapping (design doc §7)
 * onto every already-published Timeline Card that predates this phase (or was
 * published through a path — e.g. the Intelligence Pipeline — before T009's
 * afterCreate/afterUpdate hook was live). Reuses the exact same resolution function
 * (`resolveSkillMapping`) the live stamp hook and admin GET endpoint use, so a
 * backfilled card and a freshly-published one RESOLVE identically. Their WRITE
 * behavior for a `source:'none'` result intentionally differs from the live hook,
 * though (see the `resolved.source === 'none'` branch below): the live hook always
 * stamps (even an empty/'none' contract), but this script leaves that card
 * unstamped so it stays eligible for a future backfill run once its mapping gap is
 * fixed, rather than looking indistinguishable from a real resolved zero-credit type.
 *
 * Usage:
 *   npx ts-node src/scripts/backfillCurriculumSkillMaps.ts            # apply
 *   npx ts-node src/scripts/backfillCurriculumSkillMaps.ts --dry-run  # report only
 *
 * Idempotent — only ever selects `visibility:'published' AND skill_mapping IS NULL`
 * rows, so a card already stamped (by this script or the live hook) is never
 * re-selected, never re-written, and never double-counted. A second real run against
 * an unchanged data set is a true no-op (0 stamped).
 *
 * A card whose type/week genuinely has no resolvable mapping (`source:'none'` — only
 * possible for corrupted/legacy `type` values, since every real registered type now
 * has a T005 type-default row) is logged (`event:'backfill_unresolved_card'`) and
 * left unstamped, not silently dropped and not crash-the-batch — it stays visible for
 * manual triage and will be picked up by the next backfill run once its mapping gap
 * is fixed.
 */
import '../config/database'; // Initialize sequelize
import '../models'; // Load all models + associations
import TimelineCard from '../models/TimelineCard';
import { resolveSkillMapping } from '../services/cape/capeCurriculumSkillMapService';

export interface BackfillableCard {
  id: string;
  type: string;
  week: number | null;
  visibility: string;
  skill_mapping: any;
  update: (patch: Record<string, any>) => Promise<any>;
}

export interface BackfillSummary {
  total: number;
  stamped: number;
  skipped_already_done: number;
  skipped_unresolved: number;
  errors: number;
}

/** A card needs backfilling only if it's published AND has never been stamped. */
export function needsBackfill(card: Pick<BackfillableCard, 'visibility' | 'skill_mapping'>): boolean {
  return card.visibility === 'published' && (card.skill_mapping === null || card.skill_mapping === undefined);
}

/**
 * Takes an already-loaded card list (so this is directly unit-testable without
 * mocking Sequelize's `TimelineCard.findAll` static) and either reports (`apply:
 * false`) or actually writes (`apply: true`) each card's resolved mapping.
 */
export async function backfillCards(
  cards: BackfillableCard[],
  apply: boolean,
  log: (message: string) => void,
): Promise<BackfillSummary> {
  let stamped = 0;
  let skippedAlreadyDone = 0;
  let skippedUnresolved = 0;
  let errors = 0;

  for (const card of cards) {
    if (!needsBackfill(card)) {
      skippedAlreadyDone += 1;
      continue;
    }
    try {
      const resolved = await resolveSkillMapping({ cardId: card.id, typeSlug: card.type, weekNumber: card.week });
      if (resolved.source === 'none') {
        skippedUnresolved += 1;
        log(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
          event: 'backfill_unresolved_card', outcome: 'partial',
          context: { card_id: card.id, type: card.type, week: card.week },
        }));
        continue;
      }
      if (apply) {
        await card.update({
          skill_mapping: resolved.contract,
          skill_mapping_source: resolved.source,
          skill_mapping_map_id: resolved.map_id,
          skill_mapping_version: resolved.version,
          skill_mapping_resolved_at: new Date(),
        });
      }
      stamped += 1;
    } catch (err: any) {
      errors += 1;
      log(`[!] card ${card.id} (type=${card.type}, week=${card.week}): ${err?.message}`);
    }
  }

  return { total: cards.length, stamped, skipped_already_done: skippedAlreadyDone, skipped_unresolved: skippedUnresolved, errors };
}

const DRY = process.argv.includes('--dry-run');

async function main() {
  const apply = !DRY;
  console.log(`[Backfill] Curriculum-skill-map backfill starting${DRY ? ' (DRY RUN — no writes)' : ''}...`);

  const cards = await TimelineCard.findAll({
    where: { visibility: 'published', skill_mapping: null as any },
    attributes: ['id', 'type', 'week', 'visibility', 'skill_mapping'],
  });
  console.log(`[Backfill] Found ${cards.length} published card(s) with no stamped skill mapping.`);

  const summary = await backfillCards(cards as unknown as BackfillableCard[], apply, (m) => console.log(m));
  console.log(
    `[Backfill] ${DRY ? 'would stamp' : 'stamped'}: ${summary.stamped}, already done: ${summary.skipped_already_done}, ` +
    `unresolved (logged, left unstamped): ${summary.skipped_unresolved}, errors: ${summary.errors}, total scanned: ${summary.total}`,
  );
  console.log('[Backfill] Complete.');
  process.exit(summary.errors > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Backfill] Fatal error:', err);
    process.exit(1);
  });
}
