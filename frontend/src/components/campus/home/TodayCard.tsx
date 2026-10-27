import React from 'react';
import { Link } from 'react-router-dom';
import type { CampusAudience } from '../campusMap';
import type { PlanStop } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';
import type { OpenHouseView } from '../../../services/onboardingApi';
import { useCampusEvents } from '../events/EventSignup';
import { upcoming } from '../events/eventsModel';

/**
 * "Your Today page" (Basecamp C50, v13 T2): Today is the Explorer's home base, so it is the first thing in the side panel, under the
 * greeting. Explorers get a whole-card link with up to four facts, each from real data and left out when there is nothing real to
 * show (next step = the plan's next stop; today's plan done of total; coming up = the next event; help = Maya, only while her desk
 * is on duty) and a big Open Today button. Members and staff get a slim row. Both open /portal/today?stay=1.
 */
export const TODAY_HREF = '/portal/today?stay=1';

export interface TodayFact { label: string; value: string }
export function todayFacts(stops: PlanStop[] | null, events: OpenHouseView[] | null, desks: StaffDesk[], now: Date): TodayFact[] {
  const out: TodayFact[] = [];
  const next = stops?.find((s) => !s.done);
  if (next) out.push({ label: 'Next step', value: next.title });
  if (stops && stops.length) out.push({ label: 'Today’s plan', value: `${stops.filter((s) => s.done).length} of ${stops.length} done` });
  const ev = upcoming(events ?? [], now, 1)[0];
  if (ev) out.push({ label: 'Coming up', value: ev.title });
  if (desks.some((d) => d.id === 'maya' && d.on_duty)) out.push({ label: 'Help', value: 'Maya, admissions · replies in seconds' });
  return out;
}

/** C51 (v13 T3): an Explorer arriving at the Schedule tower sees where Today lives, first thing in the card. */
export function TowerTodayTile({ onOpen }: { onOpen: (route: string) => void }): React.ReactElement {
  return (
    <div className="cm-tower-today" data-testid="cm-tower-today">
      <p><span aria-hidden="true">📅</span> <b>Today lives here</b> &middot; Your next step, today&rsquo;s plan and events, on one page</p>
      <div className="cm-tower-today-acts">
        <button type="button" className="cm-btn-red" onClick={() => onOpen(TODAY_HREF)}>Open Today &rarr;</button>
        <button type="button" className="cm-btn-line" onClick={() => onOpen('/portal/schedule')}>Full schedule</button>
      </div>
    </div>
  );
}

export function TodayCard({ audience, stops, desks, now }: { audience: CampusAudience; stops: PlanStop[] | null; desks: StaffDesk[]; now: Date }): React.ReactElement {
  const explorer = audience === 'explorer';
  const events = useCampusEvents(explorer);
  if (!explorer) {
    const plan = stops && stops.length ? `${stops.filter((s) => s.done).length} of ${stops.length} done · ` : '';
    return (
      <Link to={TODAY_HREF} className="cm-today-row" data-testid="cm-today-row">
        <span aria-hidden="true">📅</span> <b>Today</b> <span>{plan}your plan, events and next step</span> <span className="go">Open &rarr;</span>
      </Link>
    );
  }
  const facts = todayFacts(stops, events, desks, now);
  return (
    <Link to={TODAY_HREF} className="cm-today-card" data-testid="cm-today-card" aria-label="Your Today page: open Today">
      <small>YOUR HOME BASE &middot; AFTER WHAT IS COMING UP</small>
      <b><span aria-hidden="true">📅</span> Your Today page</b>
      <span className="cm-today-lead">Everything for today in one place. Come back to it any time with the red Today button at the top.</span>
      {facts.length > 0 && <dl>{facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
      <span className="cm-btn-red cm-today-go">Open Today &rarr;</span>
    </Link>
  );
}
