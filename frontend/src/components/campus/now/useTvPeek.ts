import { useEffect, useState } from 'react';
import { getTv } from '../../../services/colaberryTvApi';
import type { TvShort } from './tvPlaylist';

/**
 * The on-air shorts, read once per page for the two places that only LOOK at Colaberry TV and never play it: the phone on the Quad
 * (its screen shows the current short's thumbnail) and the left panel's "New on Colaberry TV" note (Campus v20 N1 / N4, C131 / C135).
 * One shared request; a failure is an empty list (the phone shows its placeholder, the note stays hidden), never invented shorts.
 */
let cache: Promise<TvShort[]> | null = null;

export function useTvPeek(): TvShort[] {
  const [list, setList] = useState<TvShort[]>([]);
  useEffect(() => {
    let alive = true;
    if (!cache) cache = getTv().then((d) => d.videos).catch(() => { cache = null; return []; });
    cache.then((v) => { if (alive) setList(v); });
    return () => { alive = false; };
  }, []);
  return list;
}

/** Tests only. */
export function __resetTvPeekForTests(): void { cache = null; }
