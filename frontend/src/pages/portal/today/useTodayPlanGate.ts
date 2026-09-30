import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { PortalFlags } from '../../../services/onboardingApi';

/**
 * useTodayPlanGate — CAPE Phase 5 (design doc §10, §16 Phase 5) the Today-
 * Plan/Explore-feed mount gate, extracted from TodayShell.tsx into its own
 * hook (matching this same directory's existing useReferralForm.ts /
 * useNextLiveSession.ts pattern) once TodayShell.tsx crossed CLAUDE.md's
 * 500-line hard ceiling — Modular Composition Rule: "the next change to it
 * MUST split it before adding new code."
 *
 * `planRefs` starts UNCONDITIONALLY `null` (never read `flags` inside this
 * `useState` initializer — `usePortalFlags()` resolves `flags` asynchronously,
 * so it is ALWAYS null on first render; an initializer that branches on it
 * would permanently lock onto the "flag off" branch regardless of the real
 * flag value — this was the exact bug the plan-audit's cycle-3 verdict caught
 * and cycle-4 fixed). The `[flags]`-keyed effect below is the ONLY thing that
 * ever resolves it: flag off -> empty `Set()` as soon as `flags` is known (no
 * added latency); flag on -> a bounded ~1500ms fallback timeout while
 * `<TodayPlan>` races to supply the real refs first via `onRefs`.
 * `<TodayFeedV2>` should be rendered only once `planRefs !== null`, so its
 * one-shot initial-fetch effect can never fire before both the flag and the
 * exclude set are genuinely known.
 */
export function useTodayPlanGate(flags: PortalFlags | null): {
  planRefs: Set<string> | null;
  setPlanRefs: Dispatch<SetStateAction<Set<string> | null>>;
} {
  const [planRefs, setPlanRefs] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (flags === null) return; // usePortalFlags still loading — wait for a real value
    if (!flags.cape_today_plan) { setPlanRefs(new Set()); return; }
    const t = window.setTimeout(() => setPlanRefs((prev) => prev ?? new Set()), 1500);
    return () => window.clearTimeout(t);
  }, [flags]);

  return { planRefs, setPlanRefs };
}
