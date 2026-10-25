import React, { useMemo } from 'react';
import type { OpenHouseView } from '../../../services/onboardingApi';
import type { BuildingId } from '../campusMap';
import { EventSignup, useCampusEvents } from './EventSignup';
import { useMySessions } from '../classroom/ClassSessions';
import { useHallway } from '../hallway/Hallway';
import { KIND_ICON, agenda, agendaWhen, type AgendaItem } from './agendaModel';
import { weekStrip } from './eventsModel';
import './campusEvents.css';

/**
 * The Schedule as one list (C33, v7 R6): the room's board ("YOUR WEEK · CLASSES, EVENTS & SESSIONS"), the arrival card's rows and
 * the side panel's Coming up, each row "‹icon› ‹day› · ‹time› · ‹title› · ‹building›" with its action: a class "🎓 Class" (walks to
 * the Classroom; on your calendar automatically), an event Sign up / ✓ You're going, a session "🚪 Booked" (walks to Meeting Rooms).
 */
export function useAgenda(enabled: boolean): AgendaItem[] | null {
  const sessions = useMySessions(enabled);
  const events = useCampusEvents(enabled);
  const { hallway } = useHallway(enabled);
  return useMemo(() => {
    if (!enabled || sessions === null || events === null) return null;
    return agenda({ sessions: sessions === 'error' ? [] : sessions, events: events ?? [], bookings: hallway?.bookings ?? [], now: new Date() });
  }, [enabled, sessions, events, hallway]);
}

const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

export function AgendaAction({ item, onWalk }: { item: AgendaItem; onWalk: (id: BuildingId) => void }): React.ReactElement | null {
  if (item.kind === 'event' && item.event) return <EventSignup event={item.event} compact />;
  if (item.kind === 'class') return <button type="button" className="cm-ag-act" onClick={stop(() => onWalk(item.building))}>🎓 Class</button>;
  if (item.kind === 'session') return <button type="button" className="cm-ag-act" onClick={stop(() => onWalk(item.building))}>🚪 Booked</button>;
  return null;
}

export function AgendaRow({ item, place, onWalk }: { item: AgendaItem; place: (id: BuildingId) => string; onWalk: (id: BuildingId) => void }): React.ReactElement {
  return (
    <li className={`cm-ag-row is-${item.kind}`} data-testid={`cm-ag-${item.id}`} data-kind={item.kind}>
      <span className="ic" aria-hidden="true">{KIND_ICON[item.kind]}</span>
      <span className="tx"><b>{item.title}</b><small>{agendaWhen(item.startIso)} · {place(item.building)}</small></span>
      <AgendaAction item={item} onWalk={onWalk} />
    </li>
  );
}

/** The arrival card's list (the Schedule). */
export function AgendaRows({ items, place, onWalk, limit = 6 }: { items: AgendaItem[] | null; place: (id: BuildingId) => string; onWalk: (id: BuildingId) => void; limit?: number }): React.ReactElement | null {
  if (items === null) return null;
  return (
    <div className="cm-ev" data-testid="cm-ag-rows">
      <div className="cm-sec">Your week · classes, events &amp; sessions</div>
      {items.length ? <ul className="cm-ev-rows">{items.slice(0, limit).map((i) => <AgendaRow key={i.id} item={i} place={place} onWalk={onWalk} />)}</ul>
        : <p className="cm-ev-none">Nothing on your calendar yet: no class, event or booked session ahead.</p>}
    </div>
  );
}

/** The Schedule room's board. */
export function AgendaBoard({ items, now, place, onWalk, onSection }: { items: AgendaItem[]; now: Date; place: (id: BuildingId) => string; onWalk: (id: BuildingId) => void; onSection: () => void }): React.ReactElement {
  const strip = weekStrip(items.map((i) => ({ starts_at: i.startIso }) as OpenHouseView), now);
  return (
    <>
      <div className="k">Your week · classes, events &amp; sessions</div>
      <div className="cm-ev-strip" data-testid="cm-board-strip">
        {strip.map((d) => (
          <span key={d.ymd} className={`d${d.today ? ' is-today' : ''}`} data-has-event={d.hasEvent || undefined}>
            <small>{d.wd}</small><b>{d.d}</b>{d.hasEvent && <i aria-label="something on your calendar that day" />}
          </span>
        ))}
      </div>
      <h3 className="cm-ev-board-h" data-testid="cm-board-title">{items.length ? 'Coming up' : 'Nothing on the calendar this week'}</h3>
      <ul className="cm-ev-board-rows" onClick={(e) => e.stopPropagation()}>
        {items.slice(0, 3).map((i) => <AgendaRow key={i.id} item={i} place={place} onWalk={onWalk} />)}
      </ul>
      <div className="row"><button type="button" className="b red" onClick={stop(onSection)} data-testid="cm-board-primary">Open my schedule &rarr;</button></div>
    </>
  );
}

/** COMING UP in the side panel: "‹day› · ‹time› · ‹building›" with Walk there →. */
export function ComingUpAgenda({ items, place, onWalk }: { items: AgendaItem[]; place: (id: BuildingId) => string; onWalk: (id: BuildingId) => void }): React.ReactElement | null {
  if (!items.length) return null;
  return (
    <div className="cm-coming" data-testid="cm-cc-coming-agenda">
      <small>COMING UP</small>
      {items.map((i) => (
        <div key={i.id} className="cm-coming-ev">
          <b><span aria-hidden="true">{KIND_ICON[i.kind]} </span>{i.title}</b>
          <span>{agendaWhen(i.startIso)} · {place(i.building)}</span>
          <button type="button" className="cm-ag-walk" onClick={() => onWalk(i.building)}>Walk there &rarr;</button>
        </div>
      ))}
    </div>
  );
}
