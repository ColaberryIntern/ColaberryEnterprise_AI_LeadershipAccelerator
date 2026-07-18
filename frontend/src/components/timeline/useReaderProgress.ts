import { useEffect, useMemo, useState } from 'react';

/**
 * useReaderProgress — bridges the Self Study reader iframe (opaque-origin, so it can
 * only talk to the parent via postMessage) to the host page. The reader posts its
 * per-section read-progress; this hook mirrors it so the host can reveal the Mark
 * Complete button only once EVERY section has been read (>=10s dwell each), and
 * persists which sections are read to localStorage so a returning student keeps credit.
 *
 * `initialDoneIds` is read ONCE per cardId and never changes during the session, so it
 * can be fed into readerDoc without the iframe's srcDoc churning (which would reload the
 * reading). Live completions update button-state + localStorage only, not this value.
 */

const key = (cardId: string) => `ss:read:${cardId}`;

function readStored(cardId: string): string[] {
  try {
    const raw = window.localStorage.getItem(key(cardId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStored(cardId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(key(cardId), JSON.stringify(ids));
  } catch {
    /* storage blocked/full — progress just won't persist across reloads */
  }
}

export interface ReaderProgress {
  done: number;
  total: number;
  complete: boolean;
  /** Section ids already read in a prior session — pass to readerDoc to restore their
   *  checkmarks. Stable per cardId so the iframe srcDoc doesn't reload on live progress. */
  initialDoneIds: string[];
}

export function useReaderProgress(cardId: string, enabled: boolean): ReaderProgress {
  const initialDoneIds = useMemo(
    () => (enabled && cardId ? readStored(cardId) : []),
    [cardId, enabled],
  );
  const [state, setState] = useState<{ done: number; total: number; complete: boolean }>({
    done: initialDoneIds.length,
    total: 0,
    complete: false,
  });

  useEffect(() => {
    setState({ done: enabled && cardId ? readStored(cardId).length : 0, total: 0, complete: false });
    if (!enabled || !cardId) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; cardId?: string; done?: number; total?: number; complete?: boolean; ids?: unknown[] } | null;
      if (!d || d.source !== 'ss-reader' || d.cardId !== cardId) return;
      const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === 'string') : [];
      if (ids.length) writeStored(cardId, ids);
      setState({ done: Number(d.done) || 0, total: Number(d.total) || 0, complete: !!d.complete });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [cardId, enabled]);

  return { ...state, initialDoneIds };
}
