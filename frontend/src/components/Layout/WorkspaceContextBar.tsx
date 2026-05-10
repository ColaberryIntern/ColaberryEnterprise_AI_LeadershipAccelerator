/**
 * WorkspaceContextBar — ambient operational continuity strip.
 *
 * Contextual Workspace Sprint, 2026-05-10.
 *
 * Lives directly under the navbar on every authenticated portal page that
 * hosts an operational surface (Home / Critique / Blueprint / System).
 * Hidden on login/verify and on the legacy fallback routes.
 *
 * Hard rules:
 *   - Reads ONLY from useUnifiedProjectState (Cory authority) + sessionStorage
 *     (Critique→Blueprint handoff). No new endpoints.
 *   - Never decides anything — purely reflects state in a way that signals
 *     continuity across surfaces.
 *   - Stays calm: ~36px tall, neutral background, no banners, no badges that
 *     scream. Premium ambient strip, not a control center.
 *   - One line per slot. Three slots: Anchor · In-flight · Cory whisper.
 *   - The "live" pulse is a 6px dot that fades when state freshens.
 *
 * Surfaces:
 *   Home      → "What's in flight" + Cory whisper for the queue
 *   Critique  → adds pin count from sessionStorage if a session is open
 *   Blueprint → emphasizes pending build / current step
 *   System    → calmer mode — emphasizes tab + read-only role
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnifiedProjectState } from '../../hooks/useUnifiedProjectState';
import CoryDrawer from '../workspace/CoryDrawer';

const HIDDEN_ROUTE_PREFIXES = [
  '/portal/login',
  '/portal/verify',
];

type Surface = 'home' | 'critique' | 'blueprint' | 'system' | 'sessions' | 'legacy' | 'other';

function detectSurface(pathname: string): Surface {
  if (pathname.startsWith('/portal/home')) return 'home';
  if (pathname.startsWith('/portal/visual-workspace')) return 'critique';
  if (pathname.startsWith('/portal/project/blueprint-legacy')) return 'legacy';
  if (pathname.startsWith('/portal/project/system-v2-legacy')) return 'legacy';
  if (pathname.startsWith('/portal/project/blueprint')) return 'blueprint';
  if (pathname.startsWith('/portal/project/system')) return 'system';
  if (pathname.startsWith('/portal/sessions')) return 'sessions';
  return 'other';
}

const WorkspaceContextBar: React.FC = () => {
  const location = useLocation();
  const surface = detectSurface(location.pathname);

  // Skip entirely on auth + legacy fallback routes — those are not part of the
  // continuous workspace experience.
  const skip = HIDDEN_ROUTE_PREFIXES.some(p => location.pathname.startsWith(p))
    || surface === 'legacy';

  const { state } = useUnifiedProjectState({ pollMs: 60_000 });
  const [coryOpen, setCoryOpen] = useState(false);

  // Critique handoff signal — if the operator compiled a prompt in the
  // visual workspace, the bar reflects "build pending" continuity until
  // the operator either runs it or dismisses it inside Blueprint.
  const [pendingHandoff, setPendingHandoff] = useState<{ route: string | null }>({ route: null });
  useEffect(() => {
    if (skip) return;
    try {
      const text = sessionStorage.getItem('visualWorkspace:pendingBuildPrompt');
      const route = sessionStorage.getItem('visualWorkspace:pendingBuildSourceRoute');
      setPendingHandoff({ route: text ? (route || '/') : null });
    } catch { /* ignore */ }
  }, [location.pathname, skip]);

  // Live pulse — flash a small dot for 1.2s when state.built_at changes.
  const [pulse, setPulse] = useState(false);
  const builtAt = state?.built_at;
  useEffect(() => {
    if (!builtAt) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1200);
    return () => clearTimeout(t);
  }, [builtAt]);

  const inFlightLine = useMemo(() => {
    if (!state) return null;
    if (pendingHandoff.route) {
      return {
        kind: 'critique-handoff',
        text: <>Critique pending: <strong style={{ color: 'var(--color-secondary)' }}>{pendingHandoff.route}</strong> &middot; ready to run in Blueprint</>,
      };
    }
    if (state.active_build) {
      return {
        kind: 'active-build',
        text: <>Active: <strong style={{ color: 'var(--color-accent)' }}>{state.active_build.title}</strong></>,
      };
    }
    if (state.next_action) {
      return {
        kind: 'next-action',
        text: <>Next: <strong style={{ color: 'var(--color-text)' }}>{state.next_action.title}</strong></>,
      };
    }
    return { kind: 'caught-up', text: <em style={{ opacity: 0.7 }}>Caught up &mdash; nothing in flight</em> };
  }, [state, pendingHandoff.route]);

  const whisper = useMemo(() => {
    if (!state) return null;
    // Per-surface contextual hint. One short sentence, italic, faded.
    switch (surface) {
      case 'home':
        if (state.blockers.length > 0) return `${state.blockers.length} thing${state.blockers.length === 1 ? '' : 's'} to address — listed below`;
        if (state.queue.length === 0) return 'Open Critique to spot improvements, or pick a queue item when one appears';
        return 'Click any tile to drill in';
      case 'critique':
        if (pendingHandoff.route) return 'You have a compiled prompt waiting in Blueprint';
        return 'Pin issues, then compile a prompt to hand off to Blueprint';
      case 'blueprint':
        if (pendingHandoff.route) return 'Compiled prompt is in Step 3 — copy + run in Claude Code';
        if (state.active_build) return 'Active build appears on Home; complete here when done';
        if (state.next_action) return 'Click "Mark accepted" to track this as your active build';
        return 'No action queued — open Home or Critique';
      case 'system':
        return 'Read-only — Cory at Home decides what\'s next';
      case 'sessions':
        return 'Coaching surface — orthogonal to the build loop';
      default:
        return null;
    }
  }, [state, surface, pendingHandoff.route]);

  if (skip || !state) return null;

  const projectName = state.project.organization_name || 'Untitled project';
  const surfaceLabel = surfaceLabels[surface] || '';

  return (
    <div
      role="complementary"
      aria-label="Workspace context"
      style={{
        background: 'linear-gradient(to bottom, var(--color-bg-alt), var(--color-bg))',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.4rem 1rem',
        fontSize: 12,
        color: 'var(--color-text-light)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
      }}
    >
      {/* ─── Slot 1: Anchor (project + surface + live pulse) ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0 }}>
        <span
          aria-hidden="true"
          title={pulse ? 'State just refreshed' : 'Live'}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: pulse ? 'var(--color-success)' : 'rgba(16, 185, 129, 0.45)',
            transition: 'background 350ms ease',
            flexShrink: 0,
          }}
        />
        <strong style={{
          color: 'var(--color-primary)',
          fontWeight: 600,
          maxWidth: 160,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={projectName}>{projectName}</strong>
        {surfaceLabel && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>{surfaceLabel}</span>
          </>
        )}
      </div>

      {/* ─── Slot 2: In-flight (the operational heartbeat) ─── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--color-text-light)',
        }}
      >
        {inFlightLine?.text}
      </div>

      {/* ─── Slot 3: Cory whisper (ambient hint, clickable → opens Cory drawer) ─── */}
      {whisper && (
        <button
          type="button"
          onClick={() => setCoryOpen(true)}
          title={`${whisper} · click for full context`}
          style={{
            flexShrink: 0,
            maxWidth: 360,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--color-text-light)',
            fontStyle: 'italic',
            fontSize: 11,
            opacity: 0.85,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'right',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.color = 'var(--color-text-light)'; }}
        >
          <i className="bi bi-stars" style={{ marginRight: 5, opacity: 0.6 }}></i>
          {whisper}
        </button>
      )}

      {/* Cory drawer — ambient operational assistant, opened by clicking the whisper */}
      <CoryDrawer open={coryOpen} onClose={() => setCoryOpen(false)} />
    </div>
  );
};

const surfaceLabels: Partial<Record<Surface, string>> = {
  home: 'Home',
  critique: 'Critique',
  blueprint: 'Blueprint',
  system: 'System',
  sessions: 'Sessions',
};

export default WorkspaceContextBar;
