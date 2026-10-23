import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCampus } from '../CampusContext';
import { readEntrance, writeEntrance, ENTRANCE_LABEL } from './campusEntrance';
import type { Entrance } from './campusEntrance';

/**
 * The Me panel's settings (the prototype's renderSettings, D:3538-3543), only the ones that really exist:
 * how you get around (campus / classic), names (campus / workplace), the entrance (WP-7: First visit each day / Every time / Never),
 * reduce motion, WP-7 "Show which building I'm in" (decision Q14: off, the server forgets your building and classmates see you only
 * as online), the list view, and the full Settings page.
 */
export default function MeSettings({ onClose }: { onClose: () => void }): React.ReactElement {
  const { settings, updateSettings, openList } = useCampus();
  const [entrance, setEntrance] = useState<Entrance>(readEntrance);
  const setGate = (v: Entrance) => { setEntrance(v); writeEntrance(v); };
  return (
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
        <select value={entrance} onChange={(e) => setGate(e.target.value as Entrance)} aria-label="Entrance" data-testid="cm-me-entrance">
          {(Object.keys(ENTRANCE_LABEL) as Entrance[]).map((k) => <option key={k} value={k}>{ENTRANCE_LABEL[k]}</option>)}
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
        <div><b>Show which building I&rsquo;m in</b><small>Off: classmates see you as &ldquo;online&rdquo;</small></div>
        <button type="button" className="cm-tgl" role="switch" aria-checked={settings.shareBuilding} aria-label="Show which building I'm in"
          onClick={() => updateSettings({ shareBuilding: !settings.shareBuilding })} data-testid="cm-me-share" />
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
  );
}
