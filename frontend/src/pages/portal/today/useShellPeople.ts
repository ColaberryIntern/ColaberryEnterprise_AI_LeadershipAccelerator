import { useCallback, useEffect, useState } from 'react';
import { CohortContact, fetchCohortPresence, sendFriendRequest, respondToFriendRequest } from '../../../services/cohortPresenceApi';
import { fetchPeoplePanel, PeoplePanel } from '../../../services/peoplePanelApi';
import { pingPresence } from '../../../services/communityApi';
import { pingCampusBuilding } from '../../../components/campus/campusPing';

/**
 * The shell's people state (moved out of PortalShell in Campus C16, which had passed the repo's 500-line ceiling).
 *
 * Cohort contacts rail — real presence from GET /api/portal/cohort/presence on
 * a light 60s poll. Also ping our own presence so cohort-mates see us online
 * while we're anywhere in the portal (not just the Community tab), and (Campus C13) record the building of the page we are on.
 * Fail-soft: any error keeps the last roster and never breaks the shell.
 */
export function useShellPeople() {
  const [contacts, setContacts] = useState<CohortContact[]>([]);
  // Role-aware People panel (flag-gated server-side). null = flag OFF or error, in
  // which case the rail falls back to the legacy cohort-presence view below.
  const [panel, setPanel] = useState<PeoplePanel | null>(null);
  const refreshContacts = useCallback(() => {
    fetchCohortPresence().then(setContacts).catch(() => { /* keep last roster */ });
  }, []);
  const refreshPanel = useCallback(() => {
    fetchPeoplePanel().then(setPanel).catch(() => { /* fall back to cohort rail */ });
  }, []);
  useEffect(() => {
    refreshContacts();
    refreshPanel();
    pingPresence().catch(() => { /* non-fatal */ });
    pingCampusBuilding();
    const id = window.setInterval(() => {
      refreshContacts();
      refreshPanel();
      pingPresence().catch(() => { /* non-fatal */ });
      pingCampusBuilding();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refreshContacts, refreshPanel]);
  // Friend actions — fire, then refetch so friendshipStatus (and the friends-first
  // order) update. Fail-soft: an error just leaves the person addable.
  const onAddFriend = useCallback((id: string) => {
    sendFriendRequest(id).then(refreshContacts).catch(() => { /* stays addable */ });
  }, [refreshContacts]);
  const onRespondFriend = useCallback((requesterId: string, accept: boolean) => {
    respondToFriendRequest(requesterId, accept).then(refreshContacts).catch(() => { /* keep request */ });
  }, [refreshContacts]);
  return { contacts, panel, onAddFriend, onRespondFriend };
}
