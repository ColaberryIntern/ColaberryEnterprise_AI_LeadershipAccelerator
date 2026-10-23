import React, { useCallback, useMemo, useState } from 'react';
import type { CampusPerson, CampusPresence } from './campusApi';
import type { BuildingId, CampusAudience, CampusBuilding } from './campusMap';
import { buildingName } from './campusMap';
import type { StaffDesk } from './campusPeopleApi';
import { desksForBuilding, isNamed, tokensFor } from './campusPeople';
import PeekCard from './PeekCard';

/**
 * The people on the map (WP-3): the chip's dots, a partner's teammates ("N · M yours": for a business viewer the server names only
 * teammates, so the named entries ARE theirs), and the peek a chip press opens. Kept out of CampusWorld so it stays readable.
 */
export function useMapPeople(o: {
  presence?: CampusPresence | null; presenceError: boolean; audience: CampusAudience; buildings: CampusBuilding[]; workplaceNames: boolean;
  staffDesks?: StaffDesk[]; onPerson?: (p: CampusPerson, buildingId: BuildingId) => void; walk: (id: BuildingId) => void;
}): {
  people?: Partial<Record<string, { shown: CampusPerson[]; more: number }>>; yours?: Partial<Record<string, number>>;
  openPeek: (id: BuildingId, x: number, y: number) => void; closePeek: () => void; peekOpen: boolean; peek: React.ReactNode;
} {
  const { presence, presenceError, audience, buildings, workplaceNames, staffDesks, onPerson, walk } = o;
  const people = useMemo(() => {
    if (!presence || presenceError) return undefined;
    const out: Record<string, ReturnType<typeof tokensFor>> = {};
    for (const [id, a] of Object.entries(presence)) { const tk = tokensFor(a); if (tk.shown.length) out[id] = tk; }
    return out;
  }, [presence, presenceError]);
  const yours = useMemo(() => {
    if (audience !== 'business' || !presence || presenceError) return undefined;
    const out: Record<string, number> = {};
    for (const [id, a] of Object.entries(presence)) out[id] = a.people.filter(isNamed).length;
    return out;
  }, [audience, presence, presenceError]);
  const [at, setAt] = useState<{ id: BuildingId; x: number; y: number } | null>(null);
  const openPeek = useCallback((id: BuildingId, x: number, y: number) => setAt({ id, x, y }), []);
  const closePeek = useCallback(() => setAt(null), []);
  const b = at ? buildings.find((x) => x.id === at.id) : undefined;
  const area = at && presence && !presenceError ? presence[at.id] : undefined;
  const peek = at && b && area ? (
    <PeekCard buildingName={buildingName(b, workplaceNames)} count={area.count} people={area.people} x={at.x} y={at.y}
      desks={staffDesks ? desksForBuilding(staffDesks, b.id, audience).filter((d) => d.on_duty) : []}
      word={workplaceNames ? 'colleagues' : audience === 'member' ? 'classmates' : 'people'}
      onPerson={onPerson ? (p) => { setAt(null); onPerson(p, b.id); } : () => undefined}
      onWalk={() => { setAt(null); walk(b.id); }} onClose={closePeek} />
  ) : null;
  return { people, yours, openPeek, closePeek, peekOpen: !!peek, peek };
}
