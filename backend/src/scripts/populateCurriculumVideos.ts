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
  curateVideoFill, applyVideoFill, curateTopicPackFill, clearVideoCards, ApprovedVideo,
} from '../services/composer/blueprintService';
import { publishNewVideoCards } from '../services/composer/publishService';

function optVal(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

async function main(): Promise<void> {
  const programId = optVal('--program');
  const commit = has('--commit');
  const publishVideos = has('--publish-videos');
  const clearVideos = has('--clear-videos');
  const weeksArg = optVal('--weeks'); // e.g. "0-8" or "9,10,11,12"
  const onlyWeek = optVal('--week') != null ? Number(optVal('--week')) : null;
  const count = optVal('--count') != null ? Number(optVal('--count')) : 35;
  if (!programId) throw new Error('Usage: --program <uuid> [--commit] [--publish-videos|--clear-videos] [--week N | --weeks 0-8] [--count 35]');

  const inRange = (w: number): boolean => {
    if (onlyWeek != null) return w === onlyWeek;
    if (!weeksArg) return true;
    if (weeksArg.includes('-')) { const [a, b] = weeksArg.split('-').map(Number); return w >= a && w <= b; }
    return weeksArg.split(',').map(Number).includes(w);
  };

  const rows = await CurriculumBlueprint.findAll({ where: { program_id: programId }, order: [['week', 'ASC']] });
  const bps = rows.filter((b) => b.week != null && b.week >= 0 && b.week <= 12 && inRange(b.week));
  const mode = clearVideos ? 'CLEAR' : publishVideos ? 'PUBLISH' : 'CURATE';
  console.log(`[populate] program=${programId} mode=${mode} weeks=[${bps.map((b) => b.week).join(',')}] commit=${commit}`);
  if (!commit) console.log('[populate] DRY-RUN — nothing will be written. Add --commit to apply.');

  let totalAdded = 0;
  for (const bp of bps) {
    const week = bp.week as number;
    try {
      if (clearVideos) {
        if (commit) { const r = await clearVideoCards(bp.id); console.log(`[wk${week}] ${bp.title} — cleared ${r.removed} video card(s) from draft`); }
        else console.log(`[wk${week}] would clear video cards from draft (dry-run)`);
        continue;
      }
      if (publishVideos) {
        if (commit) { const r = await publishNewVideoCards(bp.id); totalAdded += r.created; console.log(`[wk${week}] ${bp.title} — published +${r.created} video card(s) live (skipped ${r.skipped} already live)`); }
        else { const n = ((bp.generated_plan?.cards || []) as any[]).filter((c) => c.type === 'video' && c.video_url).length; console.log(`[wk${week}] ${bp.title} — would publish up to ${n} video card(s) (dry-run)`); }
        continue;
      }
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
        console.log(`   applied: +${r.added} card(s) to draft; competency_coverage=${r.assessment.validation.competency_coverage}`);
      }
    } catch (e: any) {
      console.error(`[wk${week}] ERROR: ${e?.message || e}`);
    }
  }
  console.log(`\n[populate] done. total cards added: ${totalAdded}`);
  process.exit(0);
}

main().catch((e) => { console.error('[populate] fatal:', e); process.exit(1); });
