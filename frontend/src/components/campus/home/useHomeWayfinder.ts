import { useCallback, useMemo } from 'react';
import type { BuildingId, CampusAudience, CampusBuilding, ExplorerAccess } from '../campusMap';
import type { CampusPresence } from '../campusApi';
import type { StaffDesk } from '../campusPeopleApi';
import type { PersonCardTarget } from '../CampusContext';
import type { WfContext, WfItem } from '../wayfinderIndex';
import { mayaAllowedFor } from '../campusPeople';
import type { NowRow, Urgent } from './rightNow';
import { openBookCall } from '../admissions/admissionsCallApi';
import { openBoard } from '../board/boardApi';

/**
 * What the campus home's Wayfinder searches and what a pick does (WP-4): its context (the buildings and rooms this viewer has,
 * the people the server named, the staff on duty for this account, the urgent item and the panel's Right now rows as
 * "Suggested for you"), and a pick: a person opens their card, the urgent item runs there, a room walks there and flashes in the
 * card, anything else walks there.
 */
export function useHomeWayfinder(o: {
  audience: CampusAudience; workplace: boolean; buildings: CampusBuilding[]; accessOf: (b: CampusBuilding) => ExplorerAccess;
  presence: CampusPresence | null; presenceError: boolean; desks: StaffDesk[]; urgent: Urgent | null; suggested: NowRow[];
  goTo: (id: BuildingId, how?: { run?: boolean; flashRoom?: string | null }) => void; openPerson: (t: PersonCardTarget) => void;
}): { ctx: WfContext; onPick: (it: WfItem) => void } {
  const { audience, workplace, buildings, accessOf, presence, presenceError, desks, urgent, suggested, goTo, openPerson } = o;
  const ctx = useMemo<WfContext>(() => ({
    audience, workplace, buildings, accessOf, presence: presenceError ? null : presence,
    desks: desks.filter((d) => d.id !== 'maya' || mayaAllowedFor(audience)), urgent, suggested,
  }), [audience, workplace, buildings, accessOf, presence, presenceError, desks, urgent, suggested]);
  const onPick = useCallback((it: WfItem) => {
    if (it.kind === 'book') openBookCall();
    else if (it.kind === 'board') openBoard({ walk: true }); // C30: walk to the Community Board and open it
    else if (it.kind === 'person' && it.person) openPerson({ person: it.person, buildingId: it.buildingId });
    else goTo(it.buildingId, { run: !!it.run, flashRoom: it.kind === 'room' ? it.route ?? null : null });
  }, [goTo, openPerson]);
  return { ctx, onPick };
}
