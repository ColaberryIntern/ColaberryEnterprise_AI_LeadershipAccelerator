/**
 * The Community Board on the Quad (C30, v7 R3), the parts the map and search use. It is a noticeboard, not a building: no room, no
 * presence. v14 (C67) moved the notes, lanes and counts to the server (GET /api/portal/community/board); see boardData.ts.
 */
export const BOARD_AT = { x: 560, y: 470 } as const; // the prototype's translate(560,470): just south-east of the fountain
export const BOARD_SPOT = { x: 560, y: 498 } as const; // where you stand to read it
export const BOARD_WALK_MS = 900;
/** Where-to words that find the board. */
export const BOARD_WORDS = ['community', 'post', 'question', 'ask', 'board', 'forum'];

export const means = (q: string): boolean => {
  const t = q.trim().toLowerCase();
  return t.length >= 3 && BOARD_WORDS.some((w) => w.startsWith(t) || t.split(/\s+/).includes(w));
};

/**
 * v14 (C66): "seen" lives on the server now. The old browser mark is only READ, once, to migrate it (the board posts it with migrate
 * when the server has none), then removed. Nothing writes it any more.
 */
const SEEN_KEY = 'cm-board-seen';
export function readSeen(): number | null {
  try { const v = window.localStorage.getItem(SEEN_KEY); return v ? Number(v) || null : null; } catch { return null; }
}
export function clearLegacySeen(): void {
  try { window.localStorage.removeItem(SEEN_KEY); } catch { /* private window: nothing stored */ }
}
