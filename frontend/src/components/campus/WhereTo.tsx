import React, { useId, useMemo, useState } from 'react';
import { useCampus } from './CampusContext';
import { useCampusView } from './useCampusView';
import { searchCampus, SearchResult } from './campusSearch';
import type { BuildingId } from './campusMap';
import { openBookCall } from './admissions/admissionsCallApi';
import { openBoard } from './board/boardApi';
import { useCampusMgmt } from './campusMgmt';
import { buildHq } from './hq/hqModel';
import { setHqIntent } from './hq/hqIntent';

/**
 * "Where to?" (Colaberry Campus C3): a WAI-ARIA combobox over buildings, rooms and the people the
 * server named in live presence.
 *  - input role="combobox" with aria-expanded, aria-controls (the listbox), aria-activedescendant;
 *  - options role="option" with aria-selected; a polite live region announces the result count;
 *  - ArrowDown/ArrowUp move, Enter picks, Esc closes the list and keeps focus; a second Esc blurs.
 * Picking a room zooms through its building's door; a building or a person opens the map there.
 */
/** C11b: the campus home's top bar asks the prototype's "Where are you headed?"; the banner keeps "Where to?". */
export default function WhereTo({ placeholder = 'Where to?' }: { placeholder?: string } = {}): React.ReactElement {
  const { settings, presence, enterThroughDoor, openMap } = useCampus();
  const { buildings, audience } = useCampusView();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const talk = audience === 'member' || audience === 'explorer'; // C20: "Book a call with admissions" for learners and Explorers
  // Campus HQ: staff also find HQ floors and the rooms their badge opens (built from the same sections as the building)
  const mgmt = useCampusMgmt();
  const sectionsKey = mgmt.sections.join(',');
  // rebuilt when the sections change (keyed on their joined list)
  const hq = useMemo(() => (audience === 'staff' ? buildHq((s) => mgmt.sections.includes(s), true, 'staff') : null), [audience, sectionsKey]);
  const results = useMemo(() => searchCampus(q, buildings, presence, settings.workplaceNames, talk, hq), [q, buildings, presence, settings.workplaceNames, talk, hq]);
  const expanded = open && results.length > 0;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const pick = (r: SearchResult) => {
    setOpen(false); setQ('');
    if (r.kind === 'book') openBookCall();
    else if (r.kind === 'board') openBoard({ walk: true }); // C30: the Community Board (on a page it opens in place)
    else if (r.kind === 'room' && r.navigable) enterThroughDoor(r.route, null);
    else if (r.kind === 'hq') { setHqIntent(r.floor); openMap(r.buildingId as BuildingId); } // the HQ rides there as it opens
    else openMap(r.buildingId as BuildingId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => (results.length ? (a + 1) % results.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0)); }
    else if (e.key === 'Enter') { if (expanded && results[active]) { e.preventDefault(); pick(results[active]); } }
    else if (e.key === 'Escape') {
      e.preventDefault(); // this Esc belongs to the search box, never to "Step outside"
      if (expanded) setOpen(false); else (e.currentTarget as HTMLInputElement).blur();
    }
  };

  return (
    <div className="cm-whereto">
      <input
        className="cm-whereto-input" type="text" placeholder={placeholder} aria-label={`${placeholder} Search buildings, rooms and people`}
        role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
        aria-activedescendant={expanded && results[active] ? optionId(active) : undefined}
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} data-testid="cm-whereto"
      />
      <ul className="cm-whereto-list" role="listbox" id={listId} hidden={!expanded} aria-label="Places and people">
        {results.map((r, i) => (
          <li key={r.id} id={optionId(i)} role="option" aria-selected={i === active} className={`cm-whereto-opt${i === active ? ' is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); pick(r); }} onMouseEnter={() => setActive(i)} data-kind={r.kind}>
            <span className="cm-whereto-label">{r.label}</span>
            <small className="cm-whereto-detail">{r.kind === 'building' ? 'Building' : r.kind === 'room' ? `${r.detail}${r.navigable ? '' : ' - opening soon'}` : r.detail}</small>
          </li>
        ))}
      </ul>
      <span className="cm-sr-only" aria-live="polite" data-testid="cm-whereto-count">{q.trim() ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : ''}</span>
    </div>
  );
}
