/**
 * Backfill script: attach REAL YouTube durations to authored video-bearing timeline
 * cards (video / ai_video_feedback / ai_video_stream) whose metadata.video.
 * duration_seconds is missing — the population these cards were originally created
 * with an LLM-GUESSED estimated_time and no real duration at all.
 *
 * Idempotent: a card already carrying a valid metadata.video.duration_seconds is
 * skipped with zero API calls, so re-running only ever fills remaining gaps and
 * never re-fetches or double-charges YouTube API quota.
 *
 * Usage:
 *   npx ts-node src/scripts/backfillTimelineVideoDurations.ts                 # dry run (default)
 *   BACKFILL_CONFIRM=yes npx ts-node src/scripts/backfillTimelineVideoDurations.ts
 */
import '../config/database'; // Initialize sequelize
import '../models'; // Load all models + associations
import TimelineCard from '../models/TimelineCard';
import { getVideoDurationSeconds } from '../services/composer/youtubeClient';
import { youtubeId } from '../services/timeline/videoDraftService';

const CONFIRM = process.env.BACKFILL_CONFIRM === 'yes';
const VIDEO_TYPES = ['video', 'ai_video_feedback', 'ai_video_stream'];

export interface BackfillSummary {
  scanned: number;
  updated: number;
  skipped_no_video: number;
  skipped_already_done: number;
  skipped_no_youtube_id: number;
  skipped_api_unavailable: number;
  errors: number;
}

/** PURE — does this card's video metadata still need a real duration attached? */
export function needsBackfill(metadata: any): boolean {
  const v = metadata && typeof metadata === 'object' ? metadata.video : null;
  if (!v || typeof v !== 'object' || typeof v.url !== 'string' || !v.url.trim()) return false;
  const d = (v as any).duration_seconds;
  return !(typeof d === 'number' && Number.isFinite(d) && d > 0);
}

interface CardLike {
  id: string;
  metadata: any;
  update: (attrs: { metadata: any; estimated_time: number }) => Promise<unknown>;
}

/** Testable core: takes the already-loaded card list so tests never touch Sequelize. */
export async function backfillCards(cards: CardLike[], confirm: boolean, log: (s: string) => void = console.log): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    scanned: 0, updated: 0, skipped_no_video: 0, skipped_already_done: 0,
    skipped_no_youtube_id: 0, skipped_api_unavailable: 0, errors: 0,
  };

  for (const card of cards) {
    summary.scanned++;
    const metadata = card.metadata && typeof card.metadata === 'object' ? { ...card.metadata } : {};
    const video = metadata.video && typeof metadata.video === 'object' ? { ...metadata.video } : null;

    if (!video || !video.url) { summary.skipped_no_video++; continue; }
    if (!needsBackfill(metadata)) { summary.skipped_already_done++; continue; }

    const id = youtubeId(video.url);
    if (!id) {
      summary.skipped_no_youtube_id++;
      log(`[skip] card ${card.id}: non-YouTube or unparsable video URL (${video.url})`);
      continue;
    }

    try {
      const seconds = await getVideoDurationSeconds(id);
      if (seconds == null) {
        summary.skipped_api_unavailable++;
        log(`[skip] card ${card.id}: duration API unavailable for ${id} (deleted/private video, quota, or no key)`);
        continue;
      }
      const estimated_time = Math.max(1, Math.round(seconds / 60));
      log(`[${confirm ? 'update' : 'would update'}] card ${card.id}: ${video.url} -> ${seconds}s (${estimated_time} min)`);
      summary.updated++;
      if (confirm) {
        await card.update({ metadata: { ...metadata, video: { ...video, duration_seconds: seconds } }, estimated_time });
      }
    } catch (err: any) {
      summary.errors++;
      log(`[error] card ${card.id}: ${err.message}`);
    }
  }

  return summary;
}

if (require.main === module) {
  (async () => {
    const cards = (await TimelineCard.findAll({ where: { type: VIDEO_TYPES } })) as unknown as CardLike[];
    const summary = await backfillCards(cards, CONFIRM);
    console.log(`\n[${CONFIRM ? 'WRITE DONE' : 'DRY RUN'}]`, JSON.stringify(summary));
    if (!CONFIRM) console.log('Set BACKFILL_CONFIRM=yes to write.');
    process.exit(0);
  })().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}
