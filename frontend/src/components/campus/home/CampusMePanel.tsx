import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CampusAudience } from '../campusMap';
import { useCampus } from '../CampusContext';
import MyLook from '../MyLook';
import { useCardFocus } from '../useCardFocus';
import { trapTab } from '../focusTrap';
import { GATE_SEEN_KEY } from './CampusGate';
import '../campusPanels.css';

/**
 * "Me" on the campus home (C11b, the prototype's Me panel): who you are (name, level, points), your locker (My look, earned with
 * points), and the campus settings that matter here: how you get around (campus or the classic menu), the entrance gate, reduce
 * motion, the list view, and the full Settings page. Only settings that really exist; the prototype's "show which building I'm in"
 * has no server switch behind it, so it is not offered.
 */
const ACCOUNT: Record<CampusAudience, string> = { member: 'Enrolled learner', explorer: 'Explorer', business: 'Business account', staff: 'Program staff' };

function readEntrance(): 'daily' | 'skip' {
  try { return window.localStorage.getItem(GATE_SEEN_KEY) === 'always' ? 'skip' : 'daily'; } catch { return 'daily'; }
}

export default function CampusMePanel({ audience, fullName, initials, onClose }: { audience: CampusAudience; fullName: string; initials: string; onClose: () => void }): React.ReactElement {
  const { settings, updateSettings, look, lookError, saveLook, openList } = useCampus();
  const [entrance, setEntrance] = useState(readEntrance);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useCardFocus(heading);
  const setGate = (v: 'daily' | 'skip') => {
    setEntrance(v);
    try { if (v === 'skip') window.localStorage.setItem(GATE_SEEN_KEY, 'always'); else window.localStorage.removeItem(GATE_SEEN_KEY); } catch { /* no storage */ }
  };
  return (
    <>
    {/* the map dims behind the panel, as in the prototype; a press outside closes it */}
    <div className="cm-me-backdrop" aria-hidden="true" onClick={onClose} data-testid="cm-me-backdrop" />
    <aside className="cm-me-panel" role="dialog" aria-modal="false" aria-labelledby="cm-me-name" data-testid="cm-me"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } else trapTab(e); }}>
      <button type="button" className="cm-me-x" onClick={onClose} aria-label="Close">{'×'}</button>
      <div className="cm-me-head">
        <div className="cm-me-face" aria-hidden="true">{initials}</div>
        <div>
          <div className="cm-kicker">{ACCOUNT[audience]}</div>
          <h2 id="cm-me-name" tabIndex={-1} ref={heading}>{fullName || 'You'}</h2>
          {look && (look.rung_name || look.points) ? <span className="cm-lv" data-testid="cm-me-level">{[look.rung_name, `${look.points.toLocaleString('en-US')} pts`].filter(Boolean).join(' · ')}</span> : null}
        </div>
      </div>
      <MyLook look={look} lookError={lookError} onSave={saveLook} onClose={onClose} />
      <div className="cm-sec">Settings</div>
      <div className="cm-me-rows">
        <div className="cm-me-row">
          <div><b>How you get around</b><small>The campus map, or the classic sidebar</small></div>
          <div className="cm-me-seg" role="group" aria-label="How you get around">
            <button type="button" aria-pressed={settings.nav === 'campus'} onClick={() => updateSettings({ nav: 'campus' })}>Campus</button>
            <button type="button" aria-pressed={settings.nav === 'classic'} onClick={() => updateSettings({ nav: 'classic' })} data-testid="cm-me-classic">Classic</button>
          </div>
        </div>
        <div className="cm-me-row">
          <div><b>Names</b><small>Campus names, or workplace names for the same buildings</small></div>
          <div className="cm-me-seg" role="group" aria-label="Names">
            <button type="button" aria-pressed={!settings.workplaceNames} onClick={() => updateSettings({ workplaceNames: false })}>Campus</button>
            <button type="button" aria-pressed={settings.workplaceNames} onClick={() => updateSettings({ workplaceNames: true })}>Workplace</button>
          </div>
        </div>
        <div className="cm-me-row">
          <div><b>Entrance</b><small>The gate when you arrive</small></div>
          <select value={entrance} onChange={(e) => setGate(e.target.value as 'daily' | 'skip')} aria-label="Entrance" data-testid="cm-me-entrance">
            <option value="daily">First visit each day</option>
            <option value="skip">Skip the gate</option>
          </select>
        </div>
        <div className="cm-me-row">
          <div><b>Reduce motion</b><small>No walking or zooming: things just appear</small></div>
          <div className="cm-me-seg" role="group" aria-label="Reduce motion">
            <button type="button" aria-pressed={settings.motion === 'device'} onClick={() => updateSettings({ motion: 'device' })}>Device</button>
            <button type="button" aria-pressed={settings.motion === 'on'} onClick={() => updateSettings({ motion: 'on' })}>On</button>
            <button type="button" aria-pressed={settings.motion === 'off'} onClick={() => updateSettings({ motion: 'off' })}>Off</button>
          </div>
        </div>
        <div className="cm-me-row">
          <div><b>List view</b><small>Every building and room as a simple list</small></div>
          <button type="button" className="cm-btn-line" onClick={() => { onClose(); openList(); }}>Open list</button>
        </div>
        <div className="cm-me-row">
          <div><b>All settings</b><small>Profile, photo, notifications and more</small></div>
          <Link className="cm-btn-line" to="/portal/settings">Settings</Link>
        </div>
      </div>
    </aside>
    </>
  );
}
