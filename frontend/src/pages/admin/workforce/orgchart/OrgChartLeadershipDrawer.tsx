import React from 'react';
import { Link } from 'react-router-dom';
import type { OrgChartHuman, OrgChartLeadershipAgent, OrgChartStaffAgent } from '../../../../services/workforceOrgChartApi';

/**
 * OrgChartLeadershipDrawer — Org Chart v4 (2026-08-20, session
 * CC-20260818-x4nk continued). Ali, live: "When I click on AI Leadership, I
 * want to be able to see their AI Team below and Human above in a pop up on
 * the right side." Reuses the SAME drawer chrome
 * (.wf-scrim/.wf-drawer/.wf-close/.wf-ohead/.wf-av) `OrgChartHumanDrawer.tsx`
 * already established, for visual consistency on this page — a NEW
 * component rather than a variant prop on the human drawer, since the two
 * show structurally different content (a human's own team + task-assign
 * form vs. this agent's upstream human + downstream staff, no task-assign
 * surface here — task assignment is scoped to the human drawer, unchanged).
 *
 * Scope: AI Leadership cards ONLY. AI Staff cards keep their existing
 * `<Link to="/admin/agents/:id">` drill-through navigation, unchanged — Ali
 * did not ask for Staff-card click behavior to change, and every AI Staff
 * row rendered INSIDE this drawer is still a real navigation link, not a
 * nested modal (drill-through stays true one level down).
 */

interface OrgChartLeadershipDrawerProps {
  leadershipAgent: OrgChartLeadershipAgent;
  /** The human this agent reports to, or undefined if that human couldn't be
   * resolved from the current org-chart response — an honest empty state
   * below, never a crash (mirrors OrgChartHumanDrawer's own "no team/task
   * yet" honesty convention). */
  human: OrgChartHuman | undefined;
  /** Pre-filtered by the caller to this leadership agent's own direct staff
   * (`s.reports_to_agent_id === leadershipAgent.id`) — this component has no
   * opinion on the filter, it just renders what it's given. */
  staff: OrgChartStaffAgent[];
  onClose: () => void;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function OrgChartLeadershipDrawer({ leadershipAgent, human, staff, onClose }: OrgChartLeadershipDrawerProps): React.ReactElement {
  return (
    <div className="wf-scrim" onClick={onClose} role="presentation">
      <aside className="wf-drawer" onClick={(e) => e.stopPropagation()} aria-label={`${leadershipAgent.display_name}'s team`}>
        <div className="wf-ohead">
          <span className="wf-av av" style={{ background: leadershipAgent.hierarchy_color ?? '#7A5AF0' }}>{initials(leadershipAgent.display_name)}</span>
          <div>
            <b style={{ fontSize: 16 }}>{leadershipAgent.display_name}</b>
            <div className="wf-muted">AI Leadership · {leadershipAgent.open_ticket_count} open tickets</div>
          </div>
          <button className="wf-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="wf-lab" style={{ marginTop: 4 }}>Reports to</div>
        {human ? (
          <div className="wf-emp" style={{ display: 'flex', marginBottom: 12 }}>
            <span className="wf-av" style={{ background: human.hierarchy_color ?? '#2E6A86' }}>{initials(human.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="nm">{human.name}</div>
              <div className="rl">{human.email}</div>
            </div>
          </div>
        ) : (
          <div className="wf-muted" style={{ marginBottom: 12 }}>Reports to an unresolved human — not found in the current org chart.</div>
        )}

        <div className="wf-lab" style={{ marginTop: 16 }}>
          AI Staff team · {staff.length}
        </div>
        {staff.length === 0 ? (
          <div className="wf-muted">No AI Staff agents report to {leadershipAgent.display_name} yet.</div>
        ) : (
          staff.map((s) => (
            <Link
              key={s.id}
              to={`/admin/agents/${s.id}`}
              className="wf-emp"
              style={{ display: 'flex', textDecoration: 'none', color: 'inherit', marginBottom: 8 }}
            >
              <span className="wf-av" style={{ background: s.hierarchy_color ?? '#2BA39A' }}>{initials(s.display_name)}</span>
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

export default OrgChartLeadershipDrawer;
