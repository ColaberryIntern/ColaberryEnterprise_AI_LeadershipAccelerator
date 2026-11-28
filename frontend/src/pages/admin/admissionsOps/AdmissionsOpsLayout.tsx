import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { PageHeader } from '../../../components/admin/shell';
import { TOOL_SECTIONS, WORK_SECTIONS, screenHref, type OpsScreen } from './screens';
import { currentScreen } from './currentScreen';
import { AgentSurfaceProvider } from './agent/agentSurface';
import './admissionsOps.css';

/**
 * The Admissions & Ops Command Center shell (AO1.4): one sidebar entry opens this layout, and the section bar
 * reaches every section, as the Marketing consolidation did. Each screen is a child route, so a refresh keeps
 * the screen. Work sections sit left and tools right (kit SPEC 2.2). A screen opened from inside another
 * (Student 360, the TFC audit, the Weekly Report) highlights the section it belongs to.
 */
function SectionLink({ s, active }: { s: OpsScreen; active: boolean }): React.ReactElement {
  return (
    <li className="nav-item">
      <Link
        to={screenHref(s.id)}
        className={`nav-link ops-section-link${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
        data-testid={`ops-section-${s.id}`}
      >
        {s.title}
      </Link>
    </li>
  );
}

export default function AdmissionsOpsLayout(): React.ReactElement {
  const { pathname } = useLocation();
  const here = currentScreen(pathname);
  const activeId = here?.parent ?? null;

  return (
    <AgentSurfaceProvider>
    <div className="admissions-ops">
      <PageHeader
        title="Admissions & Academic Ops"
        subtitle="One student. One profile. One workspace. All times are Central."
        icon="graduation-cap-line"
      />
      <nav aria-label="Admissions and Ops sections" className="ops-section-bar mb-3">
        <ul className="nav ops-section-group">
          {WORK_SECTIONS.map((s) => <SectionLink key={s.id} s={s} active={activeId === s.id} />)}
        </ul>
        <ul className="nav ops-section-group ops-section-tools">
          {TOOL_SECTIONS.map((s) => <SectionLink key={s.id} s={s} active={activeId === s.id} />)}
        </ul>
      </nav>
      <Outlet />
    </div>
    </AgentSurfaceProvider>
  );
}
