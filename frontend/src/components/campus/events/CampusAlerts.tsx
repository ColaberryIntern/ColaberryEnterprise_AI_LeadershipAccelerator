import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCampus } from '../CampusContext';
import { useCampusAudience } from '../useCampusAudience';
import { CAMPUS_BUILDINGS, buildingName } from '../campusMap';
import { cheer } from '../campusCheerBus';
import CampusCheer from '../CampusCheer';
import { useCampusEvents } from './EventSignup';
import { occurrences, useWeekdaySessions } from './weekdaySessions';
import { alertCopy, alertItems, dueAlerts, markShown, readShown } from './alertsModel';

/**
 * The 5-minute alerts (Basecamp C64): while the campus is open in a tab, a member gets one cheer toast five minutes before each event
 * and each weekly session open to members, an intern also before the Monday call, each with "Walk there" (the map walks to the
 * building: the Meeting Rooms since C62). Members only (the campus audience 'member', interns included): Explorers and business
 * accounts get no alerts. Mounted ONCE per page: by CampusLayers on portal pages (with `host`, which also shows the toast there) and
 * by the campus home (which has its own toast). FAILURE: no events or sessions (a failed read) means no alerts, never a guessed one.
 */
const TICK_MS = 15_000;

export default function CampusAlerts({ host = false }: { host?: boolean }): React.ReactElement | null {
  const { active, settings, openMap } = useCampus();
  const { audience, ready } = useCampusAudience();
  const enabled = !!(active && ready && audience === 'member');
  const events = useCampusEvents(enabled);
  const weekly = useWeekdaySessions(enabled);
  const [now, setNow] = useState(() => Date.now());
  const shown = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, [enabled]);
  const items = useMemo(
    () => (enabled ? alertItems(events ?? [], weekly ? occurrences(weekly.sessions, Date.now(), 2) : [], new Date()) : []),
    [enabled, events, weekly],
  );
  useEffect(() => {
    if (!items.length) return;
    if (!shown.current) shown.current = readShown(now);
    const due = dueAlerts(items, now, shown.current);
    if (!due.length) return;
    due.forEach((i) => shown.current!.add(i.key));
    markShown(due.map((i) => i.key), now);
    for (const i of due) {
      const b = CAMPUS_BUILDINGS.find((x) => x.id === i.building);
      const copy = alertCopy(i, now, b ? buildingName(b, settings.workplaceNames) : 'the campus');
      cheer({ ...copy, ms: 12_000, action: { label: 'Walk there', run: () => openMap(i.building) } });
    }
  }, [items, now, settings.workplaceNames, openMap]);
  return host ? <CampusCheer reduceMotion={settings.reduceMotion} /> : null;
}
