import { RefObject, useEffect } from 'react';

/**
 * Focus for the campus cards (C11, WCAG 2.4.3): a card that opens takes focus on its heading, and one that closes hands
 * focus back to whatever opened it (a building, a token, a bar button). When that opener is gone (the tour hides its own
 * "Take the tour" button while touring, a token can leave with the next presence poll), focus lands on the dialog the card
 * lived in, so it is never dropped onto <body>.
 *
 * Unmount cleanups run after React has removed the card, so a whole-overlay close finds both the opener and the dialog
 * disconnected and does nothing here: the overlay's own return-focus (CampusLayers) then sends focus back to the page.
 * The heading needs tabIndex={-1}.
 */
export function useCardFocus(heading: RefObject<HTMLElement>): void {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const dialog = heading.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    heading.current?.focus();
    return () => {
      const target = opener?.isConnected ? opener : dialog?.isConnected ? dialog : null;
      // Only move focus if it was inside the card (or already lost to <body>); never steal it from somewhere the learner went.
      const active = document.activeElement;
      if (target && (!active || active === document.body || !active.isConnected)) target.focus();
    };
    // Mount/unmount only: the opener is whatever had focus when the card appeared. (No eslint-disable here: naming
    // react-hooks/exhaustive-deps is itself a build error in this repo, whose CRA config does not load that rule.)
  }, []);
}
