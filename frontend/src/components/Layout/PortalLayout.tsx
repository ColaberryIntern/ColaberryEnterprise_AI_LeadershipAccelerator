import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { MentorContextProvider } from '../../contexts/MentorContext';

function PortalLayout() {
  const { logout } = useParticipantAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/portal/login');
  };

  const navItems = [
    { to: '/portal/project/blueprint', label: 'Blueprint', icon: 'bi-map' },
    { to: '/portal/project/system', label: 'System View', icon: 'bi-grid-3x3-gap' },
    { to: '/portal/project/system-v2', label: 'V2', icon: 'bi-stars' },
    { to: '/portal/sessions', label: 'Sessions', icon: 'bi-calendar-event' },
  ];

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
                    end
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

    </div>
    </MentorContextProvider>
  );
}

export default PortalLayout;
