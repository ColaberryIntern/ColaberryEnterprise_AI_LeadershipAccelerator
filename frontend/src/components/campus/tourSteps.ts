import { buildingName } from './campusMap';
import type { BuildingId, CampusAudience, CampusBuilding, ExplorerAccess } from './campusMap';

/**
 * The guided tours (Colaberry Campus C7), as pure data: member 9 stops, Explorer 7, business 6; staff has no tour.
 *
 * COPY RULES: each stop says what the building is, what you can do there and a tip, written from what the portal page behind it
 * really does today. No counts, dates, times, prices or progress figures (the prototype's "Week 5", ticket ids and KPI tiles were
 * illustrative and are not real for any given learner). Never "free". Copy never names a building: the stop's heading is the
 * building's name from the viewer's own campus (buildingName, so Workplace names and the Partner Office face apply).
 *
 * EXPLORER STATES come from the pages' own signals (campusAccess via accessOf, C6), never from this table: the same stop reads
 * "Preview", "Demo" or "Members" depending on what the page would really do for this viewer.
 */
export interface TourCopy { title: string; what: string; can: string[]; tip: string }
export interface TourStop extends TourCopy { buildingId: BuildingId; name: string; state: ExplorerAccess | null; note: string | null }
export interface Tour { audience: CampusAudience; name: string; stops: TourStop[] }

type CopyTable = Partial<Record<BuildingId, TourCopy>>;

const MEMBER: CopyTable = {
  lecture: { title: 'Your classroom', what: 'Every week of the Accelerator lives here, plus the live classes.', can: ['Pick up your lessons right where you left off', 'Check in to live classes for attendance credit', 'Rewatch a class from its replay'], tip: 'Most people miss the replays. They’re under Live sessions.' },
  library: { title: 'Knowledge on demand', what: 'Documents shared with everyone in the program: guides, templates and reference.', can: ['Find guides and reference material', 'Ask Dara at the curriculum desk to explain anything, around the clock'], tip: 'Dara can turn anything you are reading into a plain-words summary.' },
  studio: { title: 'Where you build', what: 'Your real AI projects, worked task by task in the project workspace, like a real team.', can: ['Work your next project task', 'See what is due in your assignments'], tip: 'Every shipped build becomes evidence in your portfolio.' },
  testing: { title: 'Prove what you know', what: 'Knowledge checks and practice that prepare you for certification.', can: ['Take a knowledge check', 'Practice before the exam'], tip: 'Short checks along the way show you where to focus.' },
  observatory: { title: 'Your path & points', what: 'Where you stand: your level, your points and your streak.', can: ['See what unlocks your next level', 'Keep your daily streak going', 'Check your points and what earns them'], tip: 'Come back here after a big week to see it add up.' },
  commons: { title: 'Never stuck alone', what: 'Live rooms, your cohort, and Reese at the mentor desk around the clock.', can: ['Drop into a live room', 'Post or reply in the community', 'Message people you are allowed to message'], tip: 'Reese, the AI mentor, is the one to ask when you are stuck.' },
  gallery: { title: 'Your portfolio builds itself', what: 'Your class work and builds become a portfolio others can view.', can: ['Preview your portfolio', 'Browse the showcase'], tip: 'You don’t write it. It fills in as you ship.' },
  career: { title: 'Real client work', what: 'The AI internship: client work, standups and handoffs.', can: ['Open your internship', 'Follow your engagement'], tip: 'Internship work is the experience employers ask about.' },
  arcade: { title: 'Take a real break', what: 'Three short games for a break between lessons, with a weekly leaderboard for your cohort.', can: ['Play Byte Chase, Launch Lab or Bug Breaker', 'See how your cohort scored this week'], tip: 'Breaks are capped at fifteen minutes a day, and games never change your learning points.' },
};

const EXPLORER: CopyTable = {
  commons: { title: 'Start here: your community', what: 'Live rooms, the community feed and other learners.', can: ['Drop into a live room', 'Post or reply in the community'], tip: 'Maya at the {gate} answers questions about enrolling.' },
  library: { title: 'Reference on demand', what: 'Documents shared with everyone in the program.', can: ['Read the guides and reference material'], tip: 'A good place to see the kind of material the program uses.' },
  amphi: { title: 'Open events', what: 'Open houses, demos and talks.', can: ['See upcoming events', 'RSVP to the ones you want'], tip: 'An open house is the quickest way to ask everything at once.' },
  lecture: { title: 'Live classes', what: 'Members get the weekly lessons and live sessions of the program.', can: ['See how a week of the program is laid out'], tip: 'Enrolled members can join every live session and check in for attendance.' },
  studio: { title: 'Real AI projects', what: 'Members build real projects task by task in the project workspace.', can: ['Walk through how a project is organized'], tip: 'Building for real starts the day you enroll.' },
  testing: { title: 'Certification', what: 'Knowledge checks and practice that prepare members for certification.', can: [], tip: 'The sign-up view shows exactly what enrolling opens here.' },
  gallery: { title: 'A portfolio of your work', what: 'Members\' work collected into a portfolio others can view.', can: ['Browse the showcase'], tip: 'Last stop. Next: what enrolling opens for you.' },
};

const BUSINESS: CopyTable = {
  lecture: { title: 'Where they learn', what: 'The weekly lessons and live sessions your people attend. Their check-ins record attendance.', can: ['See how the program is laid out'], tip: 'Attendance comes from check-ins during live sessions.' },
  studio: { title: 'Where they build', what: 'Your people work real projects task by task, the way an engineering team works.', can: ['See how project work is organized'], tip: 'Shipped work becomes evidence in their portfolios.' },
  testing: { title: 'Where they get certification-ready', what: 'Knowledge checks and practice that prepare them for certification.', can: ['See the knowledge checks they take'], tip: 'Short checks show where each person should focus.' },
  commons: { title: 'Where they connect', what: 'Live rooms, the community feed, and AI staff desks for help.', can: ['Drop into a live room'], tip: 'Reese, the AI mentor, helps your people when they are stuck.' },
  gallery: { title: 'Where they show their work', what: 'Each person\'s work collected into a portfolio others can view.', can: ['Browse the showcase'], tip: 'Portfolios fill in as they ship project work.' },
  career: { title: 'Your partner office', what: 'Your company room in the portal.', can: ['Open your company page'], tip: 'Last stop. Your team\'s campus is the same one you just walked.' },
};

const ORDER: Record<Exclude<CampusAudience, 'staff'>, { name: string; table: CopyTable; stops: BuildingId[] }> = {
  member: { name: 'What’s in your seat', table: MEMBER, stops: ['lecture', 'library', 'studio', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade'] },
  explorer: { name: 'Explorer campus tour', table: EXPLORER, stops: ['commons', 'library', 'amphi', 'lecture', 'studio', 'testing', 'gallery'] },
  business: { name: 'Partner tour', table: BUSINESS, stops: ['lecture', 'studio', 'testing', 'commons', 'gallery', 'career'] },
};

/** What a non-open state means for the Explorer, in the same words as the building card (C6 NOTICE). */
export const STATE_NOTE: Record<Exclude<ExplorerAccess, 'open'>, string> = {
  demo: 'Explore it in demo mode. Running and saving work is for members.',
  preview: 'You can watch a short preview. Enrolling opens everything here.',
  locked: 'Members only. Enrolling opens this.',
};
export const STATE_TAG: Record<ExplorerAccess, string> = { open: 'Open', demo: 'Demo', preview: 'Preview', locked: 'Members' };

export function tourFor(
  audience: CampusAudience, buildings: CampusBuilding[], accessOf: (b: CampusBuilding) => ExplorerAccess, workplaceNames: boolean,
): Tour | null {
  if (audience === 'staff') return null;
  const def = ORDER[audience];
  const stops: TourStop[] = [];
  const gate = buildings.find((x) => x.id === 'gate');
  const gateName = gate ? buildingName(gate, workplaceNames) : (workplaceNames ? 'Visitor Entrance' : 'Main Gate');
  for (const id of def.stops) {
    const b = buildings.find((x) => x.id === id);
    const copy = def.table[id];
    if (!b || !copy) continue;
    const state = audience === 'explorer' ? accessOf(b) : null;
    // C11: copy that names another building uses its setting-aware name ({gate}), never a hard-coded campus name.
    const tip = copy.tip.replace('{gate}', gateName);
    stops.push({ ...copy, tip, buildingId: id, name: buildingName(b, workplaceNames), state, note: state && state !== 'open' ? STATE_NOTE[state] : null });
  }
  return { audience, name: def.name, stops };
}

/** C11b: the building's one-line description for this viewer (the arrival panel's subtitle): the same tour copy, so the panel and
 *  the tour never disagree. Staff read the member copy; a building with no copy for this audience has no line. */
export function buildingLine(audience: CampusAudience, id: BuildingId): string | null {
  const table = ORDER[audience === 'staff' ? 'member' : audience].table;
  return table[id]?.what ?? MEMBER[id]?.what ?? null;
}
