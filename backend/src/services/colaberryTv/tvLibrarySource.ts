import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { displayTitle, parseYoutubeId, type TvVideo } from './tvModel';

/**
 * Where Colaberry TV gets its playlist: the media library, not a second table.
 *
 * Ali, 2026-11-15: "I want Colaberry TV videos picked from videos loaded to the Colaberry training
 * brand / library ... Instead of having to manage them in two places." So the library IS the
 * playlist. There is no on-air flag, no position and no audience here on purpose - every YouTube
 * link in the brand's library is on the TV, and the only place to change that is the library screen.
 *
 * YOUTUBE ONLY, and that is a property of the player, not a preference: the TV renders
 * `youtube-nocookie.com/embed/<id>` and takes its thumbnail from `img.youtube.com/vi/<id>`, so an
 * asset with no YouTube id has nothing to render. Uploaded files (`kind = 'file'`, e.g. the two
 * mp4s) therefore stay in the library and never reach the TV. Decided with Ali on 2026-11-15
 * against the alternative of teaching the player a second render path.
 */

/** The brand whose library feeds the TV. Config, not a hardcoded id, per 12-factor. */
const BRAND_SLUG = (process.env.COLABERRY_TV_BRAND_SLUG || 'colaberry-training').trim();

interface LinkRow {
  id: string;
  source_url: string | null;
  alt_text: string | null;
  duration_ms: number | null;
  created_at: string | Date;
}

function log(level: 'warn' | 'error', event: string, context: Record<string, unknown>): void {
  console[level](JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'colaberry-tv', event,
    outcome: 'failure', context,
  }));
}

/**
 * The brand id for BRAND_SLUG. A slug is unique per (tenant_id, slug), not globally, so more than
 * one row is genuinely ambiguous and we refuse to guess: both that and "no such brand" return null,
 * which surfaces as an empty playlist rather than someone else's videos.
 */
async function resolveBrandId(): Promise<string | null> {
  const found = await sequelize.query<{ id: string }>(
    'SELECT id FROM brands WHERE slug = :slug ORDER BY id',
    { replacements: { slug: BRAND_SLUG }, type: QueryTypes.SELECT },
  );
  if (found.length === 1) return found[0].id;
  log('error', found.length ? 'colaberry_tv_brand_ambiguous' : 'colaberry_tv_brand_missing',
    { brand_slug: BRAND_SLUG, matches: found.length });
  return null;
}

/**
 * Every live YouTube link in the brand's library, newest first.
 *
 * Deduplicated by video id: the library's unique index is on (brand_id, source_url), so the same
 * short pasted twice with different tracking parameters is two legitimate rows and one video. The
 * player follows the playing item by `id` across the 30s poll, so a duplicate id would make the
 * same short appear twice and could restart playback. First occurrence (newest) wins.
 *
 * Throws on a database failure: the route already classifies and logs that, and the campus keeps
 * the playlist it last had rather than blanking. A brand that does not resolve is config, not an
 * outage, and returns an empty playlist instead.
 */
export async function listLibraryShorts(): Promise<TvVideo[]> {
  const brandId = await resolveBrandId();
  if (!brandId) return [];

  const rows = await sequelize.query<LinkRow>(
    `SELECT id, source_url, alt_text, duration_ms, created_at
       FROM media_assets
      WHERE brand_id = :brandId
        AND kind = 'link'
        AND archived_at IS NULL
        AND source_url IS NOT NULL
      ORDER BY created_at DESC, id ASC`,
    { replacements: { brandId }, type: QueryTypes.SELECT },
  );

  const out: TvVideo[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of rows) {
    const youtubeId = parseYoutubeId(r.source_url ?? '');
    if (!youtubeId) { skipped += 1; continue; }
    if (seen.has(youtubeId)) continue;
    seen.add(youtubeId);
    out.push({
      id: r.id,
      youtube_id: youtubeId,
      title: displayTitle({ title: r.alt_text }),
      duration_s: r.duration_ms == null ? null : Math.max(1, Math.round(r.duration_ms / 1000)),
      created_at: new Date(r.created_at).toISOString(),
    });
  }

  if (skipped) {
    // Not an error: a library may hold Vimeo, Loom or a plain web link. Counted so "my video is
    // not on the TV" has an answer in the logs rather than needing a database session.
    log('warn', 'colaberry_tv_non_youtube_links_skipped', { brand_slug: BRAND_SLUG, skipped, kept: out.length });
  }
  return out;
}
