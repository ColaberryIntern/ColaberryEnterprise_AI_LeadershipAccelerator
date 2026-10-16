import { ADMIN_PAGES } from '../adminRoutes';

// Plain <a> tags, not client-side routing -- consistent with App.jsx's
// pathname-lookup approach (no react-router-dom in this app). A real nav
// bar was missing entirely before this: none of the 6 admin pages linked
// to each other or anywhere else, so each was only reachable by already
// knowing its exact URL.
export default function AdminNav({ currentPath }) {
  return (
    <nav className="admin-nav" aria-label="Admin dashboards">
      {/* Not an admin dashboard -- the resident-facing page itself (App.jsx
          renders it as three separate components, not one ADMIN_ROUTES
          entry), but it belongs in this nav so the whole app is reachable
          from one place instead of only the 6 admin pages. */}
      <a
        href="/"
        className="admin-nav__link admin-nav__link--resident"
        aria-current={currentPath === '/' ? 'page' : undefined}
      >
        Get Personalized Voter Information
      </a>
      {ADMIN_PAGES.map(({ path, label }) => (
        <a
          key={path}
          href={path}
          className="admin-nav__link"
          aria-current={path === currentPath ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
