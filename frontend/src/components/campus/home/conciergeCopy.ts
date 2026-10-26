import type { BuildingId, CampusAudience, CampusBuilding } from '../campusMap';
import { buildingName } from '../campusMap';
import type { CampusPresence } from '../campusApi';
import type { PlanStop } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';

/**
 * The concierge's words (WP-4), the prototype's renderMoment (docs/design/campus/colaberry-campus.html D:1845-1880), kept pure so
 * every line is tested. Only the copy patterns are the prototype's: its numbers and names (15 of 20 seats, "4 could use a hand",
 * "2 Explorers like you", the sample company) are invented and never shown. A line with nothing true to say falls back to a plain
 * one rather than a guess.
 */

/** The prototype's WRULES (D:1440-1444): in Workplace names the panel speaks of colleagues and HQ, not classmates and a campus. */
const WRULES: [RegExp, string][] = [
  [/Classroom/g, 'Training Room'], [/Cert Prep Center/g, 'Certification Center'], [/Events Hall/g, 'Town Hall'],
  [/My Progress/g, 'My Performance'], [/Game Room/g, 'Break Room'], [/\bSchedule\b/g, 'Calendar'], [/\bLibrary\b/g, 'Knowledge Base'],
  [/classmates/g, 'colleagues'], [/Classmates/g, 'Colleagues'], [/anywhere on campus/g, 'anywhere at HQ'], [/on campus/g, 'at HQ'], [/Campus/g, 'HQ'],
  [/campus/g, 'HQ'], [/Your cohort/g, 'Your team'], [/your cohort/g, 'your team'], [/Live class/g, 'Live session'], [/live class/g, 'live session'],
  [/Next class/g, 'Next session'], [/next class/g, 'next session'],
];
export const wd = (s: string, workplace: boolean): string => (workplace ? WRULES.reduce((a, [r, t]) => a.replace(r, t), s) : s);

/** The business district (the prototype's biz:true): "At Project Studio", never "At the Project Studio"; C21: "At Admissions". */
const DISTRICT: BuildingId[] = ['studio', 'career', 'gallery', 'admissions'];
/** "the Library" / "Project Studio" / "Admissions": a building's name as it reads after "at" or "in". */
export const theName = (b: CampusBuilding, workplace: boolean): string => `${DISTRICT.includes(b.id) ? '' : 'the '}${buildingName(b, workplace)}`;

/** "Colaberry Live · Thursday night" (Central time), while a broadcast is on air. */
export function liveKicker(now: Date): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return `Colaberry Live · ${day}${hour >= 17 ? ' night' : ''}`;
}

/** The kicker: an Explorer, a partner and staff always see their own (D:1854); a member sees where they are, or Colaberry Live. */
export function kickerFor(o: { audience: CampusAudience; here: CampusBuilding | null; workplace: boolean; live: boolean; now: Date; company?: string | null;
  onLawn?: boolean }): string {
  if (o.audience === 'explorer') return 'Explorer · visitor pass';
  if (o.audience === 'staff') return 'Staff view · every building';
  if (o.audience === 'business') return `Partner visit${o.company ? ` · ${o.company}` : ''}`;
  if (o.live) return liveKicker(o.now);
  // C17: walked out onto the grass (no building, not at the gate either): the prototype's "On campus".
  if (!o.here && o.onLawn) return 'On campus';
  if (!o.here || o.here.kind === 'gate') return o.workplace ? 'In the lobby' : 'At the main gate';
  return `At ${theName(o.here, o.workplace)}`;
}

/** "Good morning" before noon (the small hours too, as the prototype's partOfDay), "Good afternoon" before 5 PM, else evening. */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The greeting: a partner is welcomed ("Welcome, Elaine."); quiet hours say "Hey" (the prototype's quiet moment). */
export function greetLine(audience: CampusAudience, first: string, hour: number, quiet: boolean): string {
  const name = first ? `, ${first}` : '';
  if (audience === 'business') return `Welcome${name}.`;
  return `${quiet && audience === 'member' ? 'Hey' : greetingFor(hour)}${name}.`;
}

/** The moment the member's lead speaks to, first true one wins (the prototype's MOMENT_ORDER, with what this campus can know). */
export type Moment = 'live' | 'toured' | 'down' | 'soon' | 'quiet' | 'now';
export function momentOf(o: { live: boolean; justToured: boolean; presenceError: boolean; classSoon: boolean; quiet: boolean }): Moment {
  if (o.live) return 'live';
  if (o.justToured) return 'toured';
  if (o.presenceError) return 'down';
  if (o.classSoon) return 'soon';
  if (o.quiet) return 'quiet';
  return 'now';
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export interface LeadInput {
  audience: CampusAudience;
  moment: Moment;
  firstName: string;
  workplace: boolean;
  buildings: CampusBuilding[];
  /** The live building's name (the lit path leads there). */
  liveAt: string | null;
  next: PlanStop | null;
  dutyNames: string[];
  tourStops: number | null;
  /** Staff: learners on campus right now (null: unknown). */
  onCampus: number | null;
  /** WP-6: Colaberry Live's state (the prototype's per-state lead). */
  liveState?: string;
}

/** After the tour (the prototype's finishTour lead): what the tour covered, and your real next step if you have one. */
function afterTour(i: LeadInput): string {
  const you = i.firstName ? `, ${i.firstName}` : '';
  if (i.audience === 'explorer') return `That’s the whole campus${you}. Everything marked OPEN is yours to keep using, and enrolling opens the rest.`;
  if (i.audience === 'business') return 'Tour complete. Your company page is in the Partner Office whenever you need it.';
  const b = i.next?.buildingId ? i.buildings.find((x) => x.id === i.next!.buildingId) : undefined;
  return `That’s everything in your seat${you}.${i.next && b ? ` Your next step — ${i.next.title} — is waiting in the ${buildingName(b, i.workplace)}.` : ''}`;
}

export function leadFor(i: LeadInput): string {
  const at = i.liveAt ?? 'the live room';
  if (i.moment === 'toured') return wd(afterTour(i), i.workplace);
  if (i.audience === 'explorer') {
    return i.moment === 'live' ? `Colaberry Live is on — watch a preview from anywhere, or walk to the ${at}.`
      : 'Look around freely. Buildings marked 🔒 are for enrolled members — you can still peek inside.';
  }
  if (i.audience === 'business') {
    const n = i.tourStops;
    return `Here is where your team learns and builds. ${n ? `Take the ${NUMBER_WORDS[n] ?? n}-stop tour, or explore on your own.` : 'Explore on your own.'}`;
  }
  if (i.audience === 'staff' && i.moment !== 'live') {
    return i.onCampus === null ? 'Here is where everyone is right now.' : `${i.onCampus} ${i.onCampus === 1 ? 'learner' : 'learners'} on campus.`;
  }
  const duty = i.dutyNames.length ? ` ${andList(i.dutyNames)} ${i.dutyNames.length === 1 ? 'is' : 'are'} still on duty if you need them.` : '';
  const line: Record<Exclude<Moment, 'toured'>, string> = {
    live: i.liveState === 'reconnecting' ? 'The broadcast hit a snag and is reconnecting on its own. Stay put, there is nothing to refresh.'
      : i.liveState === 'backstage' ? `Colaberry Live opens in a moment. The ${at} doors are open and your cohort is heading in.`
      : `Colaberry Live is on air. Follow the lit path to the ${at}, or watch from anywhere on campus.`,
    down: 'We can’t load who’s online right now. Everything else works — buildings, pages and messages.',
    soon: 'Live class starts in a few minutes.',
    quiet: `It’s quiet on campus right now — nobody else is online.${duty}`,
    now: 'Nothing is starting soon, so this is focus time.',
  };
  return wd(line[i.moment], i.workplace);
}

/** Who is on campus, for the pulse. A partner's server names only their teammates, so the named entries ARE their people. */
export function pulseOf(presence: CampusPresence | null, buildings: CampusBuilding[]): { total: number; busiest: CampusBuilding | null; busiestCount: number; named: number } {
  let total = 0, busiest: CampusBuilding | null = null, busiestCount = 0, named = 0;
  for (const b of buildings) {
    const a = presence?.[b.id];
    const n = a?.count ?? 0;
    total += n;
    named += (a?.people ?? []).filter((e) => 'enrollment_id' in e).length;
    if (n > busiestCount) { busiest = b; busiestCount = n; }
  }
  // C13: people online with no building stand at the Quad: counted in the total, never the busiest building
  const quad = presence?.quad;
  if (quad) { total += quad.count; named += quad.people.filter((e) => 'enrollment_id' in e).length; }
  return { total, busiest, busiestCount, named };
}

/** The pulse line's words (D:2184-2200): bold part, the rest, its dot, and whether a press walks to the busiest building. */
export type PulseLine = { tone: 'live' | 'team' | 'quiet' | 'down'; bold: string; rest: string; walk: boolean };
export function pulseLine(o: { audience: CampusAudience; workplace: boolean; presence: CampusPresence | null; presenceError: boolean; buildings: CampusBuilding[]; staffOnDuty: boolean }): PulseLine | null {
  if (o.presenceError) return { tone: 'down', bold: 'Live presence is unavailable', rest: 'headcounts are hidden, not zero', walk: false };
  if (!o.presence) return null;
  const p = pulseOf(o.presence, o.buildings);
  const w = (s: string) => wd(s, o.workplace);
  if (p.total === 0) return { tone: 'quiet', bold: 'Quiet hours', rest: w(`nobody else on campus${o.staffOnDuty ? ' · staff on duty 24/7' : ''}`), walk: false };
  const busiest = p.busiest ? ` · busiest: ${buildingName(p.busiest, o.workplace)} (${p.busiestCount})` : '';
  if (o.audience === 'business') return { tone: 'team', bold: `${p.named} of your people on campus`, rest: `${p.total} ${p.total === 1 ? 'learner' : 'learners'} in all`, walk: true };
  const who = o.audience === 'member' ? (p.total === 1 ? 'classmate' : 'classmates') : (p.total === 1 ? 'person' : 'people');
  return { tone: 'live', bold: w(`${p.total} ${who} on campus`), rest: busiest.replace(/^ · /, ''), walk: true };
}

/** The help desk's role labels (D:2692): Reese the mentor, Dara curriculum (learning, in Workplace), Maya admissions. */
export function deskRole(d: Pick<StaffDesk, 'id' | 'title'>, workplace: boolean): string {
  if (d.id === 'reese') return 'Mentor';
  if (d.id === 'dara') return workplace ? 'Learning' : 'Curriculum';
  if (d.id === 'maya') return 'Admissions';
  return d.title;
}
