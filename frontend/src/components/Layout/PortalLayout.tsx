import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { MentorContextProvider } from '../../contexts/MentorContext';
import CoryAvatar from '../cory/CoryAvatar';
import WorkspaceContextBar from './WorkspaceContextBar';
import ToastHost from '../workspace/MicroToast';
import { useOnboardingState, type OnboardingGates } from '../../hooks/useOnboardingState';
// Workspace Presence Sprint, 2026-05-12 — ambient breath/fresh/shimmer
// animation primitives. Loaded once at layout level so any portal page
// can opt in via class name without re-importing.
import '../../styles/workspacePresence.css';

function PortalLayout() {
  const { logout } = useParticipantAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 2026-05-20: read onboarding gates so we can disable top-nav items the
  // user hasn't unlocked yet. Until the requirements doc is saved,
  // Critique / Blueprint / System are dead ends — gray them out + tooltip.
  const onboarding = useOnboardingState();

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  // Primary navigation — operational hierarchy:
  //   L1 Cory authority      (Home — what matters now)
  //   L2 Verification        (Critique — pin issues, compile prompts)
  //   L3 Execution           (Blueprint — run prompts, validate)
  //   L4 Understanding       (System — topology, intelligence)
  // Curriculum/coaching live at the end (orthogonal to the build loop).
  // Version-labelled and duplicated entries remain routed for rollback,
  // but are not surfaced here.
  const navItems: Array<{ to: string; label: string; icon: string; gateKey: keyof OnboardingGates }> = [
    { to: '/portal/home',                label: 'Home',      icon: 'bi-house',           gateKey: 'home' },
    { to: '/portal/visual-workspace',    label: 'Critique',  icon: 'bi-bullseye',        gateKey: 'critique' },
    { to: '/portal/project/blueprint',   label: 'Blueprint', icon: 'bi-map',             gateKey: 'blueprint' },
    { to: '/portal/project/system',      label: 'System',    icon: 'bi-grid-3x3-gap',    gateKey: 'system' },
    { to: '/portal/sessions',            label: 'Sessions',  icon: 'bi-calendar-event',  gateKey: 'sessions' },
  ];

  // Until the onboarding state loads, treat everything as enabled (don't
  // flash a disabled state for an instant on every nav). Once loaded,
  // respect the gates server-side.
  const gates = onboarding.state?.gates;
  const stageHint = onboarding.state?.stage === 'needs_requirements'
    ? 'Add a requirements document on Home first.'
    : onboarding.state?.stage === 'has_requirements'
      ? 'Connect a GitHub repo to unlock this.'
      : 'Not available yet.';

  return (
    <MentorContextProvider>
    <div className="min-vh-100" style={{ background: 'var(--color-bg-alt)' }}>
      {process.env.REACT_APP_ENV === 'dev' && (
        <div style={{ background: '#f59e0b', color: '#fff', textAlign: 'center', fontSize: 11, padding: '2px 0', fontWeight: 700, letterSpacing: 1 }}>
          DEV MODE — Experimental Features Enabled
        </div>
      )}
      <nav className="navbar navbar-expand-lg bg-white border-bottom shadow-sm">
        <div className="container">
          <span className="navbar-brand fw-bold" style={{ color: '#FB2832' }}>
            Accelerator Portal
          </span>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#portalNav"
            aria-controls="portalNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="portalNav">
            {window.location.pathname.includes('/demo') ? (
              <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                <li className="nav-item">
                  <span className="nav-link" style={{ color: '#94a3b8', fontSize: 12 }}>
                    <i className="bi bi-lock me-1"></i>Building your system...
                  </span>
                </li>
              </ul>
            ) : (
              <ul className="navbar-nav me-auto mb-2 mb-lg-0">
                {navItems.map((item) => {
                  const enabled = !gates || gates[item.gateKey] !== false;
                  if (!enabled) {
                    return (
                      <li className="nav-item" key={item.to}>
                        <span
                          className="nav-link"
                          title={stageHint}
                          aria-disabled="true"
                          style={{
                            color: 'var(--color-text-light)',
                            opacity: 0.45,
                            cursor: 'not-allowed',
                          }}
                        >
                          <i className={`bi ${item.icon} me-1`}></i>
                          {item.label}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li className="nav-item" key={item.to}>
                      <NavLink
                        to={item.to}
                        end
                        className={({ isActive }) =>
                          `nav-link ${isActive ? 'fw-semibold' : ''}`
                        }
                        style={({ isActive }) => ({
                          color: isActive ? '#FB2832' : 'var(--color-text-light)',
                        })}
                      >
                        <i className={`bi ${item.icon} me-1`}></i>
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={handleLogout}
            >
              <i className="bi bi-box-arrow-right me-1"></i>Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Ambient continuity strip — reads UnifiedProjectState, signals
          cross-surface context. Hidden on auth + legacy routes. */}
      <WorkspaceContextBar />

      {/* Page transition wrapper — keys on pathname so React unmounts the
          old page + mounts the new one with a soft fade-in. No exit
          animation (would require a transition library); the perceived
          flash is replaced by a calm 220ms fade-in on the new page.
          Respects prefers-reduced-motion — operators who opt out of
          motion get an instant swap with no transform. Environmental
          Continuity Sprint, 2026-05-15. */}
      <main className="container py-4">
        <div
          key={location.pathname}
          className="ws-surface-arrival"
        >
          <Outlet />
        </div>
      </main>
      <style>{`
        .ws-surface-arrival {
          animation: wsFadeIn 220ms ease-out;
        }
        @keyframes wsFadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ws-surface-arrival { animation: none; }
        }
      `}</style>

      {/* Ambient micro-feedback — reacts to state-deltas (next priority
          appearing, active build accepted/cleared, readiness improved). */}
      <ToastHost />

      <CoryAvatar />
    </div>
    </MentorContextProvider>
  );
}

export default PortalLayout;
