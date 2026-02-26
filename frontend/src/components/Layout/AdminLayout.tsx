import React, { useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const adminNavLinks = [
  { path: '/admin/dashboard', label: 'Dashboard' },
  { path: '/admin/revenue', label: 'Revenue' },
  { path: '/admin/campaigns', label: 'Campaigns' },
  { path: '/admin/pipeline', label: 'Pipeline' },
  { path: '/admin/leads', label: 'Leads' },
  { path: '/admin/apollo', label: 'Apollo' },
  { path: '/admin/sequences', label: 'Sequences' },
  { path: '/admin/insights', label: 'Insights' },
  { path: '/admin/import', label: 'Import' },
  { path: '/admin/settings', label: 'Settings' },
];

function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="d-flex flex-column min-vh-100">
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark" role="navigation" aria-label="Admin navigation">
        <div className="container">
          <Link className="navbar-brand fw-bold d-flex align-items-center" to="/admin/dashboard">
            <img
              src="/colaberry-icon.png"
              alt=""
              width="28"
              height="28"
              className="me-2 logo-light"
            />
            Colaberry Admin
          </Link>
          <button
            className="navbar-toggler"
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-controls="adminNav"
            aria-expanded={menuOpen}
            aria-label="Toggle admin navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className={`collapse navbar-collapse ${menuOpen ? 'show' : ''}`} id="adminNav">
            <ul className="navbar-nav ms-auto">
              {adminNavLinks.map((link) => (
                <li className="nav-item" key={link.path}>
                  <Link
                    className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                    to={link.path}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isActive(link.path) ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li className="nav-item mt-2 mt-lg-0">
                <button
                  className="btn btn-outline-light btn-sm w-100"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>
      <main className="flex-grow-1 bg-light">
        <div className="container py-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AdminLayout;
