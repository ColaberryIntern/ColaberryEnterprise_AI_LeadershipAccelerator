/**
 * ambientMedia — PURE. Recognise a Today-feed item that is a listen-to-earn
 * media item, and address its gate.
 *
 * A podcast or testimonial on the Today feed is ambient: its `id` is the feed
 * ref (`podcast:<providerId>`), it has no card row, and the card watch gate
 * cannot see it. This is the one place that knowledge lives on the client, so
 * the tile, the drawer and the shell all agree on what these items are and
 * which endpoints serve them.
 */
export type AmbientMediaKind = 'podcast' | 'testimonial';

export interface AmbientMediaRef { kind: AmbientMediaKind; id: string }

/** The feed item's ref parsed, or null for anything that is not ambient media. */
export function ambientMediaOf(card: { id: string; type?: string }): AmbientMediaRef | null {
  const i = card.id.indexOf(':');
  if (i <= 0) return null;
  const kind = card.id.slice(0, i);
  const id = card.id.slice(i + 1);
  if ((kind === 'podcast' || kind === 'testimonial') && id) return { kind, id };
  return null;
}

/** "listen" for a podcast, "watch" for a testimonial — the verb the copy uses. */
export function mediaVerb(kind: AmbientMediaKind): 'listen' | 'watch' {
  return kind === 'podcast' ? 'listen' : 'watch';
}
