import React, { useMemo } from 'react';
import type { CampusBuilding, CampusAudience, ExplorerAccess } from '../campusMap';
import type { CampusPerson, CampusPresence } from '../campusApi';
import { initialsOf } from '../WhoIsHere';
import { art } from '../art/artColor';
import BuildingInterior from './BuildingInterior';
import type { FigurePerson } from './RoomFurniture';
import { doorLabel, ROOMS } from './roomModel';
import { readParticipant } from '../../../pages/portal/today/shellUtils';
import '../campusInside.css';

/**
 * Inside the building you arrived at (C11b, the prototype's flyIn + renderRoom): the room fills the map area beside the arrival
 * panel, revealed through a widening circle (instant with reduce motion), with a head count and "Step outside". The people in the
 * room are the people the server says are here and named (photo or initials, never an invented face); anyone anonymous is only
 * counted. Explorers looking into a members-only building see it through the glass.
 */
const TONES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];
const toneFor = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return art(`in-${TONES[h % TONES.length]}`); };

export interface CampusInsideProps {
  building: CampusBuilding;
  buildingName: string;
  audience: CampusAudience;
  access: ExplorerAccess;
  presence?: CampusPresence | null;
  onAir: boolean;
  reduceMotion: boolean;
  onStepOutside: () => void;
  onPickPerson?: (p: CampusPerson) => void;
  /** The on-duty AI staff desk in this building, already filtered for the viewer. */
  desk?: { name: string; title: string } | null;
  /** The route you are walking through the back door to (the door reveal), or null. */
  going?: string | null;
}

export default function CampusInside({ building: b, buildingName, audience, access, presence, onAir, reduceMotion, onStepOutside, onPickPerson, desk, going = null }: CampusInsideProps): React.ReactElement | null {
  const area = presence?.[b.id];
  const named = useMemo(() => (area?.people ?? []).filter((p): p is CampusPerson => 'enrollment_id' in p && !!(p as CampusPerson).display_name), [area]);
  const people: FigurePerson[] = named.map((p) => ({ key: p.enrollment_id, name: p.display_name, initials: initialsOf(p.display_name), photo: p.avatar_url, level: p.rung_name ?? null, tone: toneFor(p.enrollment_id) }));
  const you: FigurePerson = { key: 'you', name: 'You', initials: readParticipant().initials, photo: null, you: true,
    tone: art(audience === 'business' ? 'business' : audience === 'staff' ? 'explorer' : 'in-you') };
  if (!ROOMS[b.id]) return null;
  const locked = audience === 'explorer' && access === 'locked';
  const tag = audience === 'explorer' && access === 'demo' ? 'DEMO MODE · LOOK AROUND' : audience === 'explorer' && access === 'preview' ? 'PREVIEW' : null;
  return (
    <div className={`cm-inside${reduceMotion ? ' is-reduced' : ''}${locked ? ' is-locked' : ''}${going ? ' is-going' : ''}`} data-testid="cm-inside">
      <div className="cm-in-frame">
        <BuildingInterior id={b.id} people={people} you={you} doorSign={doorLabel(audience, access)} name={buildingName} onAir={onAir} desk={desk ? { name: desk.name, title: desk.title, initials: initialsOf(desk.name) } : null}
          onPick={onPickPerson ? (key) => { const p = named.find((x) => x.enrollment_id === key); if (p) onPickPerson(p); } : undefined} />
        {locked && <div className="cm-in-lock"><div><b>Members only</b><small>You&rsquo;re looking in through the glass</small></div></div>}
        {tag && <span className="cm-in-tag" data-testid="cm-inside-tag">{tag}</span>}
        {going && <div className="cm-in-go" role="status" data-testid="cm-inside-going"><div><b>Opening&hellip;</b><small>{going}</small><div className="bar"><i /></div></div></div>}
        <div className="cm-in-hud">
          {area && <span className="cm-in-count" data-testid="cm-inside-count"><i aria-hidden="true" />{area.count} here &middot; {buildingName}</span>}
          <button type="button" className="cm-btn-line" onClick={onStepOutside} data-testid="cm-inside-out">&larr; Step outside</button>
        </div>
      </div>
    </div>
  );
}
