/**
 * The Platform Operations page frame: bar, tab strip, question, outlet.
 *
 * It renders inside `AdminLayout` (the route is nested under it), so the admin sidebar and
 * navbar are still there. The template's own dark bar is kept because it carries two things
 * the admin chrome does not: the route, so a person reading a screenshot knows where they
 * are, and the standing of the data on the page. The template's bar says "Sample data"; this
 * one says the data is live, because it is.
 */
import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { OPERATIONS_TABS } from './OperationsChrome';
import './operations.css';

export default function PlatformOperationsLayout() {
  const { pathname } = useLocation();
  const active = [...OPERATIONS_TABS]
    .sort((a, b) => b.path.length - a.path.length)
    .find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`))
    ?? OPERATIONS_TABS[0];

  return (
    <div className="platform-ops">
      <div className="ops-bar">
        <strong>Platform Operations</strong>
        <span className="ops-route">/admin/system/operations</span>
        <span className="ops-standing">Live data</span>
      </div>

      <nav aria-label="Platform Operations tabs" className="ops-tabs">
        {OPERATIONS_TABS.map((t) => (t.built ? (
          <NavLink
            key={t.key}
            to={t.path}
            end={t.path === '/admin/system/operations'}
            className="ops-tab"
            aria-current={t.key === active.key ? 'page' : undefined}
          >
            {t.label}
          </NavLink>
        ) : (
          // Designed, not built. It is not a link and does not pretend to be one; the title
          // carries the question that screen will answer, so the shape of the page is
          // legible before the other six exist.
          <span
            key={t.key}
            className="ops-tab"
            aria-disabled="true"
            title={`Designed, not built yet — ${t.question}`}
          >
            {t.label}
          </span>
        )))}
      </nav>

      <main className="ops-main">
        <div>
          <h1 className="ops-question">{active.question}</h1>
          <p className="ops-subtitle">
            Every agent and timer the registry claims, checked against what actually fired.
          </p>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
