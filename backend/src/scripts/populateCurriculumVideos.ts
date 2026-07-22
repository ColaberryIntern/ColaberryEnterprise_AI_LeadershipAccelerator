/**
 * populateCurriculumVideos — one-off, idempotent: fill each week's competency
 * gaps with curated short YouTube videos (weeks 1-12, ~90 min budget each) and
 * add a "latest in AI" pack to Week 0. Every video card is tagged with the exact
 * competency it covers, so coverage moves for a real reason.
 *
 * DRY-RUN by default (prints what it WOULD add, writes nothing). Pass --commit to
 * apply, and --publish to also push the week to the live Timeline. Re-runnable:
 * applyVideoFill de-dupes by video URL, so a second run adds nothing new.
 *
 *   node dist/scripts/populateCurriculumVideos.js --program <uuid> [--commit] [--publish] [--week N] [--count 35]
 */
import CurriculumBlueprint from '../models/CurriculumBlueprint';
import {
  curateVideoFill, applyVideoFill, curateTopicPackFill, ApprovedVideo,
} from '../services/composer/blueprintService';
import { publishBlueprint } from '../services/composer/publishService';

function optVal(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

async function main(): Promise<void> {
  const programId = optVal('--program');
  const commit = has('--commit');
  const doPublish = has('--publish');
  const onlyWeek = optVal('--week') != null ? Number(optVal('--week')) : null;
  const count = optVal('--count') != null ? Number(optVal('--count')) : 35;
  if (!programId) throw new Error('Usage: --program <uuid> [--commit] [--publish] [--week N] [--count 35]');

  const rows = await CurriculumBlueprint.findAll({ where: { program_id: programId }, order: [['week', 'ASC']] });
  const bps = rows.filter((b) => b.week != null && b.week >= 0 && b.week <= 12 && (onlyWeek == null || b.week === onlyWeek));
  console.log(`[populate] program=${programId} weeks=[${bps.map((b) => b.week).join(',')}] commit=${commit} publish=${doPublish}`);
  if (!commit) console.log('[populate] DRY-RUN — nothing will be written. Add --commit to apply.');

  let totalAdded = 0;
  for (const bp of bps) {
    const week = bp.week as number;
    try {
      let approved: ApprovedVideo[] = [];
      let usedMin = 0; let source = 'none'; let label = '';

      if (week === 0) {
        const { pack } = await curateTopicPackFill(bp.id, { count });
        approved = pack.videos.map((v) => ({ video_url: v.url, title: v.title, channel: v.channel, duration_seconds: v.duration_seconds, competency: v.competency, competency_label: v.competency_label }));
        usedMin = pack.used_minutes; source = pack.source; label = `topic pack (${approved.length} videos)`;
      } else {
        const { gaps, curation } = await curateVideoFill(bp.id, { budgetMinutes: 90 });
        approved = curation.videos.map((v) => ({ video_url: v.url, title: v.title, channel: v.channel, duration_seconds: v.duration_seconds, competency: v.competency, competency_label: v.competency_label }));
        usedMin = curation.used_minutes; source = curation.source; label = `${gaps.length} gaps -> ${approved.length} videos`;
      }

      console.log(`\n[wk${week}] ${bp.title} — ${label} · ${usedMin} min · source=${source}`);
      approved.forEach((v) => console.log(`   - ${v.competency_label}: ${v.title.slice(0, 62)} (${v.video_url})`));

      if (commit && approved.length) {
        const r = await applyVideoFill(bp.id, approved);
        totalAdded += r.added;
        console.log(`   applied: +${r.added} card(s); competency_coverage=${r.assessment.validation.competency_coverage}`);
        if (doPublish) {
          const p = await publishBlueprint(bp.id, true);
          console.log(`   published: ${JSON.stringify(p).slice(0, 140)}`);
        }
      }
    } catch (e: any) {
      console.error(`[wk${week}] ERROR: ${e?.message || e}`);
    }
  }
  console.log(`\n[populate] done. total cards added: ${totalAdded}`);
  process.exit(0);
}

main().catch((e) => { console.error('[populate] fatal:', e); process.exit(1); });
