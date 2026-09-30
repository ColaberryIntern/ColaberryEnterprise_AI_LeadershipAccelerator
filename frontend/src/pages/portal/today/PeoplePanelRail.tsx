import React from 'react';
import { PeoplePanel, PanelPerson } from '../../../services/peoplePanelApi';
import { colorFor, initialsFor } from '../../../services/cohortPresenceApi';

// Presentational right-rail body for the role-aware People panel (flag ON). Rendered by
// PortalShell in place of the legacy cohort-presence rail; when the flag is OFF this is
// never mounted and the rail is byte-identical to before. Reuses the existing te-ct*
// styles (te-ctrow / te-ctav / te-ctpres / te-ct-grp / te-ct-empty) so it matches the
// rest of the rail with no new CSS.

interface Props {
  panel: PeoplePanel;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenPerson: (enrollmentId: string, name: string) => void;
}

// A clickable person face — opens a 1:1 chat, exactly like the legacy contact rows.
const PersonRow: React.FC<{ p: PanelPerson; onOpen: (id: string, name: string) => void }> = ({ p, onOpen }) => {
  const color = colorFor(p.enrollment_id || p.display_name);
  return (
    <button
      type="button"
      className="te-ctrow"
      data-name={p.display_name}
      title={`Message ${p.display_name}`}
      onClick={() => onOpen(p.enrollment_id, p.display_name)}
    >
      <span className="te-ctav" style={{ background: color }}>
        {p.avatar_url ? <img src={p.avatar_url} alt="" /> : initialsFor(p.display_name)}
        <span className={`te-ctpres ${p.presence}`} />
      </span>
      <span className="te-ctname">
        {p.display_name}
        {p.cohort_name ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {p.cohort_name}</span> : null}
      </span>
      <span className={`te-ctpres ${p.presence}`} />
    </button>
  );
};

// A non-clickable summary row (class or business): label + "N online" count.
const SummaryRow: React.FC<{ label: string; sub: string; count: number }> = ({ label, sub, count }) => (
  <div className="te-ctrow te-ctrow-static" title={sub}>
    <span className="te-ctname">
      {label}
      <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {sub}</span>
    </span>
    <span className="te-ct-added">{count} online</span>
  </div>
);

const PeoplePanelRail: React.FC<Props> = ({ panel, collapsed, onToggleCollapsed, onOpenPerson }) => (
  <>
    <div className="te-ct-head">
      <h3>People</h3>
      <button
        type="button"
        className="te-ct-toggle"
        onClick={onToggleCollapsed}
        title={collapsed ? 'Expand people' : 'Collapse people'}
        aria-label="Toggle people panel"
        aria-expanded={!collapsed}
      >
        <svg viewBox="0 0 24 24" fill="none" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}>
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>

    {panel.viewer_role === 'staff' ? (
      <>
        {/* Online now — everyone online/idle across all cohorts (comes FIRST). */}
        <div className="te-ct-list">
          <div className="te-ct-grp">Online now · {panel.online.length}</div>
          {panel.online.map((p) => (
            <PersonRow key={p.enrollment_id} p={p} onOpen={onOpenPerson} />
          ))}
          {panel.online.length === 0 && <div className="te-ct-empty">No one is online right now.</div>}
        </div>

        {/* Classes + Businesses — summary rows; hidden when the rail is collapsed. */}
        {!collapsed && panel.classes.length > 0 && (
          <div className="te-ct-list">
            <div className="te-ct-grp">Classes · {panel.classes.length}</div>
            {panel.classes.map((c) => (
              <SummaryRow key={c.cohort_id} label={c.name} sub={`${c.members} members`} count={c.online} />
            ))}
          </div>
        )}
        {!collapsed && panel.businesses.length > 0 && (
          <div className="te-ct-list">
            <div className="te-ct-grp">Businesses · {panel.businesses.length}</div>
            {panel.businesses.map((b) => (
              <SummaryRow key={b.sponsor_id} label={b.company} sub={`${b.seats} seats`} count={b.online} />
            ))}
          </div>
        )}
      </>
    ) : (
      <>
        {/* My class — the viewer's cohort-mates (comes FIRST). */}
        <div className="te-ct-list">
          <div className="te-ct-grp">My class · {panel.my_class.filter((p) => p.presence !== 'offline').length} online</div>
          {panel.my_class.map((p) => (
            <PersonRow key={p.enrollment_id} p={p} onOpen={onOpenPerson} />
          ))}
          {panel.my_class.length === 0 && (
            <div className="te-ct-empty">You are not in a class yet. See who is active below.</div>
          )}
        </div>

        {/* Active now — recently-active people OUTSIDE the viewer's cohort. */}
        <div className="te-ct-list">
          <div className="te-ct-grp">Active now</div>
          {panel.active_now.map((p) => (
            <PersonRow key={p.enrollment_id} p={p} onOpen={onOpenPerson} />
          ))}
          {panel.active_now.length === 0 && <div className="te-ct-empty">No one else is active right now.</div>}
        </div>
      </>
    )}
  </>
);

export default PeoplePanelRail;
