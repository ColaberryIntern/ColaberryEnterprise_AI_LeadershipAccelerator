import { useEffect, useRef } from 'react';

/**
 * A full-screen campus layer hands focus back to whatever opened it when it closes (C2; shared by the map and the list in C11).
 * Call it BEFORE the layer's own focus-in effect, so it records the opener before focus moves into the layer.
 */
export function useReturnFocus(open: boolean): void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) opener.current = document.activeElement as HTMLElement | null;
    if (!open && wasOpen.current) opener.current?.focus?.();
    wasOpen.current = open;
  }, [open]);
}
