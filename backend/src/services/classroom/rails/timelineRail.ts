import { getTodayPage } from '../../timeline/todayFeedComposer';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';

/**
 * Today's plan, brought into the classroom.
 *
 * WHAT THIS REPLACED, AND WHY. The first version was a week navigator: twelve
 * tiles, one per program week, with "Finish it" on any week that still had work
 * open. It answered "where am I in the programme". That is a question the week
 * pager at the top of the page already answers, and it is not the question a
 * student opening the classroom has. The one they have is "what am I supposed
 * to do today", and the Today screen already computes exactly that.
 *
 * SO THIS IS THE TODAY FEED, NOT A SECOND OPINION ABOUT IT. It reads
 * `getTodayPage`, the same composer the Today screen renders from, so the two
 * can never disagree about what today's plan is. Building a parallel "what to
 * do next" here would have produced a rail that quietly contradicted the page
 * it was copied from, which is worse than not having the rail.
 *
 * REAL ARTWORK. `TodayFeedItem.image` is the card's own image, so these tiles
 * carry the same picture the student sees on the Today screen and in the week
 * feed. Null is normal and falls back to a glyph chosen from the item's kind.
 */

/** A rail, not the whole Today screen. */
const TILE_LIMIT = 8;

/** Per-kind marks, so a scan of the rail reads as a shape rather than a list. */
const KIND_GLYPH: Record<string, string> = {
  video: '\u{25B6}',
  podcast: '\u{1F3A7}',
  blog: '\u{1F4F0}',
  article: '\u{1F4F0}',
  card: '\u{1F4D8}',
  quiz: '\u{2705}',
  lab: '\u{1F9EA}',
  reflection: '\u{1F4AD}',
};

function glyphFor(item: { kind?: string | null; type?: string | null }): string {
  return KIND_GLYPH[String(item.kind ?? '')]
    ?? KIND_GLYPH[String(item.type ?? '')]
    ?? '\u{1F4D8}';
}

/** "12 min" — the stamp students actually decide on. */
function stampFor(minutes: number | null | undefined, status: string | null | undefined): string | null {
  if (String(status ?? '') === 'completed') return 'DONE';
  const m = Number(minutes ?? 0);
  return m > 0 ? `${m} MIN` : null;
}

export async function resolveTimelineRail(ctx: RailContext): Promise<Rail | null> {
  // readOnly so drawing a rail never advances anybody's feed state. The Today
  // screen owns that side effect; a classroom rail must not consume the plan
  // simply by being rendered next to a curriculum card.
  const page = await getTodayPage(ctx.enrollmentId, 0, TILE_LIMIT, { readOnly: true });
  const items = (page?.items ?? []).slice(0, TILE_LIMIT);
  if (items.length === 0) return null;

  const tiles: RailTile[] = items.map((item: any, i: number) => {
    const done = String(item.status ?? '') === 'completed';
    return {
      id: String(item.ref ?? item.card_id ?? `today-${i}`),
      title: item.title ?? 'Untitled',
      detail: item.subtitle ?? item.description ?? null,
      meta: item.type ? String(item.type).replace(/_/g, ' ') : null,
      image_url: item.image ?? null,
      glyph: glyphFor(item),
      stamp: stampFor(item.estimated_time, item.status),
      action: item.card_id
        ? {
          label: done ? 'Open again' : 'Open',
          href: `/portal/today?card=${encodeURIComponent(String(item.card_id))}`,
          kind: done ? 'quiet' : 'primary',
        }
        : { label: 'Open Today', href: '/portal/today', kind: 'quiet' },
      featured: i === 0 && !done,
    };
  });

  const minutes = items.reduce((n: number, it: any) => n + Number(it.estimated_time ?? 0), 0);

  return omitIfEmpty({
    surface: 'timeline',
    label: "Today's plan",
    count_label: minutes > 0 ? `${tiles.length} things, about ${minutes} min` : `${tiles.length} things`,
    href: '/portal/today',
    tiles,
  });
}
