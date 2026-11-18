import type { TvVideo, TvViewer } from './tvModel';
import { listLibraryShorts } from './tvLibrarySource';

/**
 * What Colaberry TV plays (Campus v20 N3, Basecamp C134).
 *
 * ONE FUNCTION LEFT, and that is the point of TV-2. This file used to own a second playlist in
 * `colaberry_tv_videos` - add, update, reorder, remove, each in a transaction with its audit row -
 * and TV-1 pointed the TV at the Colaberry Training library instead. From that moment the writes
 * had no reader: nothing displayed the rows they maintained. They are gone now rather than left to
 * look load-bearing.
 *
 * THE TABLE IS STILL THERE, deliberately. Dropping `colaberry_tv_videos` is a schema change and
 * ESCALATE-tier, and it holds the only record of the nine hard-coded seeds, so it stays for a
 * release as the rollback if the library turns out to be the wrong source. `ensureColaberryTvSchema`
 * is kept for the same reason and now has no caller: that is intended, not an oversight.
 */

/**
 * The viewer is taken and deliberately ignored: the library has no audience concept, so every
 * short is on for everyone. The parameter stays because two callers pass it - the portal GET route
 * and `colaberryNow/happeningService` - and `_viewer` is the honest signal that nothing downstream
 * varies by it today.
 */
export async function listForViewer(_viewer: TvViewer): Promise<TvVideo[]> {
  return listLibraryShorts();
}
