import { useEffect, useRef } from 'react';

/**
 * Career Prep v27 (CP4.6): Esc closes the TOP layer only. The room (Esc goes back to the floor), a sheet over
 * it, and the jump bar over that are a stack: each open layer registers here, and one capture listener on the
 * document hands Esc to the most recently opened layer and stops it there, so the layers below (and the room's
 * own window listener) never see it. A layer that closes leaves the stack.
 */
type Layer = { close: () => void };
const stack: Layer[] = [];
let listening = false;

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopPropagation();
  e.preventDefault();
  stack[stack.length - 1].close();
}

/** True while a sheet or the jump bar is open: the chat then does not move focus to a new message. */
export const layerOpen = (): boolean => stack.length > 0;

export function useEscapeLayer(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return undefined;
    const layer: Layer = { close: () => handler.current() };
    stack.push(layer);
    if (!listening) { document.addEventListener('keydown', onKey, true); listening = true; }
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0 && listening) { document.removeEventListener('keydown', onKey, true); listening = false; }
    };
  }, [active]);
}
