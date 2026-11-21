import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage, getBoard, type BoardFilter, type BoardRow, type BoardScope } from '../../../../services/commsHubApi';

/**
 * One board list (CH7.4) with its own loading and error state. A list that failed to load says so
 * and never claims to be empty. A late answer from an earlier filter is dropped, so the rows on
 * screen always match the filter on screen.
 */
export interface BoardList { rows: BoardRow[] | null; error: string | null; reload: () => void }

export function useBoard(scope: BoardScope, filter: BoardFilter = {}): BoardList {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify(filter);

  const reload = useCallback(() => {
    const mine = ++seq.current;
    setError(null);
    getBoard(scope, JSON.parse(key) as BoardFilter)
      .then((r) => { if (mine === seq.current) setRows(r); })
      .catch((err) => { if (mine === seq.current) { setRows(null); setError(apiErrorMessage(err, 'This list did not load.')); } });
  }, [scope, key]);

  useEffect(() => { reload(); }, [reload]);
  return { rows, error, reload };
}
