import React, { useMemo } from 'react';
import type { CampusBuilding, CampusAudience, ExplorerAccess } from '../campusMap';
import type { CampusPerson, CampusPresence } from '../campusApi';
import { initialsOf } from '../WhoIsHere';
import { art } from '../art/artColor';
import { publicOnly } from '../campusGear';
import { levelOfRung } from '../../../services/bandLadder';
import BuildingInterior from './BuildingInterior';
import type { FigurePerson } from './RoomFurniture';
import type { WallFacts } from './RoomWalls';
import { doorLabel, ROOMS } from './roomModel';
import { readParticipant } from '../../../pages/portal/today/shellUtils';
import { useCampus } from '../CampusContext';
import { useMyPhoto } from '../home/useMyPhoto';
import '../campusInside.css';

/**
 * Inside the building you arrived at (C11b, the prototype's flyIn + renderRoom): the room fills the map area beside the arrival
 * panel, revealed through a widening circle (instant with reduce motion), with a head count and "Step outside". The people in the
 * room are the people the server says are here and named (photo or initials, never an invented face); anyone anonymous is only
 * counted. Explorers looking into a members-only building see it through the glass.
 *
 * WP-5: people wear their gear and carry their level coin; a partner's own people (the only ones their server names) get the teal
 * ring and their tag; the business rooms hand out red lanyards; the walls show real facts; "Ask <name> anything" opens the staff
 * card; the corner tag says DEMO MODE, PREVIEW (green) or, for a partner, PARTNER VIEW · YOUR TEAM IN TEAL.
 */
const TONES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];
const toneFor = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return art(`in-${TONES[h % TONES.length]}`); };
/** The prototype's roomBiz: the business district's rooms, or every room in Workplace names. */
const BIZ_ROOMS = new Set(['studio', 'career', 'gallery']);

export interface CampusInsideProps {
  building: CampusBuilding;
  buildingName: string;
  audience: CampusAudience;
  access: ExplorerAccess;
  presence?: CampusPresence | null;
  onAir: boolean;
  reduceMotion: boolean;
  onStepOutside: () => void;
  onPickPerson?: (p: CampusPerson, at: { x: number; y: number }) => void;
  /** The on-duty AI staff desk in this building, already filtered for the viewer. */
  desk?: { name: string; title: string } | null;
  onDesk?: (at: { x: number; y: number }) => void;
  /** The route you are walking through the back door to (the door reveal), or null. */
  going?: string | null;
  /** WP-5: you just came back out of a page: walk from the door to your seat. */
  fromDoor?: boolean;
  workplace?: boolean;
  wall?: WallFacts;
  onGame?: (game: string) => void;
}

function tagFor(audience: CampusAudience, access: ExplorerAccess): { text: string; tone: string } | null {
  if (audience === 'business') return { text: 'PARTNER VIEW · YOUR TEAM IN TEAL', tone: 'is-team' };
  if (audience === 'explorer' && access === 'demo') return { text: 'DEMO MODE · LOOK AROUND', tone: 'is-demo' };
  if (audience === 'explorer' && access === 'preview') return { text: 'PREVIEW', tone: 'is-preview' };
  return null;
}

export default function CampusInside(p: CampusInsideProps): React.ReactElement | null {
  const { building: b, buildingName, audience, access, presence, onAir, reduceMotion, onStepOutside, onPickPerson, desk, going = null } = p;
  const area = presence?.[b.id];
  const named = useMemo(() => (area?.people ?? []).filter((x): x is CampusPerson => 'enrollment_id' in x && !!(x as CampusPerson).display_name), [area]);
  const people: FigurePerson[] = named.map((x) => ({ key: x.enrollment_id, name: x.display_name, initials: initialsOf(x.display_name), photo: x.avatar_url,
    level: x.rung_name ?? null, levelN: levelOfRung(x.rung_name), gear: publicOnly(x.gear), team: audience === 'business', tone: toneFor(x.enrollment_id) }));
  // WP-7: you, as others see you: your photo, your public gear and, for learners, your level coin (it was initials only).
  const { look } = useCampus();
  const myPhoto = useMyPhoto(true, false);
  const earns = audience === 'member' || audience === 'explorer';
  const you: FigurePerson = { key: 'you', name: 'You', initials: readParticipant().initials, photo: myPhoto, you: true,
    gear: earns && look ? publicOnly(look.equipped) : undefined, levelN: earns && look ? levelOfRung(look.rung_name) : null,
    tone: art(audience === 'business' ? 'business' : audience === 'staff' ? 'explorer' : 'in-you') };
  if (!ROOMS[b.id]) return null;
  const locked = audience === 'explorer' && access === 'locked';
  const tag = tagFor(audience, access);
  return (
    <div className={`cm-inside${reduceMotion ? ' is-reduced' : ''}${locked ? ' is-locked' : ''}${going ? ' is-going' : ''}`} data-testid="cm-inside">
      <div className="cm-in-frame">
        <BuildingInterior id={b.id} people={people} you={you} doorSign={doorLabel(audience, access)} name={buildingName} onAir={onAir}
          desk={desk ? { name: desk.name, title: desk.title, initials: initialsOf(desk.name) } : null} onDesk={p.onDesk}
          lanyard={!!p.workplace || BIZ_ROOMS.has(b.id)} going={!!going} fromDoor={p.fromDoor} reduceMotion={reduceMotion} wall={p.wall} onGame={p.onGame}
          onPick={onPickPerson ? (key, at) => { const x = named.find((n) => n.enrollment_id === key); if (x) onPickPerson(x, at); } : undefined} />
        {locked && <div className="cm-in-lock"><div><b>🔒 Members only</b><small>You&rsquo;re looking in through the glass</small></div></div>}
        {tag && <span className={`cm-in-tag ${tag.tone}`} data-testid="cm-inside-tag">{tag.text}</span>}
        {going && <div className="cm-in-go" role="status" data-testid="cm-inside-going"><div><b>Opening&hellip;</b><small>{going}</small><div className="bar"><i /></div></div></div>}
        <div className="cm-in-hud">
          {area && <span className="cm-in-count" data-testid="cm-inside-count"><i aria-hidden="true" />{area.count} here &middot; {buildingName}</span>}
          <button type="button" className="cm-btn-line" onClick={onStepOutside} data-testid="cm-inside-out">&larr; Step outside</button>
        </div>
      </div>
    </div>
  );
}
