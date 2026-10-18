import { useCallback, useEffect, useState } from 'react';
import { openDm } from '../../../services/dmApi';
import { CohortContact, colorFor } from '../../../services/cohortPresenceApi';
import type { DmTarget } from './ChatDock';
import { registerDmHost } from '../../../components/campus/dmHost';

/**
 * PortalShell's direct-message wiring, moved verbatim out of PortalShell.tsx (Colaberry Campus C5: PortalShell is over
 * the 500-line ceiling, so it is split before the campus adds to it). Owns the open chat docks, the "could not open"
 * flash, the contact/person openers, and the `te-open-dm` bridge. The only addition: while the bridge is listening
 * it registers as the page's DM host (components/campus/dmHost.ts).
 */
export function useShellDms() {
  // Open (or focus) a 1:1 chat dock when a contact face is clicked.
  const [chats, setChats] = useState<DmTarget[]>([]);
  const openChatTarget = useCallback((t: DmTarget) => {
    setChats((prev) => (prev.some((x) => x.roomId === t.roomId) ? prev : [...prev, t]));
  }, []);
  const closeChat = useCallback((roomId: string) => {
    setChats((prev) => prev.filter((x) => x.roomId !== roomId));
  }, []);
  // Surfaces a failed DM-open (e.g. "You can only message people in your cohort")
  // instead of swallowing it — a click that silently does nothing looks broken.
  const [dmError, setDmError] = useState('');
  const flashDmError = useCallback((err: unknown) => {
    setDmError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not open that conversation.');
    window.setTimeout(() => setDmError(''), 3200);
  }, []);
  const openChat = useCallback((c: CohortContact) => {
    openDm(c.id).then((roomId) => openChatTarget({ roomId, name: c.name, color: c.color })).catch(flashDmError);
  }, [openChatTarget, flashDmError]);
  // People-panel rows carry only enrollmentId + name; derive the colour the same way
  // the cohort rail does so the same person is always the same colour.
  const openPerson = useCallback((enrollmentId: string, name: string) => {
    openDm(enrollmentId).then((roomId) => openChatTarget({ roomId, name, color: colorFor(enrollmentId) })).catch(flashDmError);
  }, [openChatTarget, flashDmError]);

  // Bridge: other surfaces (e.g. the community member profile drawer) open a DM
  // by dispatching a `te-open-dm` CustomEvent { enrollmentId, name, color? } —
  // the same dock mechanism the contacts rail uses, without prop-drilling the
  // opener into every page.
  useEffect(() => {
    const onOpenDm = (e: Event) => {
      const detail = (e as CustomEvent<{ enrollmentId?: string; name?: string; color?: string }>).detail;
      if (!detail?.enrollmentId) return;
      openDm(detail.enrollmentId)
        .then((roomId) => openChatTarget({ roomId, name: detail.name ?? 'Direct message', color: detail.color ?? colorFor(detail.enrollmentId!) }))
        .catch(flashDmError);
    };
    window.addEventListener('te-open-dm', onOpenDm as EventListener);
    const unregister = registerDmHost();
    return () => { window.removeEventListener('te-open-dm', onOpenDm as EventListener); unregister(); };
  }, [openChatTarget, flashDmError]);

  return { chats, openChatTarget, closeChat, dmError, openChat, openPerson };
}
