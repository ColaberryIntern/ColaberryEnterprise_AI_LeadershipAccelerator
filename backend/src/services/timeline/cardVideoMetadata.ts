/**
 * cardVideoMetadata — the card's authored video, read out of its metadata blob.
 *
 * This lived in timelineService until 2026-11-25, and moved for one reason: the
 * watch-progress service needs it (it is the ground truth for a video's real
 * duration), so `watchProgressService -> timelineService` was already an edge
 * in the graph. The moment the FEED wanted watch state computed for its tiles,
 * that edge would have had to run the other way too, and a cycle is forbidden
 * in this repo. The shared piece is this reader, so this is the third module
 * both sides can depend on.
 *
 * timelineService still re-exports `FeedVideo` and `videoFromMetadata`, so every
 * existing caller keeps its import exactly as it was.
 */

export interface FeedVideo {
  url: string;
  presenter: string | null;
  poster: string | null;
  title?: string | null;   // the specific video's own title — overlaid on the poster (personalized picks)
  // Real provider duration in seconds, when known (YouTube Data API for fixed video
  // cards; network_videos/podcasts catalogs for personalized picks). The watch-gate's
  // ground truth — see watchProgressService.resolveAuthoritativeDurationS. Absent/null
  // means "not known", never a guess.
  duration_seconds?: number | null;
}

/** PURE — a typed video from a card's metadata blob, or null. Only the URL is
 *  required; presenter/poster are optional display extras. */
export function videoFromMetadata(metadata: any): FeedVideo | null {
  const v = metadata && typeof metadata === 'object' ? metadata.video : null;
  if (!v || typeof v !== 'object' || typeof v.url !== 'string' || !v.url.trim()) return null;
  const duration = Number(v.duration_seconds);
  return {
    url: v.url.trim(),
    presenter: typeof v.presenter === 'string' && v.presenter.trim() ? v.presenter.trim() : null,
    poster: typeof v.poster === 'string' && v.poster.trim() ? v.poster.trim() : null,
    title: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : null,
    duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
  };
}
