import React from 'react';
import { art } from '../../art/artColor';
import type { FigurePerson } from '../Figure';
import type { Layout } from '../roomModel';
import { CUBICLES, hasCubicles, type SpotDef } from '../roomSpots';
import Cubicle from '../spots/Cubicle';
import { DESK_AT, STAFF_AT, furnitureOf, peoplePlaces } from './roomPlaces';
import { Billboard, person } from './billboard';

/**
 * What stands on the 3D room's floor besides you and your spot (lifted out of Room3D, C25): the furniture, the staff desk and its
 * staffer, the cubicles (C25, v6 D2: three down the left side in the work rooms; people present fill them first, a lit monitor and
 * their figure at it; anyone else takes the room's usual places), and the people really here (C26: heads in the auditorium's
 * seats). Real presence only: no one invented.
 */
export interface RoomCrowdProps {
  layout: Layout;
  spot: SpotDef | null;
  people: FigurePerson[];
  desk?: { name: string; initials: string; title: string } | null;
  onDesk?: (at: { x: number; y: number }) => void;
  onPick?: (key: string, at: { x: number; y: number }) => void;
  lanyard?: boolean;
  fw: number; fh: number; d: number;
}

export default function RoomCrowd(p: RoomCrowdProps): React.ReactElement {
  const { fw, fh, d, spot } = p;
  const tiers = p.layout === 'tiers';
  const places = peoplePlaces(p.layout, !!spot);
  const cubs = hasCubicles(spot) ? CUBICLES : [];
  const inCubs = p.people.slice(0, cubs.length);
  const shown = p.people.slice(cubs.length, cubs.length + places.length);
  const pick = (key: string) => (p.onPick ? (at: { x: number; y: number }) => p.onPick!(key, at) : undefined);
  const bb = { fw, fh, d };
  return (
    <>
      {furnitureOf(p.layout, !!spot).map((f, i) => (
        <Billboard key={`f${i}`} x={f.x} z={f.z - (f.kind === 'table' ? 0.02 : 0.015)} w={f.kind === 'table' ? 150 : fw * f.w}
          h={f.kind === 'table' ? 56 : f.kind === 'tier' ? 34 + i * 12 : 40} {...bb}
          className={`cm-r3-${f.kind}`} aria-hidden="true" data-testid={f.kind === 'tier' ? 'cm-r3-tier' : undefined}>{null}</Billboard>
      ))}
      {p.desk && (
        <>
          <Billboard x={DESK_AT[0]} z={DESK_AT[1]} w={150} h={46} {...bb} className="cm-r3-desk" aria-hidden="true">{p.desk.title.toUpperCase()}</Billboard>
          <Billboard x={STAFF_AT[0]} z={STAFF_AT[1]} w={70} h={130} {...bb} className="cm-r3-fig" data-testid="cm-inside-desk">
            {person({ key: 'desk', name: p.desk.name, initials: p.desk.initials, photo: null, tone: art('gold'), staff: true }, false, p.onDesk, 'cm-inside-staff')}
          </Billboard>
        </>
      )}
      {cubs.map((c, i) => (
        <Billboard key={`cub${i}`} x={c.x} z={c.z} w={120} h={110} {...bb} className={`cm-cub${i < inCubs.length ? ' is-occupied' : ''}`} aria-hidden="true" data-testid="cm-cub">
          <Cubicle kind={spot!.kind} occupied={i < inCubs.length} />
        </Billboard>
      ))}
      {inCubs.map((per, i) => (
        <Billboard key={per.key} x={cubs[i].x + 0.05} z={cubs[i].z - 0.03} w={70} h={130} {...bb} className="cm-r3-fig">
          {person(per, p.lanyard, pick(per.key), 'cm-inside-person')}
        </Billboard>
      ))}
      {shown.map((per, i) => (tiers ? (
        // C26: in the auditorium a person present is a head in a seat (one per person; the other seats stay empty)
        <Billboard key={per.key} x={places[i][0]} z={places[i][1]} w={30} h={34 + Math.floor(i / 7) * 12 + 22} {...bb} className="cm-r3-head" data-testid="cm-inside-person">
          <button type="button" className="h" aria-label={`${per.name}, open their card`} title={per.name}
            onClick={p.onPick ? (e) => p.onPick!(per.key, { x: e.clientX, y: e.clientY }) : undefined}>{per.initials}</button>
        </Billboard>
      ) : (
        <Billboard key={per.key} x={places[i][0]} z={places[i][1]} w={70} h={130} {...bb} className="cm-r3-fig">
          {person(per, p.lanyard, pick(per.key), 'cm-inside-person')}
        </Billboard>
      )))}
    </>
  );
}
