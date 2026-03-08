import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { MentorContextProvider } from '../../contexts/MentorContext';
import PortalMentorChat from '../portal/PortalMentorChat';

function PortalLayout() {
  const { logout } = useParticipantAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const navItems = [
    { to: '/portal/dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
    { to: '/portal/curriculum', label: 'Curriculum', icon: 'bi-mortarboard' },
    { to: '/portal/sessions', label: 'Sessions', icon: 'bi-calendar-event' },
    { to: '/portal/assignments', label: 'Assignments', icon: 'bi-file-earmark-text' },
    { to: '/portal/progress', label: 'Progress', icon: 'bi-graph-up' },
  ];

  return (
    <MentorContextProvider>
    <div className="min-vh-100" style={{ background: 'var(--color-bg-alt)' }}>
      <nav className="navbar navbar-expand-lg bg-white border-bottom shadow-sm">
        <div className="container">
          <span className="navbar-brand fw-bold" style={{ color: 'var(--color-primary)' }}>
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
                    className={({ isActive }) =>
                      `nav-link ${isActive ? 'fw-semibold' : ''}`
                    }
                    style={({ isActive }) => ({
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text-light)',
                    })}
                  >
                    <i className={`bi ${item.icon} me-1`}></i>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={handleLogout}
            >
              <i className="bi bi-box-arrow-right me-1"></i>Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="container py-4">
        <Outlet />
      </main>

      <PortalMentorChat />
    </div>
    </MentorContextProvider>
  );
}

export default PortalLayout;
