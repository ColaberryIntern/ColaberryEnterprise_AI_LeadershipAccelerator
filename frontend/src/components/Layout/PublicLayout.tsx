import React from 'react';
import { Outlet } from 'react-router-dom';
import PublicNavbar from './PublicNavbar';
import PublicFooter from './PublicFooter';

function PublicLayout() {
  return (
    <div className="d-flex flex-column min-vh-100">
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      <PublicNavbar />
      <main id="main-content" className="flex-grow-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}

export default PublicLayout;
