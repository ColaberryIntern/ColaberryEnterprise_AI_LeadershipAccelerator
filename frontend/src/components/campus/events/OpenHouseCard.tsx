import React, { useEffect, useState } from 'react';
import { fetchSchedule, type OpenHouseView } from '../../../services/onboardingApi';
import { centralParts } from '../admissions/admissionsCallApi';
import type { CampusAudience } from '../campusMap';

/**
 * The next Open House at the top of the side panel's Coming up (Basecamp C47; Ali, 2026-10-25), shaped like the admissions call card.
 * The event is real: GET /api/portal/onboarding/schedule's next_open_house (the next Eventbrite event named "Open House", via CCPP),
 * with is_registered / my_rsvp for this viewer. Per account:
 *  - Explorer, not signed up: always asked, "Save my seat" opens the event's Eventbrite registration (Eventbrite is the record);
 *  - Explorer, signed up: stays on as "You're going" until the event ends, so they don't miss it;
 *  - member: "Tell friends & family", sharing the registration link (the device's share sheet, else copy);
 *  - staff: a note, "Don't forget to tell everyone you meet", with the link to copy;
 *  - business accounts: nothing (not asked for).
 * No event (none scheduled, or the schedule call failed): no card. Never an invented date, link or count.
 */
export type OpenHouseVariant = 'signup' | 'going' | 'share' | 'staff';

export function openHouseVariant(audience: CampusAudience, ev: OpenHouseView | null, registered: boolean, now: Date): OpenHouseVariant | null {
  if (!ev || !ev.registration_url) return null;
  if (new Date(ev.ends_at ?? ev.starts_at).getTime() < now.getTime()) return null;
  if (audience === 'explorer') return registered ? 'going' : 'signup';
  if (audience === 'member') return 'share';
  if (audience === 'staff') return 'staff';
  return null;
}

export function useNextOpenHouse(enabled: boolean): { ev: OpenHouseView | null; registered: boolean } {
  const [state, setState] = useState<{ ev: OpenHouseView | null; registered: boolean }>({ ev: null, registered: false });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchSchedule()
      .then((s) => { if (alive) setState({ ev: s.next_open_house, registered: !!s.next_open_house?.is_registered || s.my_rsvp }); })
      .catch(() => { /* no card: the event is unknown, never guessed */ });
    return () => { alive = false; };
  }, [enabled]);
  return state;
}

/** Share through the device's sheet where there is one, else copy the link. Resolves to what happened, for the button's label. */
export async function shareOpenHouse(ev: OpenHouseView): Promise<'shared' | 'copied' | 'failed'> {
  const url = ev.registration_url as string;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  try {
    if (nav.share) { await nav.share({ title: ev.title, text: `Join me at the ${ev.title}`, url }); return 'shared'; }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function OpenHouseCard({ audience, ev, registered, now }: { audience: CampusAudience; ev: OpenHouseView | null; registered: boolean; now: Date }): React.ReactElement | null {
  const [said, setSaid] = useState<string | null>(null);
  const variant = openHouseVariant(audience, ev, registered, now);
  if (!variant || !ev) return null;
  const p = centralParts(ev.starts_at);
  const when = `${p.day} · ${p.time} ${p.zone}`;
  const share = async () => {
    const r = await shareOpenHouse(ev);
    setSaid(r === 'copied' ? 'Link copied' : r === 'shared' ? 'Thanks for sharing' : 'Copy the link from the event page');
  };
  return (
    <div className="cm-coming cm-coming-oh" data-testid="cm-cc-openhouse" data-variant={variant}>
      <small>{variant === 'staff' ? 'DON’T FORGET' : 'COMING UP'}</small>
      <b><span aria-hidden="true">🎪 </span>{ev.title}</b>
      <span>{when}</span>
      {variant === 'staff' && <span className="cm-coming-note">Tell everyone you come in contact with about the upcoming Open House.</span>}
      {variant === 'share' && <span className="cm-coming-note">Invite your friends and family.</span>}
      <div className="cm-book-row">
        {variant === 'signup' && <a className="cm-book-btn pri" href={ev.registration_url!} target="_blank" rel="noopener noreferrer" data-testid="cm-oh-signup">Save my seat ↗</a>}
        {variant === 'going' && <><span className="cm-coming-note" data-testid="cm-oh-going">✓ You&rsquo;re going</span>
          <a className="cm-book-btn" href={ev.registration_url!} target="_blank" rel="noopener noreferrer">Event details ↗</a></>}
        {(variant === 'share' || variant === 'staff') && <button type="button" className="cm-book-btn pri" onClick={() => { void share(); }} data-testid="cm-oh-share">
          {variant === 'share' ? 'Tell friends & family' : 'Copy the link'}</button>}
        {said && <span className="cm-coming-note" role="status" data-testid="cm-oh-said">{said}</span>}
      </div>
    </div>
  );
}
