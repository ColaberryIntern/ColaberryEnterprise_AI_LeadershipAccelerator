import React from 'react';
import { useCampus } from '../CampusContext';
import { useCampusView } from '../useCampusView';
import { useHomeFacts } from './useHomeFacts';
import { useMyPhoto } from './useMyPhoto';
import { readParticipant } from '../../../pages/portal/today/shellUtils';
import CampusMePanel from './CampusMePanel';

/**
 * Where the Me panel lives (WP-7, E M1): the campus home and every campus page mount this once, and it shows the panel while
 * CampusContext.meOpen is true (the home's top bar, a page banner's "you" button, an unlock cheer's Locker). Nothing is fetched
 * while it is closed: the body, with its name and photo reads, mounts only when the panel opens.
 */
function MeHostBody({ fullName, initials, onClosed }: { fullName?: string; initials?: string; onClosed?: () => void }): React.ReactElement {
  const { closeMe } = useCampus();
  const { audience } = useCampusView();
  const facts = useHomeFacts(false);
  const photo = useMyPhoto(true, false); // the home and the portal shell already read it once
  return (
    <CampusMePanel audience={audience} fullName={fullName || facts.fullName} initials={initials || facts.initials || readParticipant().initials}
      photo={photo} onClose={() => { closeMe(); onClosed?.(); }} />
  );
}

export default function CampusMeHost(p: { fullName?: string; initials?: string; onClosed?: () => void }): React.ReactElement | null {
  const { meOpen, active } = useCampus();
  return meOpen && active ? <MeHostBody {...p} /> : null;
}
