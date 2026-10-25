/**
 * The Community Board's opener (C30): any entry point (the board on the map, the "📌 Ask the community" chip, Where to?) calls
 * openBoard(); the one host shows the board; the map, if it is on screen, walks you to it first (walk: true).
 */
export const BOARD_EVENT = 'cm-open-board';
export interface BoardOpen { compose?: 'q' | 'post' | null; walk?: boolean }

export function openBoard(open: BoardOpen = {}): void {
  try { window.dispatchEvent(new CustomEvent<BoardOpen>(BOARD_EVENT, { detail: open })); } catch { /* non-DOM environment */ }
}
export function onBoard(cb: (open: BoardOpen) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<BoardOpen>).detail ?? {});
  window.addEventListener(BOARD_EVENT, h);
  return () => window.removeEventListener(BOARD_EVENT, h);
}
