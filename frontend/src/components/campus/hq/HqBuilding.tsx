import React, { useMemo } from 'react';
import type { CampusAudience } from '../campusMap';
import type { CampusPerson } from '../campusApi';
import { initialsOf } from '../WhoIsHere';
import { floorAgents, placePeople, type HqPlaced } from './hqModel';
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
 * C87 placed an AI agent on a Staff Office floor as a face on its office door (Dara at Curriculum on the Program floor), which
 * nobody could press. C119 (Ali 2026-11-06): she stands at that floor's front desk in its lobby instead, and pressing her opens
 * her staff card (FloorLobbyDesk). So the doors carry only the people really at them; the agents come from useFloorAgents.
 */
export function useHqPlaced(s: HqState, named: CampusPerson[]): HqPlaced<HqPerson> {
  return useMemo(() => placePeople(s.hq, toHqPeople(named)), [s.hq, named]);
}

/** The AI agents at the front desk of the floor the viewer is standing on (none off a floor). Gated by floorAgents. */
export function useFloorAgents(s: HqState): StaffDesk[] {
  const { staffDesks } = useCampus();
  const f = s.scene === 'floor' ? s.floorOf(s.floor) : null;
  return useMemo(() => (f ? floorAgents(s.hq, f, staffDesks) : []), [s.hq, f, staffDesks]);
}

const AUDIENCE_TITLE: Record<CampusAudience, string> = { member: 'Member', explorer: 'Explorer', business: 'Partner', staff: 'Colaberry staff' };

/** The arrival panel's HQ part, with your badge (your name, initials and role label: the mgmt role's own label for staff). */
export function HqArrivalSide({ s, audience, face, named }: { s: HqState; audience: CampusAudience; face: string; named: CampusPerson[] }): React.ReactElement {
  const facts = useHomeFacts(false);
  const mgmt = useCampusMgmt();
  const placed = useHqPlaced(s, named);
  const name = facts.fullName || 'You';
  const who = { name, initials: facts.initials || initialsOf(name), title: (audience === 'staff' && mgmt.label) || AUDIENCE_TITLE[audience] };
  const agents = useFloorAgents(s);
  return <HqPanel s={s} who={who} face={face} placed={placed} agents={agents} />;
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
  const agents = useFloorAgents(s);
  const hour = new Date().getHours();
  const floor = s.scene === 'floor' ? s.floorOf(s.floor) : null;
  return (
    <div className={`cm-hq${p.reduceMotion ? ' is-reduced' : ''}`} data-testid="cm-hq" data-scene={s.scene}>
      {s.scene === 'ext' && <HqOutside s={s} face={p.face} hour={hour} people={placed.byFloor} />}
      {s.scene === 'lobby' && <HqLobby s={s} face={p.face} audience={p.audience} firstName={p.firstName} hour={hour} desk={p.desk}
        lobby={placed.lobby} people={placed.byFloor} onGround={p.onGround} />}
      {s.scene === 'cab' && <HqCab s={s} face={p.face} people={placed} />}
      {s.scene === 'floor' && floor && <HqFloorScene s={s} f={floor} people={placed} agents={agents} />}
      <div className="cm-hq-toast" aria-live="polite" data-testid="cm-hq-toast">{s.toast && <div className="t">{s.toast}</div>}</div>
    </div>
  );
}
