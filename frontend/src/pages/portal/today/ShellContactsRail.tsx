import React from 'react';
import type { CohortContact } from '../../../services/cohortPresenceApi';
import type { PeoplePanel } from '../../../services/peoplePanelApi';
import PeoplePanelRail from './PeoplePanelRail';
import CampusRail from '../../../components/campus/CampusRail';

/**
 * The portal's right contacts rail (Facebook-style cohort presence). Moved out of PortalShell.tsx
 * unchanged (Colaberry Campus C3) because the shell was over the 500-line ceiling and the rule is
 * to split before adding. State stays in PortalShell; this component only renders it. The markup
 * is byte-identical to what PortalShell rendered before the move -
 * components/campus/__tests__/campusNoChange.test.tsx pins that with a snapshot.
 */
export interface ShellContactsRailProps {
  panel: PeoplePanel | null;
  contactsCollapsed: boolean;
  onToggleCollapsed: () => void;
  openPerson: (enrollmentId: string, name: string) => void;
  showFind: boolean;
  onBackToPeople: () => void;
  onOpenFind: () => void;
  findQuery: string;
  setFindQuery: (q: string) => void;
  findFiltered: CohortContact[];
  onAddFriend: (id: string) => void;
  onRespondFriend: (requesterId: string, accept: boolean) => void;
  incoming: CohortContact[];
  people: CohortContact[];
  cohortName: string;
  onlineNow: number;
  contactsCount: number;
  openChat: (c: CohortContact) => void;
}

/** The find-people view: the full cohort directory, reachable by clicking "Find people" and dismissed with the back arrow. */
type FindProps = Pick<ShellContactsRailProps, 'onBackToPeople' | 'findQuery' | 'setFindQuery' | 'findFiltered' | 'onAddFriend' | 'onRespondFriend'>;
function FindPeopleView({ onBackToPeople, findQuery, setFindQuery, findFiltered, onAddFriend, onRespondFriend }: FindProps): React.ReactElement {
  return (
    <>
      {/* Find-people view — the full cohort directory, reachable by clicking
          "Find people" and dismissed with the back arrow. */}
      <div className="te-ct-head">
        <button type="button" className="te-ct-back" onClick={onBackToPeople} aria-label="Back to contacts" title="Back">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h3>Find people</h3>
      </div>
      <div className="te-ct-search-wrap">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          className="te-ct-search"
          type="text"
          autoFocus
          value={findQuery}
          onChange={(e) => setFindQuery(e.target.value)}
          placeholder="Search your cohort…"
          aria-label="Search people"
        />
      </div>
      <div className="te-ct-list">
        {findFiltered.map((c) => (
          <div key={c.id} className="te-ctrow te-ctrow-static" title={c.name}>
            <span className="te-ctav" style={{ background: c.color }}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.initials}<span className={`te-ctpres ${c.presence}`} /></span>
            <span className="te-ctname">{c.name}</span>
            {c.friendshipStatus === 'friend' ? (
              <span className="te-ct-added">Friends</span>
            ) : c.friendshipStatus === 'requested' ? (
              <button type="button" className="te-ct-add" disabled>Requested</button>
            ) : c.friendshipStatus === 'incoming' ? (
              <button type="button" className="te-ct-add" onClick={() => onRespondFriend(c.id, true)}>Accept</button>
            ) : (
              <button type="button" className="te-ct-add" onClick={() => onAddFriend(c.id)}>Add</button>
            )}
          </div>
        ))}
        {findFiltered.length === 0 && (
          <div className="te-ct-empty">{findQuery.trim() ? `No one matches “${findQuery.trim()}”.` : 'No one from your cohort is here yet.'}</div>
        )}
      </div>
    </>
  );
}

export default function ShellContactsRail({
  panel, contactsCollapsed, onToggleCollapsed, openPerson, showFind, onBackToPeople, onOpenFind, findQuery, setFindQuery,
  findFiltered, onAddFriend, onRespondFriend, incoming, people, cohortName, onlineNow, contactsCount, openChat,
}: ShellContactsRailProps): React.ReactElement {
  return (
      <aside className="te-contacts" aria-label="Cohort contacts">
        {/* C11b: the campus sections (who is in this building, today's plan, help desk); renders nothing unless the campus is active. */}
        {!contactsCollapsed && <CampusRail />}
        {panel ? (
          // Role-aware People panel (PEOPLE_PANEL_ROLES_ENABLED=true). When null (flag
          // OFF or fetch error) the legacy cohort-presence rail below renders unchanged.
          <PeoplePanelRail
            panel={panel}
            collapsed={contactsCollapsed}
            onToggleCollapsed={onToggleCollapsed}
            onOpenPerson={openPerson}
          />
        ) : showFind ? (
          <FindPeopleView onBackToPeople={onBackToPeople} findQuery={findQuery} setFindQuery={setFindQuery}
            findFiltered={findFiltered} onAddFriend={onAddFriend} onRespondFriend={onRespondFriend} />
        ) : (
          <>
            {/* Default view — up to RAIL_MAX faces, most-active first. */}
            <div className="te-ct-head">
              <h3>Contacts</h3>
              <button
                type="button"
                className="te-ct-toggle"
                onClick={onToggleCollapsed}
                title={contactsCollapsed ? 'Expand contacts' : 'Collapse contacts'}
                aria-label="Toggle contacts panel"
                aria-expanded={!contactsCollapsed}
              >
                <svg viewBox="0 0 24 24" fill="none" style={{ transform: contactsCollapsed ? 'rotate(180deg)' : 'none' }}>
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <button type="button" className="te-ct-find" title="Find people" onClick={onOpenFind}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <span>Find people</span>
            </button>
            {!contactsCollapsed && incoming.length > 0 && (
              <div className="te-ct-list te-ct-requests">
                <div className="te-ct-grp">Requests · {incoming.length}</div>
                {incoming.map((c) => (
                  <div key={c.id} className="te-ctrow te-ctrow-static" title={c.name}>
                    <span className="te-ctav" style={{ background: c.color }}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.initials}</span>
                    <span className="te-ctname">{c.name}</span>
                    <span className="te-ct-reqbtns">
                      <button type="button" className="te-ct-add" onClick={() => onRespondFriend(c.id, true)}>Accept</button>
                      <button type="button" className="te-ct-decline" onClick={() => onRespondFriend(c.id, false)} aria-label="Decline request">✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="te-ct-list">
              {people.length > 0 && <div className="te-ct-grp">{cohortName} · {onlineNow} online</div>}
              {people.map((c) => (
                <button key={c.id} type="button" className="te-ctrow" data-name={c.name} title={`Message ${c.name}`} onClick={() => openChat(c)}>
                  <span className="te-ctav" style={{ background: c.color }}>{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.initials}<span className={`te-ctpres ${c.presence}`} /></span>
                  <span className="te-ctname">{c.name}</span>
                  <span className={`te-ctpres ${c.presence}`} />
                </button>
              ))}
              {contactsCount === 0 && (
                <div className="te-ct-empty">No one from your cohort yet. Check back soon.</div>
              )}
            </div>
          </>
        )}
      </aside>
  );
}
