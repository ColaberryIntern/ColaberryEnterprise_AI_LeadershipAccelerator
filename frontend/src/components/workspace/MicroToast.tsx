/**
 * MicroToast + ToastHost — ambient operational micro-feedback.
 *
 * Living Workspace Sprint, 2026-05-10. NOT a notification system. NOT
 * persistent. NOT clickable (intentionally). Each toast appears in the
 * bottom-left for 3.5s then fades. Calm, premium, restrained.
 *
 * Reacts to state-deltas detected by the host (mounted in PortalLayout):
 *   - state.next_action.source_id changed → "Next priority ready"
 *   - state.active_build.title appeared → "Active build: <title>"
 *   - state.active_build cleared from non-null → "Active build complete"
 *   - state.readiness.score increased ≥3 → "Readiness +N%"
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
}

interface ToastInternal extends ToastInput {
  id: number;
  visible: boolean;
}

let toastCounter = 0;
const subscribers = new Set<(t: ToastInput) => void>();

export function fireToast(t: ToastInput) {
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
  const prevActiveBuildIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      prevReadinessRef.current = state.readiness.score;
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

    // Next priority changed
    if (state.next_action?.source_id
        && state.next_action.source_id !== memory.lastSeenNextActionId) {
      fireToast({ icon: 'bi-arrow-right-circle', tone: 'info', message: `Next priority: ${truncate(state.next_action.title, 50)}` });
      update({ lastSeenNextActionId: state.next_action.source_id });
    }

    // Active build appeared / cleared
    const buildId = state.active_build?.title ?? null;
    if (buildId !== prevActiveBuildIdRef.current) {
      if (buildId && !prevActiveBuildIdRef.current) {
        fireToast({ icon: 'bi-flag', tone: 'good', message: `Active build: ${truncate(buildId, 50)}` });
      } else if (!buildId && prevActiveBuildIdRef.current) {
        fireToast({ icon: 'bi-check-circle', tone: 'good', message: 'Active build complete — back to queue' });
      }
      prevActiveBuildIdRef.current = buildId;
      update({ lastSeenActiveBuildId: buildId || undefined });
    }

    // Readiness improved by ≥ 3 points
    if (prevReadinessRef.current !== null
        && state.readiness.score - prevReadinessRef.current >= 3) {
      const delta = state.readiness.score - prevReadinessRef.current;
      fireToast({ icon: 'bi-trending-up', tone: 'good', message: `Readiness +${delta}% (now ${state.readiness.score}%)` });
    }
    prevReadinessRef.current = state.readiness.score;
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
        position: 'fixed',
        bottom: '1.25rem',
        left: '1.25rem',
        background: bg,
        color: 'white',
        borderRadius: 6,
        padding: '0.6rem 0.95rem',
        fontSize: 13,
        fontWeight: 500,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
        display: 'flex', alignItems: 'center', gap: 10,
        opacity: head.visible ? 1 : 0,
        transform: head.visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 280ms ease, transform 280ms ease',
        zIndex: 1100,
        maxWidth: '420px',
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
