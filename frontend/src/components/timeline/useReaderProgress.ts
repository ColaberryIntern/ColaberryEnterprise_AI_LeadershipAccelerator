import { useEffect, useState } from 'react';

/**
 * useReaderProgress — bridges the Self Study reader iframe (opaque-origin, so it can
 * only talk to the parent via postMessage) to the host page. The reader posts its
 * per-section read-progress; this hook mirrors it so the host can reveal the Mark
 * Complete button only once EVERY section has been read (>=5s dwell each).
 *
 * The read-gate is enforced FRESH every time the reader opens: progress is NOT
 * persisted across opens. A returning viewer re-dwells each section before the card
 * can be completed — the wait is the point (you can't instantly collect a card just
 * because you opened it once before). This is deliberate: Ali reported the per-section
 * wait had "disappeared" for repeat viewers, which was the restored-from-localStorage
 * completion short-circuiting the gate. `initialDoneIds` is kept in the shape (always
 * empty now) so callers feed a stable value into readerDoc without churning its srcDoc.
 */

export interface ReaderProgress {
  done: number;
  total: number;
  complete: boolean;
  /** Always [] — the reader restores no prior read-state, so the dwell applies each open. */
  initialDoneIds: string[];
}

const NO_DONE_IDS: string[] = [];

export function useReaderProgress(cardId: string, enabled: boolean): ReaderProgress {
  const [state, setState] = useState<{ done: number; total: number; complete: boolean }>({
    done: 0,
    total: 0,
    complete: false,
  });

  useEffect(() => {
    setState({ done: 0, total: 0, complete: false });
    if (!enabled || !cardId) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; cardId?: string; done?: number; total?: number; complete?: boolean } | null;
      if (!d || d.source !== 'ss-reader' || d.cardId !== cardId) return;
      setState({ done: Number(d.done) || 0, total: Number(d.total) || 0, complete: !!d.complete });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [cardId, enabled]);

  return { ...state, initialDoneIds: NO_DONE_IDS };
}
