import React, { useMemo } from 'react';
import type { CampusAudience } from '../campusMap';
import type { CampusPerson } from '../campusApi';
import { initialsOf } from '../WhoIsHere';
import { placePeople, type HqPlaced } from './hqModel';
import type { HqState } from './useHq';
import { HqLobby, HqOutside } from './HqOutside';
import { HqCab, HqFloorScene } from './HqInside';
import type { HqPerson } from './HqPeople';
import { HqPanel } from './HqPanel';
import { useHomeFacts } from '../home/useHomeFacts';
import { useCampusMgmt } from '../campusMgmt';
import { useCampus } from '../CampusContext';
import type { StaffDesk } from '../campusPeopleApi';
import './hq.css';

/**
 * Campus HQ (H5): the elevator building inside the room frame (CampusInside), in place of the generic 3D room. The scene and
 * the arrival panel share one useHq state (ArrivalPanel owns it). People are the presence server's named employees in this
 * building; a staff viewer also gets each one's sidebar page, which places them on a floor and at a door (placePeople).
 */
export function toHqPeople(named: CampusPerson[]): HqPerson[] {
  return named.map((p) => ({ key: p.enrollment_id, name: p.display_name, initials: initialsOf(p.display_name), photo: p.avatar_url, hq_path: p.hq_path }));
}

/**
 * C87: an AI agent whose place is a Staff Office floor stands at its office door (Dara at Curriculum on the Program floor).
 * The server lists such a desk only for a badge that opens that floor, so nothing here needs its own gate.
 */
export function deskPeople(desks: StaffDesk[] | null | undefined): HqPerson[] {
  return (desks ?? []).filter((d) => d.on_duty && d.office)
    .map((d) => ({ key: `desk-${d.id}`, name: `${d.name} (AI, ${d.title})`, initials: initialsOf(d.name), photo: null, hq_path: d.office ?? undefined }));
}

export function useHqPlaced(s: HqState, named: CampusPerson[]): HqPlaced<HqPerson> {
  const { staffDesks } = useCampus();
  return useMemo(() => placePeople(s.hq, [...toHqPeople(named), ...deskPeople(staffDesks)]), [s.hq, named, staffDesks]);
}

const AUDIENCE_TITLE: Record<CampusAudience, string> = { member: 'Member', explorer: 'Explorer', business: 'Partner', staff: 'Colaberry staff' };

/** The arrival panel's HQ part, with your badge (your name, initials and role label: the mgmt role's own label for staff). */
export function HqArrivalSide({ s, audience, face, named }: { s: HqState; audience: CampusAudience; face: string; named: CampusPerson[] }): React.ReactElement {
  const facts = useHomeFacts(false);
  const mgmt = useCampusMgmt();
  const placed = useHqPlaced(s, named);
  const name = facts.fullName || 'You';
  const who = { name, initials: facts.initials || initialsOf(name), title: (audience === 'staff' && mgmt.label) || AUDIENCE_TITLE[audience] };
  return <HqPanel s={s} who={who} face={face} placed={placed} />;
}

export interface HqBuildingProps {
  s: HqState;
  audience: CampusAudience;
  face: string;
  firstName: string;
  desk: { name: string; initials: string } | null;
  named: CampusPerson[];
  onGround: (route: string) => void;
  reduceMotion: boolean;
}

export default function HqBuilding(p: HqBuildingProps): React.ReactElement {
  const { s } = p;
  const placed = useHqPlaced(s, p.named);
  const hour = new Date().getHours();
  const floor = s.scene === 'floor' ? s.floorOf(s.floor) : null;
  return (
    <div className={`cm-hq${p.reduceMotion ? ' is-reduced' : ''}`} data-testid="cm-hq" data-scene={s.scene}>
      {s.scene === 'ext' && <HqOutside s={s} face={p.face} hour={hour} people={placed.byFloor} />}
      {s.scene === 'lobby' && <HqLobby s={s} face={p.face} audience={p.audience} firstName={p.firstName} hour={hour} desk={p.desk}
        lobby={placed.lobby} people={placed.byFloor} onGround={p.onGround} />}
      {s.scene === 'cab' && <HqCab s={s} face={p.face} people={placed} />}
      {s.scene === 'floor' && floor && <HqFloorScene s={s} f={floor} people={placed} />}
      <div className="cm-hq-toast" aria-live="polite" data-testid="cm-hq-toast">{s.toast && <div className="t">{s.toast}</div>}</div>
    </div>
  );
}
