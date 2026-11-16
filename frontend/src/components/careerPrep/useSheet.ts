import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Sheet } from './logic/askRouter';
import { sheetFromHash } from './logic/sheets';

/**
 * Career Prep v27 (CP4.6): which sheet is open, read from the URL hash (so an email link, the jump bar and
 * Cora all open the same way). Opening pushes a history entry, so the browser Back button closes the sheet;
 * moving sideways between sheets replaces it (one Back still closes). Closing in the app goes back when the
 * app opened the sheet, else (a direct link) it clears the hash. Focus returns to whatever opened the sheet.
 */
export interface SheetApi { sheet: Sheet | null; open: (s: Sheet) => void; close: () => void }

/** Focus `el` when it is still on the page, else Cora's column in the room. */
export function focusOrCora(el: HTMLElement | null): void {
  if (el && el !== document.body && document.contains(el)) { el.focus(); return; }
  document.querySelector<HTMLElement>('[data-testid="cp-cora-col"]')?.focus();
}

export function useSheet(): SheetApi {
  const loc = useLocation();
  const navigate = useNavigate();
  const sheet = sheetFromHash(loc.hash);
  const opener = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);
  const wasOpen = useRef(sheet !== null);

  const open = useCallback((s: Sheet) => {
    if (sheet === s) return;
    if (sheet === null) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      pushed.current = true;
      navigate({ search: loc.search, hash: `#${s}` });
    } else {
      navigate({ search: loc.search, hash: `#${s}` }, { replace: true });
    }
  }, [sheet, navigate, loc.search]);

  const close = useCallback(() => {
    if (sheet === null) return;
    if (pushed.current) { pushed.current = false; navigate(-1); } else navigate({ search: loc.search, hash: '' }, { replace: true });
  }, [sheet, navigate, loc.search]);

  useEffect(() => {
    // No opener (a direct link), or it is gone: focus goes to Cora's column, never to the page body.
    if (wasOpen.current && sheet === null) { focusOrCora(opener.current); opener.current = null; pushed.current = false; }
    wasOpen.current = sheet !== null;
  }, [sheet]);

  return { sheet, open, close };
}
