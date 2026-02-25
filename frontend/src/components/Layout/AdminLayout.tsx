import React from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <nav className="navbar navbar-dark bg-dark" role="navigation" aria-label="Admin navigation">
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
          <div className="d-flex align-items-center gap-3">
            <Link to="/admin/dashboard" className="text-light text-decoration-none small">
              Dashboard
            </Link>
            <Link to="/admin/revenue" className="text-light text-decoration-none small">
              Revenue
            </Link>
            <Link to="/admin/campaigns" className="text-light text-decoration-none small">
              Campaigns
            </Link>
            <Link to="/admin/pipeline" className="text-light text-decoration-none small">
              Pipeline
            </Link>
            <Link to="/admin/leads" className="text-light text-decoration-none small">
              Leads
            </Link>
            <Link to="/admin/apollo" className="text-light text-decoration-none small">
              Apollo
            </Link>
            <Link to="/admin/sequences" className="text-light text-decoration-none small">
              Sequences
            </Link>
            <Link to="/admin/import" className="text-light text-decoration-none small">
              Import
            </Link>
            <Link to="/admin/settings" className="text-light text-decoration-none small">
              Settings
            </Link>
            <button
              className="btn btn-outline-light btn-sm"
              onClick={handleLogout}
            >
              Logout
            </button>
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
