import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { MentorContextProvider } from '../../contexts/MentorContext';

// Minimal portal chrome for the remaining legacy student pages (curriculum,
// sessions, assignments, progress, lessons). The primary student experience is
// the Design E shell (PortalShell / TodayShell) rendered OUTSIDE this layout;
// this lean chrome just wraps the transitional pages that have not moved into
// that shell yet. The old AI Project Builder ("Cory") nav + ambient state layer
// (WorkspaceContextBar, MicroToast, CoryAvatar, onboarding gates) was removed
// 2026-07-18 so the builder can never surface for a student.
function PortalLayout() {
  const { logout } = useParticipantAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const navItems: Array<{ to: string; label: string; icon: string }> = [
    { to: '/portal/today',       label: 'Today',       icon: 'bi-house' },
    { to: '/portal/curriculum',  label: 'Curriculum',  icon: 'bi-book' },
    { to: '/portal/sessions',    label: 'Sessions',    icon: 'bi-calendar-event' },
    { to: '/portal/assignments', label: 'Assignments', icon: 'bi-clipboard-check' },
    { to: '/portal/progress',    label: 'Progress',    icon: 'bi-graph-up' },
  ];

  return (
    <MentorContextProvider>
    <div className="min-vh-100" style={{ background: 'var(--color-bg-alt)' }}>
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
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              {navItems.map((item) => (
                <li className="nav-item" key={item.to}>
                  <NavLink
                    to={item.to}
                    end
                    className={({ isActive }) => `nav-link ${isActive ? 'fw-semibold' : ''}`}
                    style={({ isActive }) => ({
                      color: isActive ? '#FB2832' : 'var(--color-text-light)',
                    })}
                  >
                    <i className={`bi ${item.icon} me-1`}></i>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <button className="btn btn-outline-secondary btn-sm" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right me-1"></i>Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="container py-4">
        <div key={location.pathname} className="ws-surface-arrival">
          <Outlet />
        </div>
      </main>
      <style>{`
        .ws-surface-arrival { animation: wsFadeIn 220ms ease-out; }
        @keyframes wsFadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ws-surface-arrival { animation: none; }
        }
      `}</style>
    </div>
    </MentorContextProvider>
  );
}

export default PortalLayout;
