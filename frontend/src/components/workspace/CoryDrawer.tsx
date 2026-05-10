/**
 * CoryDrawer — ambient operational assistant.
 *
 * NOT a fullscreen chat. NOT a chat at all. A context-aware sidebar that
 * surfaces what Cory knows about the user's current state across surfaces:
 *   - current surface
 *   - active build / pending handoff / next action
 *   - readiness + coverage one-liner
 *   - blockers (if any)
 *   - 2-3 contextual next-step suggestions
 *
 * The "ambient" part: the drawer's content rotates with the route + state.
 * Open it on Cory Home and it tells you what to look at on Home; open it
 * on Blueprint and it tells you what to do in Blueprint. No typing.
 *
 * Reads only from useUnifiedProjectState + useLocation.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Drawer from './Drawer';
import { useUnifiedProjectState } from '../../hooks/useUnifiedProjectState';

interface Props { open: boolean; onClose: () => void; }

interface Suggestion {
  icon: string;
  label: string;
  to?: string;
  hint?: string;
}

const CoryDrawer: React.FC<Props> = ({ open, onClose }) => {
  const { state } = useUnifiedProjectState();
  const location = useLocation();

  const surface = detectSurface(location.pathname);
  const surfaceLabel = SURFACE_LABEL[surface] || 'Workspace';

  if (!state) {
    return (
      <Drawer open={open} onClose={onClose} eyebrow="CORY · ambient assistant" title="Loading context…">
        <div style={{ color: 'var(--color-text-light)', fontSize: 13 }}>Waiting for unified state.</div>
      </Drawer>
    );
  }

  const suggestions = buildSuggestions(surface, state);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={`CORY · contextual to ${surfaceLabel}`}
      title="Here's what I know"
      subtitle="I read the same state every other surface reads — readiness, queue, active build, recent work. Nothing here is autonomous: I just summarize and suggest."
    >
      {/* Current state snapshot */}
      <section style={{ marginBottom: 18 }}>
        <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 8 }}>
          Right now
        </h6>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--color-text)' }}>
          <li>
            Project <strong>{state.project.organization_name || 'untitled'}</strong>
            {state.project.industry && <> · {state.project.industry}</>}
          </li>
          <li>
            Readiness <strong style={{ color: scoreColor(state.readiness.score) }}>{state.readiness.score}%</strong> ({state.readiness.band}) ·
            Coverage <strong>{state.coverage.requirements_total > 0 ? `${state.coverage.score}%` : '—'}</strong>
            {state.coverage.requirements_total > 0 && <> ({state.coverage.requirements_matched}/{state.coverage.requirements_total} reqs)</>} ·
            Health <strong style={{ color: scoreColor(state.health.score) }}>{state.health.score}%</strong>
          </li>
          {state.next_action && (
            <li>Next: <strong>{state.next_action.title}</strong> ({state.next_action.time_est_minutes ? `~${state.next_action.time_est_minutes}m` : 'time TBD'})</li>
          )}
          {state.active_build && (
            <li><span style={{ color: 'var(--color-success)' }}>● Active build:</span> <strong>{state.active_build.title}</strong></li>
          )}
          {state.blockers.length > 0 && (
            <li>{state.blockers.length} thing{state.blockers.length === 1 ? '' : 's'} to address — surfaced on Home</li>
          )}
        </ul>
      </section>

      {/* Contextual suggestions */}
      {suggestions.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 10 }}>
            Suggestions for {surfaceLabel}
          </h6>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {suggestions.map((s, i) => (
              s.to ? (
                <Link
                  key={i}
                  to={s.to}
                  onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
                    borderRadius: 5, padding: '0.55rem 0.75rem',
                    textDecoration: 'none', color: 'var(--color-text)',
                    fontSize: 13, lineHeight: 1.5,
                  }}
                >
                  <i className={`bi ${s.icon}`} style={{ color: 'var(--color-primary-light)', marginTop: 2, flexShrink: 0 }}></i>
                  <span style={{ flex: 1 }}>
                    <strong>{s.label}</strong>
                    {s.hint && <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 1 }}>{s.hint}</div>}
                  </span>
                </Link>
              ) : (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
                    borderRadius: 5, padding: '0.55rem 0.75rem',
                    color: 'var(--color-text)', fontSize: 13, lineHeight: 1.5,
                  }}
                >
                  <i className={`bi ${s.icon}`} style={{ color: 'var(--color-primary-light)', marginTop: 2, flexShrink: 0 }}></i>
                  <span style={{ flex: 1 }}>
                    <strong>{s.label}</strong>
                    {s.hint && <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 1 }}>{s.hint}</div>}
                  </span>
                </div>
              )
            ))}
          </div>
        </section>
      )}

      {/* Boundary disclosure */}
      <section style={{
        background: 'var(--color-bg-alt)', border: '1px dashed var(--color-border)',
        borderRadius: 5, padding: '0.65rem 0.85rem', fontSize: 11, color: 'var(--color-text-light)',
      }}>
        <strong>What I do NOT do:</strong> autonomous execution, hidden decisions, ranking operators, or anything you can't see in the unified state.
        Authority lives at <Link to="/portal/home" onClick={onClose} style={{ color: 'var(--color-primary-light)' }}>Home</Link>; I just summarize it here.
      </section>
    </Drawer>
  );
};

// ─── helpers ───

type Surface = 'home' | 'critique' | 'blueprint' | 'system' | 'sessions' | 'other';
const SURFACE_LABEL: Record<Surface, string> = {
  home: 'Home', critique: 'Critique', blueprint: 'Blueprint', system: 'System', sessions: 'Sessions', other: 'this view',
};

function detectSurface(pathname: string): Surface {
  if (pathname.startsWith('/portal/home')) return 'home';
  if (pathname.startsWith('/portal/visual-workspace')) return 'critique';
  if (pathname.startsWith('/portal/project/blueprint')) return 'blueprint';
  if (pathname.startsWith('/portal/project/system')) return 'system';
  if (pathname.startsWith('/portal/sessions')) return 'sessions';
  return 'other';
}

function scoreColor(n: number): string {
  if (n >= 80) return 'var(--color-success)';
  if (n >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function buildSuggestions(surface: Surface, state: NonNullable<ReturnType<typeof useUnifiedProjectState>['state']>): Suggestion[] {
  const out: Suggestion[] = [];

  // Always-applicable: pending handoff in any session
  let pendingHandoff = false;
  try { pendingHandoff = !!sessionStorage.getItem('visualWorkspace:pendingBuildPrompt'); } catch { /* ignore */ }
  if (pendingHandoff && surface !== 'blueprint') {
    out.push({ icon: 'bi-rocket', label: 'Open Blueprint to run your compiled prompt', to: '/portal/project/blueprint?build=visual-workspace', hint: 'You compiled a prompt in Critique that\'s waiting to execute' });
  }

  switch (surface) {
    case 'home':
      if (state.blockers.length > 0) {
        out.push({ icon: 'bi-exclamation-circle', label: `Address ${state.blockers.length} thing${state.blockers.length === 1 ? '' : 's'} listed below`, hint: 'Scroll down to "Things to address" on this page' });
      }
      if (state.next_action) {
        out.push({ icon: 'bi-arrow-right-circle', label: 'Open today\'s priority in Blueprint', to: '/portal/project/blueprint', hint: state.next_action.title });
      }
      out.push({ icon: 'bi-bullseye', label: 'Pin a critique on a page', to: '/portal/visual-workspace', hint: 'Spot improvements visually + compile a prompt' });
      break;

    case 'critique':
      if (state.next_action) {
        out.push({ icon: 'bi-arrow-right', label: 'Or run Cory\'s priority in Blueprint instead', to: '/portal/project/blueprint', hint: state.next_action.title });
      }
      out.push({ icon: 'bi-info-circle', label: 'Annotate mode = click → drop a pin', hint: 'Each pin becomes a critique you can compile into a Claude Code prompt' });
      break;

    case 'blueprint':
      if (state.next_action && !state.active_build) {
        out.push({ icon: 'bi-flag', label: 'Mark this action accepted', hint: 'Tracks it as your active build on Home until you complete it' });
      }
      if (state.active_build) {
        out.push({ icon: 'bi-house', label: 'Active build visible on Home', to: '/portal/home', hint: 'Footer row shows it across surfaces via the context bar' });
      }
      out.push({ icon: 'bi-bullseye', label: 'Pin more critiques while waiting', to: '/portal/visual-workspace', hint: 'Critique handoffs accumulate across sessions' });
      break;

    case 'system':
      out.push({ icon: 'bi-house', label: 'System is read-only — Cory at Home decides', to: '/portal/home' });
      out.push({ icon: 'bi-grid-3x3-gap', label: 'Components tab shows the capability grid', to: '/portal/project/system-v2?tab=components', hint: 'No build buttons here — execute via Blueprint' });
      break;

    case 'sessions':
      out.push({ icon: 'bi-house', label: 'Back to operational Home', to: '/portal/home' });
      break;
  }

  return out.slice(0, 4); // cap at 4 to stay calm
}

export default CoryDrawer;
