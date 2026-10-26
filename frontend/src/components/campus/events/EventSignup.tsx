import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPublicEvents, type OpenHouseView } from '../../../services/onboardingApi';
import { eventsFor, signupOf } from './eventsModel';
import { useCampusView } from '../useCampusView';

/**
 * C27 (v6 D5): the one-tap event button and the events every campus surface shares. "Sign up" opens Eventbrite (a new tab, the
 * record of registration); "✓ You're going" is what Eventbrite's attendee mirror says. Coming back to the tab refetches, so the
 * button flips once the mirror has caught up; until then it says the sign-up shows up shortly.
 */
export function EventSignup({ event, compact = false }: { event: OpenHouseView; compact?: boolean }): React.ReactElement | null {
  const s = signupOf(event);
  const [opened, setOpened] = useState(false);
  if (s.kind === 'going') return <span className="cm-ev-going" data-testid={`cm-ev-going-${event.id}`}>✓ You&rsquo;re going</span>;
  if (s.kind === 'none') return null;
  return (
    <a className={`cm-ev-signup${compact ? ' is-compact' : ''}`} href={s.href} target="_blank" rel="noopener noreferrer" data-testid={`cm-ev-signup-${event.id}`}
      onClick={(e) => { e.stopPropagation(); setOpened(true); }} title="Sign up on Eventbrite (opens a new tab)">
      {opened ? 'Finish on Eventbrite ↗' : 'Sign up'}
    </a>
  );
}

/** The next 30 days of events, refetched when the learner comes back to this tab (after signing up on Eventbrite). */
export function useCampusEvents(enabled: boolean, days = 30): OpenHouseView[] | null {
  const [events, setEvents] = useState<OpenHouseView[] | null>(null);
  const load = useCallback(() => {
    if (!enabled) return;
    fetchPublicEvents(days).then(setEvents).catch(() => setEvents((prev) => prev ?? []));
  }, [enabled, days]);
  useEffect(() => {
    load();
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); };
  }, [load]);
  // business accounts never see an Open House (eventsModel.eventsFor)
  const { audience } = useCampusView();
  return useMemo(() => (events ? eventsFor(audience, events) : events), [events, audience]);
}
