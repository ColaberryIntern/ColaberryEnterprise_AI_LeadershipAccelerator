import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStoryVerification, StoryVerificationView } from '../../../services/workspaceRepoApi';

/**
 * useStoryVerification — server truth for the story the workspace has open, and
 * the choreography for the moment it lands.
 *
 * ── WHY A POLL ───────────────────────────────────────────────────────────────
 *
 * The page has to notice a change it did not cause: the student pushes a commit
 * from their editor and the portal, sitting in the other half of the screen,
 * should react without a refresh.
 *
 * Considered and rejected:
 *   - WEBSOCKET. A new dependency, a connection to hold open, its own auth
 *     handshake and reconnection logic, for an event that happens a handful of
 *     times an hour.
 *   - SSE. The stack does have `useRealtimeAwareness`, but it authenticates with
 *     `withCredentials` cookies while every projects-area call is a Bearer JWT
 *     from localStorage. Reusing it would mean giving the workspace a second
 *     auth model, and long-lived connections through nginx and Cloudflare have
 *     buffering and idle-timeout behaviour we would be discovering in
 *     production.
 *
 * A poll has no connection to drop, nothing to reconnect, no proxy behaviour to
 * discover, and no new dependency. The endpoint it hits is a single indexed row
 * read that never calls GitHub, so holding the page open cannot cost the
 * student their rate limit. It matches the dominant convention in this codebase
 * (~40 `setInterval` sites) rather than introducing a 41st pattern.
 *
 * Three things keep it cheap:
 *   - it only runs while the tab is VISIBLE,
 *   - it stops permanently once the story is verified (the latch never moves, so
 *     there is nothing left to wait for),
 *   - returning to the tab fetches immediately rather than waiting out the
 *     interval, which is what makes it feel faster than 5 seconds in the posture
 *     this page is used in.
 *
 * If many students are ever in workspaces at once and the request volume shows
 * up, SSE is the upgrade and it slots in behind this same interface.
 *
 * ── THE ONE RULE ON THE ANIMATION ────────────────────────────────────────────
 *
 * Never animate something that did not happen. The first successful read SEEDS
 * a baseline and animates nothing — a student opening a story they finished
 * last week must not watch a re-enactment. Only criteria that cross from
 * unconfirmed to confirmed WHILE THE PAGE IS OPEN are staggered, and the
 * verified flip only plays on a real transition.
 */

/** Five seconds. The upstream read is 3-8s on its own, so a tighter poll buys nothing. */
export const VERIFICATION_POLL_MS = 5000;

/** Gap between consecutive boxes ticking. Enough to read as a sequence, not a queue. */
const TICK_STAGGER_MS = 90;

/** How long a newly-confirmed criterion keeps its "just landed" treatment. */
const TICK_HOLD_MS = 1400;

export type CelebrationPhase = 'idle' | 'ticking' | 'verified';

export interface StoryVerificationState {
  view: StoryVerificationView | null;
  /** True once the first read has come back, success or not. Gates the empty states. */
  loaded: boolean;
  /** The criteria the PLAN carries, in plan order. Server's copy wins when present. */
  acceptance: string[];
  /** Has the platform confirmed this criterion against the repo? */
  isConfirmed: (text: string) => boolean;
  /** Is this criterion mid-celebration right now? */
  isJustConfirmed: (text: string) => boolean;
  /** The completion gate. Non-null unlocks "Mark done". */
  verifiedAt: string | null;
  /** Plain sentences naming what is still outstanding. Empty once verified. */
  missing: string[];
  /** Set when the plan gave this story no criteria, so it can never verify. */
  blockedReason: string | null;
  /**
   * Set when the last sync could not READ `.colaberry/progress.json`.
   *
   * This SUPPRESSES `missing` and `blockedReason`, which is the whole point of
   * carrying it separately: while the file is unreadable, the outstanding list
   * is the last verdict we could reach and not a statement about the push that
   * just landed. Showing it would tell a student their criteria failed when
   * what actually happened is that we could not see them — the precise
   * confusion that cost one student an evening of re-verifying correct code.
   */
  readError: string | null;
  phase: CelebrationPhase;
  /** Builder XP banked for this story. Render the points beat only when > 0. */
  xpAwarded: number;
  refresh: () => void;
}

/**
 * Whitespace/case-insensitive key for the DISPLAY diff below: which criteria
 * render as ticked, and which just flipped so they can be celebrated.
 *
 * NOT the backend's `normaliseCriterion`, and deliberately not a copy of it.
 * That function decides whether a student's CLAIM matches the plan, so it has
 * to absorb every way a dash or a quote can be typed. Both inputs here come
 * from the same task row in the same response — `verification.outstanding` is
 * built by the backend out of the very `acceptance` array sitting beside it —
 * so the two sides cannot disagree on punctuation, and duplicating those rules
 * in the frontend would only create a second copy to drift.
 *
 * The completion gate is `verified_at` from the server. Nothing here grants it.
 */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useStoryVerification(projectId: string, storyId: string): StoryVerificationState {
  const [view, setView] = useState<StoryVerificationView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<CelebrationPhase>('idle');

  /**
   * The confirmed set as of the last render we have already shown the student.
   * `null` means "we have never successfully read this story", which is what
   * distinguishes a first load (seed silently) from a change (celebrate).
   */
  const baselineRef = useRef<Set<string> | null>(null);
  const wasVerifiedRef = useRef(false);
  /** Set once the latch lands, so the interval stops asking a settled question. */
  const settledRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const cancelledRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  /** Reset every scrap of per-story state when the page moves to another story. */
  useEffect(() => {
    cancelledRef.current = false;
    baselineRef.current = null;
    wasVerifiedRef.current = false;
    settledRef.current = false;
    setView(null);
    setLoaded(false);
    setJustConfirmed(new Set());
    setPhase('idle');
    return () => { cancelledRef.current = true; };
  }, [projectId, storyId]);

  const apply = useCallback((next: StoryVerificationView) => {
    if (cancelledRef.current) return;
    setView(next);
    setLoaded(true);

    const outstanding = new Set((next.verification?.outstanding ?? []).map(normalise));
    // No verdict at all means nothing is confirmed. An unread story must never
    // render as a page of ticked boxes.
    const confirmed = next.verification
      ? new Set(next.acceptance.map(normalise).filter((k) => !outstanding.has(k)))
      : new Set<string>();

    const nowVerified = Boolean(next.verified_at);
    const baseline = baselineRef.current;

    // FIRST READ — seed and show, never celebrate. We did not witness this.
    if (baseline === null) {
      baselineRef.current = confirmed;
      wasVerifiedRef.current = nowVerified;
      if (nowVerified) settledRef.current = true;
      return;
    }

    const newlyConfirmed = [...confirmed].filter((k) => !baseline.has(k));
    const newlyVerified = nowVerified && !wasVerifiedRef.current;

    baselineRef.current = confirmed;
    wasVerifiedRef.current = nowVerified;
    if (nowVerified) settledRef.current = true;

    if (newlyConfirmed.length === 0 && !newlyVerified) return;

    // Reduced motion gets the same information in the same order, without the
    // choreography. The app-wide CSS override in responsive.css already flattens
    // animation duration; the JS stagger needs its own gate or the information
    // would still arrive on a delay nobody asked for.
    if (prefersReducedMotion()) {
      if (newlyVerified) setPhase('verified');
      return;
    }

    if (newlyConfirmed.length > 0) setPhase('ticking');

    newlyConfirmed.forEach((key, i) => {
      const t = window.setTimeout(() => {
        if (cancelledRef.current) return;
        setJustConfirmed((prev) => new Set(prev).add(key));
        const clear = window.setTimeout(() => {
          if (cancelledRef.current) return;
          setJustConfirmed((prev) => {
            const copy = new Set(prev);
            copy.delete(key);
            return copy;
          });
        }, TICK_HOLD_MS);
        timersRef.current.push(clear);
      }, i * TICK_STAGGER_MS);
      timersRef.current.push(t);
    });

    // The story flips only after the last box has ticked — the sequence is
    // criteria, then verdict, then points, and a verdict that beat its own
    // evidence on screen would read as the page guessing.
    if (newlyVerified) {
      const after = newlyConfirmed.length * TICK_STAGGER_MS + 260;
      const t = window.setTimeout(() => {
        if (!cancelledRef.current) setPhase('verified');
      }, after);
      timersRef.current.push(t);
    }
  }, []);

  const load = useCallback(async () => {
    if (!projectId || !storyId) return;
    try {
      const next = await getStoryVerification(projectId, storyId);
      apply(next);
    } catch {
      // Fail soft, exactly as the repo panel does. A story with no verification
      // row yet answers 404, and a student mid-build seeing an error banner
      // because the platform has not looked at their repo yet would be noise.
      if (!cancelledRef.current) setLoaded(true);
    }
  }, [projectId, storyId, apply]);

  useEffect(() => {
    if (!projectId || !storyId) return undefined;
    load();

    const timer = window.setInterval(() => {
      if (settledRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      load();
    }, VERIFICATION_POLL_MS);

    // Coming back to the tab is the moment a student most wants this fresh —
    // they just pushed in the other window.
    const onVisible = () => {
      if (!settledRef.current && document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimers();
    };
  }, [projectId, storyId, load, clearTimers]);

  const acceptance = useMemo(() => view?.acceptance ?? [], [view]);

  const confirmedKeys = useMemo(() => {
    if (!view?.verification) return new Set<string>();
    const outstanding = new Set(view.verification.outstanding.map(normalise));
    return new Set(view.acceptance.map(normalise).filter((k) => !outstanding.has(k)));
  }, [view]);

  const isConfirmed = useCallback(
    (text: string) => confirmedKeys.has(normalise(text)),
    [confirmedKeys],
  );
  const isJustConfirmed = useCallback(
    (text: string) => justConfirmed.has(normalise(text)),
    [justConfirmed],
  );

  /**
   * What is missing, as things a student can act on.
   *
   * Built from the structured fields rather than echoing `reasons`, because the
   * outstanding criteria and "no commit names this story" are two different
   * kinds of missing and the student fixes them in two different places.
   */
  /**
   * The progress file itself could not be read, so nothing derived from it is
   * this push's answer. One sentence, from the server, rendered verbatim.
   */
  const readError = useMemo(() => {
    if (view?.verified_at) return null;
    return view?.verification?.read_error ?? null;
  }, [view]);

  const missing = useMemo(() => {
    const v = view?.verification;
    if (!v || view?.verified_at) return [];
    // Suppressed while the file is unreadable: these criteria may well be done
    // and we simply cannot see the claim. Listing them here is what sent a
    // student back to redo work she had already finished.
    if (readError) return [];
    const out = [...v.outstanding];
    if (!v.commit_sha && v.criteria_total > 0) {
      out.push(`a commit naming ${view?.story_id ?? 'this story'} — add it to your commit message and push`);
    }
    return out;
  }, [view, readError]);

  /** A story the plan gave no criteria can never verify. Say so rather than hanging. */
  const blockedReason = useMemo(() => {
    const v = view?.verification;
    if (!v || view?.verified_at) return null;
    // The read error is the more specific, more actionable explanation, and it
    // ends in "tell your instructor" — advice that is wrong here, because this
    // is a file the student can fix themselves.
    if (readError) return null;
    if (v.criteria_total === 0) {
      return v.reasons[0]
        ?? 'This story has no acceptance criteria in the published plan, so there is nothing to verify against.';
    }
    return null;
  }, [view, readError]);

  return {
    view,
    loaded,
    acceptance,
    isConfirmed,
    isJustConfirmed,
    verifiedAt: view?.verified_at ?? null,
    missing,
    blockedReason,
    readError,
    phase,
    xpAwarded: view?.xp_awarded ?? 0,
    refresh: load,
  };
}
