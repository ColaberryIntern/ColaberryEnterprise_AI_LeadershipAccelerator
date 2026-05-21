/**
 * MicroToast + ToastHost — ambient operational micro-feedback.
 *
 * Living Workspace Sprint, 2026-05-10. NOT a notification system. NOT
 * persistent. NOT clickable (intentionally). Each toast appears in the
 * bottom-left for 3.5s then fades. Calm, premium, restrained.
 *
 * Workspace Presence Sprint, 2026-05-12 — added grouped-progression and
 * suppression. When multiple deltas land in the same poll, the host emits
 * one combined "forward motion" toast instead of three competing ones,
 * and a 30s window suppresses duplicate fires for the same signature.
 *
 * Reacts to state-deltas detected by the host (mounted in PortalLayout):
 *   - state.next_action.source_id changed → "Next priority ready"
 *   - state.active_build.title appeared → "Active build: <title>"
 *   - state.active_build cleared from non-null → "Active build complete"
 *   - state.readiness.score increased ≥3 → "Readiness +N%" (or grouped)
 *   - readiness+coverage both up in same poll → "Forward motion: R+N C+M"
 *
 * Maximum 1 toast on screen at a time (queue is drained sequentially).
 * Safe to call fireToast() before mount — calls are no-op'd until host renders.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUnifiedProjectState } from '../../hooks/useUnifiedProjectState';
import { useWorkspaceMemory } from '../../hooks/useWorkspaceMemory';

interface ToastInput {
  icon: string;
  message: string;
  tone?: 'good' | 'info' | 'neutral';
  /** Optional signature for 30s dedup ('readiness-up', 'next-priority', etc.) */
  signature?: string;
}

interface ToastInternal extends ToastInput {
  id: number;
  visible: boolean;
}

let toastCounter = 0;
const subscribers = new Set<(t: ToastInput) => void>();
const recentSignatures = new Map<string, number>(); // signature -> last-fired ms

export function fireToast(t: ToastInput) {
  if (t.signature) {
    const last = recentSignatures.get(t.signature);
    if (last && Date.now() - last < 30_000) return; // suppress dup within 30s
    recentSignatures.set(t.signature, Date.now());
  }
  subscribers.forEach(fn => fn(t));
}

const TONE_BG: Record<NonNullable<ToastInput['tone']>, string> = {
  good: 'rgba(16, 185, 129, 0.95)',
  info: 'rgba(59, 130, 246, 0.95)',
  neutral: 'rgba(45, 55, 72, 0.95)',
};

const ToastHost: React.FC = () => {
  const [queue, setQueue] = useState<ToastInternal[]>([]);
  const { state } = useUnifiedProjectState();
  const { memory, update } = useWorkspaceMemory();

  // Subscribe to imperative fireToast() calls.
  useEffect(() => {
    const handler = (t: ToastInput) => {
      toastCounter += 1;
      const item: ToastInternal = { ...t, id: toastCounter, visible: false };
      setQueue(q => [...q, item]);
    };
    subscribers.add(handler);
    return () => { subscribers.delete(handler); };
  }, []);

  // State-delta watcher → derive toasts. Skip on first mount (would fire
  // a toast for every existing state value).
  const firstRunRef = useRef(true);
  const prevReadinessRef = useRef<number | null>(null);
  const prevCoverageRef = useRef<number | null>(null);
  const prevActiveBuildIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      prevReadinessRef.current = state.readiness.score;
      prevCoverageRef.current = state.coverage.score;
      prevActiveBuildIdRef.current = state.active_build?.title ?? null;
      // Seed memory with current ids so we don't fire stale "new" toasts.
      if (state.next_action?.source_id && !memory.lastSeenNextActionId) {
        update({ lastSeenNextActionId: state.next_action.source_id });
      }
      if (state.active_build?.title && !memory.lastSeenActiveBuildId) {
        update({ lastSeenActiveBuildId: state.active_build.title });
      }
      return;
    }

    // Compute deltas first
    const readinessDelta = prevReadinessRef.current != null
      ? state.readiness.score - prevReadinessRef.current
      : 0;
    const coverageDelta = prevCoverageRef.current != null
      ? state.coverage.score - prevCoverageRef.current
      : 0;
    const readinessUp = readinessDelta >= 3;
    const coverageUp = coverageDelta >= 3;
    const groupedProgression = readinessUp && coverageUp;

    // Next priority changed
    if (state.next_action?.source_id
        && state.next_action.source_id !== memory.lastSeenNextActionId) {
      fireToast({
        icon: 'bi-arrow-right-circle',
        tone: 'info',
        message: `Next priority: ${truncate(state.next_action.title, 50)}`,
        signature: `next:${state.next_action.source_id}`,
      });
      update({ lastSeenNextActionId: state.next_action.source_id });
    }

    // Active build appeared / cleared
    const buildId = state.active_build?.title ?? null;
    if (buildId !== prevActiveBuildIdRef.current) {
      if (buildId && !prevActiveBuildIdRef.current) {
        fireToast({
          icon: 'bi-flag',
          tone: 'good',
          message: `Active build: ${truncate(buildId, 50)}`,
          signature: `build-start:${buildId}`,
        });
      } else if (!buildId && prevActiveBuildIdRef.current) {
        fireToast({
          icon: 'bi-check-circle',
          tone: 'good',
          message: 'Active build complete — back to queue',
          signature: `build-clear`,
        });
      }
      prevActiveBuildIdRef.current = buildId;
      update({ lastSeenActiveBuildId: buildId || undefined });
    }

    // Forward motion (grouped) — fires instead of two separate toasts
    if (groupedProgression) {
      fireToast({
        icon: 'bi-graph-up-arrow',
        tone: 'good',
        message: `Forward motion: Readiness +${readinessDelta}, Coverage +${coverageDelta}`,
        signature: 'grouped-progression',
      });
    } else {
      if (readinessUp) {
        fireToast({
          icon: 'bi-trending-up',
          tone: 'good',
          message: `Readiness +${readinessDelta}% (now ${state.readiness.score}%)`,
          signature: 'readiness-up',
        });
      }
      if (coverageUp) {
        fireToast({
          icon: 'bi-bullseye',
          tone: 'good',
          message: `Coverage +${coverageDelta}% (now ${state.coverage.score}%)`,
          signature: 'coverage-up',
        });
      }
    }

    prevReadinessRef.current = state.readiness.score;
    prevCoverageRef.current = state.coverage.score;
  }, [state, memory.lastSeenNextActionId, memory.lastSeenActiveBuildId, update]);

  // Drive the head of the queue: fade in, hold 3.5s, fade out, drop.
  useEffect(() => {
    if (queue.length === 0) return;
    const head = queue[0];
    if (head.visible) return;
    // Fade in next paint
    const showT = setTimeout(() => {
      setQueue(q => q.map(t => t.id === head.id ? { ...t, visible: true } : t));
    }, 30);
    // Fade out after hold
    const hideT = setTimeout(() => {
      setQueue(q => q.map(t => t.id === head.id ? { ...t, visible: false } : t));
    }, 30 + 3500);
    // Drop after fade-out animation completes
    const dropT = setTimeout(() => {
      setQueue(q => q.filter(t => t.id !== head.id));
    }, 30 + 3500 + 300);
    return () => { clearTimeout(showT); clearTimeout(hideT); clearTimeout(dropT); };
  }, [queue]);

  const head = queue[0];
  if (!head) return null;

  const bg = TONE_BG[head.tone || 'neutral'];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        // 2026-05-21: moved from bottom-left to top-right so it doesn't
        // overlap the workspace action bar's "Mark ready / Compile prompt
        // / Open Blueprint" buttons. Operator caught the collision.
        position: 'fixed',
        top: '5rem',
        right: '1.25rem',
        background: bg,
        color: 'white',
        borderRadius: 6,
        padding: '0.5rem 0.85rem',
        fontSize: 12.5,
        fontWeight: 500,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
        display: 'flex', alignItems: 'center', gap: 9,
        opacity: head.visible ? 1 : 0,
        transform: head.visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 280ms ease, transform 280ms ease',
        zIndex: 1100,
        maxWidth: '360px',
      }}
    >
      <i className={`bi ${head.icon}`} style={{ fontSize: 16, opacity: 0.92 }}></i>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{head.message}</span>
    </div>
  );
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export default ToastHost;
