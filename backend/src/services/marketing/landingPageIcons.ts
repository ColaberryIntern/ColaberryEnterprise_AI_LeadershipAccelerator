/**
 * landingPageIcons - the closed set of line icons a card may carry.
 *
 * WHY A FIXED SET, INLINE. The reference design puts a small tinted icon tile on each topic
 * card, and there are three ways to get one. A library (RemixIcon, Lucide) means an external
 * stylesheet or font, which this page's CSP forbids - `default-src 'none'` with no `style-src`
 * or `font-src` for anything off-origin. A model-supplied SVG means markup written by a language
 * model rendered on a public page, which is the one thing the renderer refuses everywhere else.
 * So: twelve glyphs, written here, chosen by name from an enum the schema closes.
 *
 * A NAME THAT IS NOT IN THE SET CANNOT ARRIVE - the schema is `z.enum([...])` over exactly these
 * keys, so an unknown name fails validation rather than rendering an empty tile. `iconFor` still
 * falls back by index, because `icon` is optional and a page written before the field existed
 * must still get tiles rather than blanks.
 *
 * DRAWN, NOT TRACED. Each is a 24x24 stroke path on `currentColor` so the tile tint decides the
 * colour, and `aria-hidden` because the label beside it already says what the card is: a screen
 * reader announcing "lightbulb AI fundamentals" is worse than announcing "AI fundamentals".
 */

export const ICON_NAMES = [
  'bulb', 'chat', 'briefcase', 'search', 'document', 'flow',
  'wrench', 'trend', 'check', 'clock', 'layers', 'rocket',
] as const;

export type IconName = typeof ICON_NAMES[number];

/** The inner paths of each glyph, on a 24x24 grid. */
const PATHS: Record<IconName, string> = {
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/>',
  document: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  flow: '<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M6.5 9v5a4 4 0 0 0 4 4H14"/>',
  wrench: '<path d="M15 7a4 4 0 0 1-5.4 3.7L5 15.3a2.3 2.3 0 0 0 3.2 3.2l4.6-4.6A4 4 0 0 1 18 4.6L15.6 7 17 8.4 19.4 6A4 4 0 0 1 15 7z"/>',
  trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/>',
  rocket: '<path d="M12 3c3.5 2 5.5 5.5 5.5 9.5L15 15H9l-2.5-2.5C6.5 8.5 8.5 5 12 3z"/><path d="M9 15l-2 4 4-1M15 15l2 4-4-1"/><circle cx="12" cy="10" r="1.5"/>',
};

/**
 * One glyph, as inline SVG.
 *
 * `index` picks a glyph when the content named none, so a page written before `icon` existed
 * still renders tiles. Cycling is deterministic from position, which keeps two renders of the
 * same content identical - a random pick would make a republish differ from its own preview.
 */
export function iconFor(name: string | undefined, index: number): string {
  const key = (ICON_NAMES as readonly string[]).includes(name ?? '')
    ? (name as IconName)
    : ICON_NAMES[index % ICON_NAMES.length];
  return `<svg class="tile-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[key]}</svg>`;
}

/** Which of the three brand colours tints a tile. Cycles so a grid is not one colour. */
export function tileTone(index: number): 'a' | 'b' | 'c' {
  return (['a', 'b', 'c'] as const)[index % 3];
}
