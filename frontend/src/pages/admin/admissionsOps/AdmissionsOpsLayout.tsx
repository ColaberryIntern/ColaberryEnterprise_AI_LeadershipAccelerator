import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { PageHeader } from '../../../components/admin/shell';
import { getApprovalCount } from '../../../services/admissionsOpsApi';
import { TOOL_SECTIONS, WORK_SECTIONS, screenHref, type OpsScreen } from './screens';
import { currentScreen } from './currentScreen';
import { AgentSurfaceProvider } from './agent/agentSurface';
import AgentDock from './agent/AgentDock';
import './admissionsOps.css';

/**
 * The Admissions & Ops Command Center shell (AO1.4): one sidebar entry opens this layout, and the section bar
 * reaches every section, as the Marketing consolidation did. Each screen is a child route, so a refresh keeps
 * the screen. Work sections sit left and tools right (kit SPEC 2.2). A screen opened from inside another
 * (Student 360, the TFC audit, the Weekly Report) highlights the section it belongs to.
 * AO2.3: the agent dock sits under the bar on every screen except Ask AURA, and Approvals shows its open count.
 */
function SectionLink({ s, active, badge }: { s: OpsScreen; active: boolean; badge?: number | null }): React.ReactElement {
  return (
    <li className="nav-item">
      <Link
        to={screenHref(s.id)}
        className={`nav-link ops-section-link${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
        data-testid={`ops-section-${s.id}`}
      >
        {s.title}
        {badge ? <span className="ops-badge" data-testid={`ops-badge-${s.id}`} aria-label={`${badge} waiting`}>{badge}</span> : null}
      </Link>
    </li>
  );
}

export default function AdmissionsOpsLayout(): React.ReactElement {
  const { pathname } = useLocation();
  const here = currentScreen(pathname);
  const activeId = here?.parent ?? null;
  const [openApprovals, setOpenApprovals] = useState<number | null>(null);
  // Refreshed on every move between screens; a failed count shows no badge rather than a wrong number.
  useEffect(() => {
    let live = true;
    getApprovalCount().then((n) => { if (live) setOpenApprovals(n); }).catch(() => { if (live) setOpenApprovals(null); });
    return () => { live = false; };
  }, [pathname]);

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
            {TOOL_SECTIONS.map((s) => (
              <SectionLink key={s.id} s={s} active={activeId === s.id} badge={s.id === 'approvals' ? openApprovals : null} />
            ))}
          </ul>
        </nav>
        {here && <AgentDock screenId={here.id} />}
        <Outlet />
      </div>
    </AgentSurfaceProvider>
  );
}
