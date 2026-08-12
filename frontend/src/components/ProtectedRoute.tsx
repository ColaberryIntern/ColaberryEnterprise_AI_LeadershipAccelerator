import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  sectionForPath,
  firstAccessiblePath,
  UNIVERSAL_ADMIN_PATHS,
} from './Layout/adminNav';

/**
 * Gate for every /admin route.
 *
 * Until 2026-08-09 this only asked "is there a token", so the management-portal
 * RBAC hid the nav but left every admin page reachable by typing its URL. For a
 * scoped identity that meant a wall of pages whose every request 403s. This
 * bounces those requests to a page the identity can actually read.
 *
 * This is a UX boundary, not a security one. `requireSection` on the backend is
 * what actually protects the data, and it is unchanged.
 *
 * Two deliberate conservatisms:
 *   - While /me is still in flight we render through, matching the nav's
 *     permissive `canSection`, so a legacy admin never sees a redirect flash.
 *   - A path with no nav entry is allowed for everyone EXCEPT a plain `sales`
 *     login. Existing mgmt-role staff keep today's exact behaviour on those
 *     routes; only the new, narrowly-scoped rep role is denied by default.
 */
function ProtectedRoute() {
  const { isAuthenticated, canSection, meLoaded, adminRole, mgmtRole } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  // Sections not resolved yet — stay permissive, exactly like the sidebar.
  if (!meLoaded) {
    return <Outlet />;
  }

  const pathname = location.pathname;
  if (UNIVERSAL_ADMIN_PATHS.includes(pathname)) {
    return <Outlet />;
  }

  const section = sectionForPath(pathname);
  const isScopedRep = adminRole === 'sales' && !mgmtRole;
  const allowed = section ? canSection(section) : !isScopedRep;

  if (!allowed) {
    return <Navigate to={firstAccessiblePath(canSection)} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
