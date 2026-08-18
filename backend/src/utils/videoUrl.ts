/**
 * videoUrl — backend-side detection of "is this link something our in-app
 * player can actually play".
 *
 * WHY THIS EXISTS: the intel pipeline stores every item's link at
 * `metadata.item.url`, but the timeline player reads ONLY `metadata.video.url`
 * (see `videoFromMetadata` in services/timeline/timelineService.ts, which is the
 * sole input to the frontend's `parseVideoUrl` / `<VideoEmbed>`). Nothing in the
 * codebase reads `item.url`. The result, found in the 2026-08-15 video audit:
 * 65 of 66 `ai_video_stream` cards held a real YouTube URL that never reached
 * the player, and 28 of those exposed no link in their body either, so the card
 * rendered a decorative play button that led nowhere.
 *
 * CONTRACT: the provider patterns here mirror `parseVideoUrl` in
 * frontend/src/utils/videoEmbed.ts, which remains the source of truth for how a
 * URL is actually embedded. They are duplicated rather than shared because the
 * two stacks compile under separate tsconfigs with no shared module path. If a
 * provider is added there, add it here too, or backend-generated cards will
 * silently stop marking that provider playable. The unit tests assert the two
 * lists agree on the providers they both claim to support.
 *
 * Deliberately CONSERVATIVE: only URLs a provider can embed return true. A plain
 * article link must NOT be marked playable, or every non-video intel card
 * (ai_news_flash, ai_research_digest, ...) would start rendering a dead "watch
 * on source" player box instead of its content.
 */

/** PURE — true when the URL is one the in-app player can embed and play. */
export function isPlayableVideoUrl(raw: string | null | undefined): boolean {
  const url = String(raw || '').trim();
  if (!url) return false;
  return (
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.test(url) ||
    /vimeo\.com\/(?:video\/)?(\d+)/.test(url) ||
    /loom\.com\/(?:share|embed)\/([\w-]+)/.test(url) ||
    /(?:wistia\.com|wi\.st)\/(?:medias|embed(?:\/iframe)?)\/([\w-]+)/.test(url) ||
    /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)
  );
}

/**
 * PURE — the `metadata.video` block for an intel item, or null when the item's
 * link is not playable. Shaped to what `videoFromMetadata` reads: `url` is the
 * only required field, `title` rides along so the player has a caption.
 */
export function videoMetadataForUrl(url: string | null | undefined, title?: string | null): { url: string; title: string | null } | null {
  if (!isPlayableVideoUrl(url)) return null;
  const trimmed = String(url).trim();
  const t = typeof title === 'string' && title.trim() ? title.trim() : null;
  return { url: trimmed, title: t };
}
