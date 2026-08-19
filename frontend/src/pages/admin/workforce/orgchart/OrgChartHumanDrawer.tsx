import React from 'react';
import { Link } from 'react-router-dom';
import type { OrgChartHuman, OrgChartLeadershipAgent, OrgChartStaffAgent } from '../../../../services/workforceOrgChartApi';

/**
 * OrgChartHumanDrawer — the human drill-down (org-chart hierarchy build,
 * 2026-08-19). Ali: "clicking a human shows their team ... plus their own
 * throttled 1-item task view." Reuses the SAME drawer chrome
 * (.wf-scrim/.wf-drawer/.wf-close) WorkforceOSPage's existing office drawer
 * already established, for visual consistency on this page.
 */

interface OrgChartHumanDrawerProps {
  human: OrgChartHuman;
  leadership: OrgChartLeadershipAgent[];
  staff: OrgChartStaffAgent[];
  onClose: () => void;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function OrgChartHumanDrawer({ human, leadership, staff, onClose }: OrgChartHumanDrawerProps): React.ReactElement {
  const directLeadership = leadership.filter((l) => human.leadership_agent_ids.includes(l.id));
  const directLeadershipIds = new Set(directLeadership.map((l) => l.id));
  const teamStaff = staff.filter((s) => directLeadershipIds.has(s.reports_to_agent_id));

  return (
    <div className="wf-scrim" onClick={onClose} role="presentation">
      <aside className="wf-drawer" onClick={(e) => e.stopPropagation()} aria-label={`${human.name}'s team`}>
        <div className="wf-ohead">
          <span className="wf-av av" style={{ background: '#2E6A86' }}>{initials(human.name)}</span>
          <div>
            <b style={{ fontSize: 16 }}>{human.name}</b>
            <div className="wf-muted">{human.email}{human.team ? ` · ${human.team}` : ''} · {human.role}</div>
          </div>
          <button className="wf-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="wf-lab">Throttled task · 1 visible</div>
        {human.task ? (
          <div className="wf-otask" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span>{human.task.title}</span>
            <span className="wf-muted">{human.task.status}</span>
          </div>
        ) : (
          <div className="wf-muted" style={{ marginBottom: 12 }}>No task assigned yet.</div>
        )}

        <div className="wf-lab" style={{ marginTop: 16 }}>
          AI Leadership reporting here · {directLeadership.length}
        </div>
        {directLeadership.length === 0 ? (
          <div className="wf-muted" style={{ marginBottom: 12 }}>No AI Leadership agents report to {human.name} yet.</div>
        ) : (
          directLeadership.map((l) => (
            <Link
              key={l.id}
              to={`/admin/agents/${l.id}`}
              className="wf-emp"
              style={{ display: 'flex', textDecoration: 'none', color: 'inherit', marginBottom: 8 }}
            >
              <span className="wf-av" style={{ background: '#7A5AF0' }}>{initials(l.display_name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{l.display_name}</div>
                <div className="rl">AI Leadership</div>
              </div>
              <div className="wl"><b>{l.open_ticket_count}</b><br />open tickets</div>
            </Link>
          ))
        )}

        <div className="wf-lab" style={{ marginTop: 16 }}>
          AI Staff under this team · {teamStaff.length}
        </div>
        {teamStaff.length === 0 ? (
          <div className="wf-muted">No AI Staff agents report through this team yet.</div>
        ) : (
          teamStaff.map((s) => (
            <Link
              key={s.id}
              to={`/admin/agents/${s.id}`}
              className="wf-emp"
              style={{ display: 'flex', textDecoration: 'none', color: 'inherit', marginBottom: 8 }}
            >
              <span className="wf-av" style={{ background: '#2BA39A' }}>{initials(s.display_name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{s.display_name}</div>
                <div className="rl">AI Staff</div>
              </div>
              <div className="wl"><b>{s.open_ticket_count}</b><br />open tickets</div>
            </Link>
          ))
        )}
      </aside>
    </div>
  );
}

export default OrgChartHumanDrawer;
