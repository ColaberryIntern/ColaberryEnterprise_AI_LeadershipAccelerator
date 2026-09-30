import { useCallback, useEffect, useState } from 'react';
import { describeApiError, previewCaseStudy } from '../../services/caseStudyAdminApi';
import type {
  CaseStudySurfaceKey, CaseStudySurfacePreview,
} from '../../services/caseStudyAdminTypes';

/**
 * useCaseStudyPreviewLens — the PREVIEW tab's own surface selection and its own
 * read of the projection.
 *
 * WHY IT IS NOT `useCaseStudyDesk`. Until 2026-08-27 the PREVIEW tab rendered
 * whatever surface the SURFACES tab had last selected, because both read one
 * `lensSurface`. Those are two different questions — "which lens am I
 * inspecting the band order of" and "which surface am I looking at the page
 * for" — and one piece of state cannot answer both without one of them moving
 * when the operator did not ask it to.
 *
 * IT CANNOT WRITE, AND THAT IS CHECKABLE BY READING FOUR LINES. This module
 * imports exactly two functions from the admin client: `previewCaseStudy`, which
 * is a GET, and `describeApiError`, which formats. There is no publish, no
 * approve, no override, no archive here — not a disabled one, not a
 * confirm-guarded one, none. Switching a surface in PREVIEW cannot mutate the
 * record because the code that would do it is not in this file's scope.
 *
 * IT IS LAZY. `enabled` is false until the operator opens the PREVIEW tab, so
 * arriving on a record does not fire a second copy of the desk's own preview
 * GET, and a non-allowlisted admin never meets a 403 they did not ask for.
 *
 * FAILURE-FIRST.
 *   1. What happens if the read fails? `error` is set from the server's own
 *      message and the previous payload is CLEARED — see the note on `run`.
 *   2. Retry? No automatic one. A 403 is a configuration answer and a 500 on a
 *      read is not made truer by asking again; `refresh()` is the operator's
 *      explicit retry, and it is a button.
 *   3. Recovery path: the rendered error names what failed, and the payload
 *      toggle still opens, so a reviewer can still read what did arrive.
 *   4. Not handled: nothing here can throw outside the request. There is no
 *      parsing, no arithmetic, no storage.
 */

export interface CaseStudyPreviewLens {
  /** The surface PREVIEW is rendering. Never the publish surface by reference. */
  surface: CaseStudySurfaceKey;
  preview: CaseStudySurfacePreview | null;
  loading: boolean;
  error: string | null;
  selectSurface: (surfaceKey: CaseStudySurfaceKey) => void;
  refresh: () => void;
}

export function useCaseStudyPreviewLens(
  id: string,
  enabled: boolean,
  initialSurface: CaseStudySurfaceKey,
): CaseStudyPreviewLens {
  const [surface, setSurface] = useState<CaseStudySurfaceKey>(initialSurface);
  const [preview, setPreview] = useState<CaseStudySurfacePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by `refresh`, so an unchanged surface still re-reads. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled || !id) return undefined;
    /**
     * A surface switch is a race: the operator can press Refactored while
     * Training is still in flight. Without this flag the slower response wins
     * and the page renders one surface's page under another surface's tab —
     * which is the single most misleading thing this panel could do.
     */
    let live = true;
    setLoading(true);
    setError(null);

    previewCaseStudy(id, { surfaceKey: surface })
      .then((result) => {
        if (!live) return;
        setPreview(result);
      })
      .catch((err: unknown) => {
        if (!live) return;
        /* The previous payload is CLEARED rather than left on screen. A
           non-allowlisted admin selecting Training gets a 403 here, and keeping
           the Enterprise page visible under a heading that now says Training
           would show one surface's content labelled as another's. */
        setPreview(null);
        setError(describeApiError(err, 'this preview'));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => { live = false; };
  }, [id, surface, enabled, reloadToken]);

  const selectSurface = useCallback((surfaceKey: CaseStudySurfaceKey): void => {
    setSurface(surfaceKey);
  }, []);

  const refresh = useCallback((): void => {
    setReloadToken((token) => token + 1);
  }, []);

  return { surface, preview, loading, error, selectSurface, refresh };
}

export default useCaseStudyPreviewLens;
