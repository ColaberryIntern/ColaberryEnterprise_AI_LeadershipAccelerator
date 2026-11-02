import { factsAt, type WeeklySessionFact } from '../campusFacts';
import type { LookFacts } from '../campusFacts';
import { EVENTS_BUILDING } from '../campusRoomKind';

/**
 * What the Meeting Rooms say is happening here.
 *
 * THE DEFECT. "Happening here" showed exactly one thing: the globally-next public
 * event from the Eventbrite mirror, attached to this building by a hardcoded table and
 * carrying no room, area or building field of its own. So the Meeting Rooms advertised
 * a scheduled meeting that was in none of the rooms on screen, while the sessions that
 * genuinely run here — the Monday intern standup, the public AI sessions — were never
 * mentioned at all, because they live in the cohort's weekly settings and nothing
 * joined them to a building.
 *
 * Reported as: "there is only one scheduled meeting and it's not the room we are in."
 */
const LOOK: LookFacts = { points: null, rung: null, planMinutes: null, stops: null };
const NOW = Date.parse('2026-11-02T15:00:00.000Z');

const session = (over: Partial<WeeklySessionFact> = {}): WeeklySessionFact => ({
  title: 'Intern standup',
  startIso: '2026-11-03T15:00:00.000Z',
  roomName: 'AI Internship',
  ...over,
});

/** The Eventbrite record, as loadArrival hands it over: no room, no building. */
const publicEvent = { title: 'AI Internship Presentation Event', starts_at: '2026-11-03T16:00:00.000Z' } as never;

const rows = (weekly: WeeklySessionFact[] = [], event: unknown = null) =>
  factsAt(EVENTS_BUILDING, { event: event as never }, LOOK, NOW, weekly).map((h) => `${h.title} | ${h.detail}`);

describe('the Meeting Rooms say what is happening in their own rooms', () => {
  it('names the next weekly session AND the room it is in (the headline fix)', () => {
    expect(rows([session()])[0]).toContain('Intern standup');
    expect(rows([session()])[0]).toContain('AI Internship');
  });

  it('puts the room-bound session ABOVE the unbound public event', () => {
    const out = rows([session()], publicEvent);
    expect(out[0]).toContain('Intern standup');
    expect(out[1]).toContain('AI Internship Presentation Event');
  });

  it('labels the Eventbrite record as a public event, so it is not read as a room session', () => {
    // It is a real event people register for. It is not a meeting in a room here, and
    // for a year it was presented as one.
    expect(rows([], publicEvent)[0]).toContain('Public event');
  });

  it('shows only the sessions it has when there is no public event', () => {
    expect(rows([session()])).toHaveLength(1);
  });

  it('invents no session row when the weekly schedule is empty (failure path)', () => {
    // A member with no sessions, or a failed fetch, must not produce a row.
    expect(rows([], publicEvent)).toHaveLength(1);
    expect(rows([])).toHaveLength(0);
  });

  it('shows only the soonest session, not the whole week', () => {
    const later = session({ title: 'AI Friday Trends', startIso: '2026-11-06T15:00:00.000Z', roomName: 'Colaberry AI Sessions' });
    const out = rows([session(), later]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Intern standup');
  });

  it('marks a session that is about to start', () => {
    const soon = factsAt(EVENTS_BUILDING, {}, LOOK, NOW, [session({ startIso: '2026-11-02T15:10:00.000Z' })]);
    expect(soon[0].tone).toBe('live');
    const later = factsAt(EVENTS_BUILDING, {}, LOOK, NOW, [session()]);
    expect(later[0].tone).toBe('');
  });

  it('omits the time rather than inventing one when the instant is unreadable (boundary)', () => {
    const out = factsAt(EVENTS_BUILDING, {}, LOOK, NOW, [session({ startIso: 'not-a-date' })]);
    expect(out).toHaveLength(1);
    expect(out[0].detail).toBe('AI Internship');
  });

  it('still reads correctly when the session has no room recorded (boundary)', () => {
    // room_name is nullable until the rooms are provisioned; the row must not render
    // a stray separator or the word "null".
    const out = factsAt(EVENTS_BUILDING, {}, LOOK, NOW, [session({ roomName: null })]);
    expect(out[0].detail).not.toContain('null');
    expect(out[0].detail).not.toMatch(/^ ·/);
  });

  it('changes nothing for other buildings', () => {
    // The weekly sessions belong to the Meeting Rooms; passing them must not leak a
    // row into the Classroom or anywhere else.
    expect(factsAt('lecture', {}, LOOK, NOW, [session()])).toHaveLength(0);
    expect(factsAt('arcade', {}, LOOK, NOW, [session()])).toHaveLength(0);
  });
});
