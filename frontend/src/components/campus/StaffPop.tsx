import React, { useEffect, useState } from 'react';
import type { BuildingId, CampusAudience, CampusBuilding } from './campusMap';
import { buildingName } from './campusMap';
import type { StaffDesk as Desk } from './campusPeopleApi';
import { mayaAllowedFor } from './campusPeople';
import StaffDesk from './StaffDesk';
import { onStaffCard } from './staffCard';
import { popPosition, usePopover } from './usePopover';
import type { At } from './usePopover';
import './campusPop.css';

/**
 * The AI staff card's host on the map (WP-5, Q7): listens for openStaffCard() from the help desk, Who's here and the rooms, and
 * shows that desk's card where it was pressed. Only a desk this viewer may see opens (Maya: Explorers and staff). Esc and a press
 * outside close it; "Visit the desk" closes it and walks there.
 */
export function placeName(b: CampusBuilding | undefined, workplace: boolean): string {
  if (!b) return workplace ? 'the Plaza' : 'the Quad';
  if (b.kind === 'gate') return workplace ? 'the Visitor entrance' : 'the Main Gate';
  return `the ${buildingName(b, workplace)}`;
}

function Card({ desk, at, place, here, workplace, onClose, onVisit, onMessaged }: {
  desk: Desk; at?: At; place: string; here: boolean; workplace: boolean; onClose: () => void; onVisit: () => void; onMessaged?: () => void;
}): React.ReactElement {
  const box = usePopover(onClose);
  // Focus moves into the card; on close it goes back to what opened it (a chip, the desk bubble), so a second Esc still reaches
  // the map and closes the building card, never <body>
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
    box.current?.focus();
    return () => { if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected)) opener.focus(); };
  }, [box]);
  return (
    <div className="cm-pcard is-staff" ref={box} tabIndex={-1} style={popPosition(at, 380)} role="dialog" aria-label={`${desk.name}, AI staff`} data-testid="cm-staff-card">
      <button type="button" className="cm-pc-x" onClick={onClose} aria-label={`Close ${desk.name}'s card`}>×</button>
      <StaffDesk desk={desk} place={place} here={here} workplace={workplace} onVisit={onVisit} onMessaged={onMessaged} />
    </div>
  );
}

export function useStaffPop(o: { desks?: Desk[]; audience: CampusAudience; buildings: CampusBuilding[]; workplace: boolean; hereId: BuildingId | null;
  walk: (id: BuildingId) => void; onMessaged?: () => void }): { open: boolean; close: () => void; node: React.ReactNode } {
  const [req, setReq] = useState<{ id: string; at?: At } | null>(null);
  const { desks, audience } = o;
  useEffect(() => onStaffCard((r) => {
    const d = desks?.find((x) => x.id === r.id);
    if (d && (d.id !== 'maya' || mayaAllowedFor(audience))) setReq(r);
  }), [desks, audience]);
  const desk = req ? o.desks?.find((x) => x.id === req.id) : undefined;
  const close = () => setReq(null);
  if (!req || !desk) return { open: false, close, node: null };
  const b = o.buildings.find((x) => x.id === desk.building);
  return {
    open: true, close,
    node: <Card desk={desk} at={req.at} place={placeName(b, o.workplace)} here={o.hereId === desk.building} workplace={o.workplace}
      onClose={close} onVisit={() => { setReq(null); o.walk(desk.building as BuildingId); }} onMessaged={o.onMessaged} />,
  };
}
