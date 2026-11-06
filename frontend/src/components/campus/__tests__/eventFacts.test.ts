/**
 * C118: the Events Hall screen's facts about the next event (eventFacts, pure). Everything comes from the event; a field it does
 * not carry is null, so the board leaves that line off rather than invent it.
 */
import { ABOUT_MAX, eventFacts } from '../events/eventsModel';

const ev = {
  starts_at: '2099-01-06T15:00:00Z', ends_at: '2099-01-06T16:30:00Z', meeting_link: 'https://zoom.us/j/1', signup_count: 3,
  description: 'An hour with the program team.',
};

it('happy path: Central day and time range, Online, the count and the description', () => {
  expect(eventFacts(ev)).toEqual({ when: 'Tue, Jan 6 · 9:00 AM – 10:30 AM CT', where: 'Online', going: '3 signed up', about: 'An hour with the program team.' });
});

it('an end on another Central day, or an unreadable one, shows the start only', () => {
  expect(eventFacts({ ...ev, ends_at: '2099-01-08T16:30:00Z' }).when).toBe('Tue, Jan 6 · 9:00 AM CT');
  expect(eventFacts({ ...ev, ends_at: 'not a date' }).when).toBe('Tue, Jan 6 · 9:00 AM CT');
});

it('unknown or zero signups, no link and an empty or tags-only description are null (never 0, never a guess)', () => {
  const f = eventFacts({ ...ev, signup_count: null, meeting_link: null, description: '  <p> </p> ' });
  expect(f).toMatchObject({ where: null, going: null, about: null });
  expect(eventFacts({ ...ev, signup_count: 0 }).going).toBeNull();
});

it('a long description is cut at a word boundary with an ellipsis, never mid-word', () => {
  const long = `${'Leaders from five industries share what worked '.repeat(8)}end`;
  const about = eventFacts({ ...ev, description: long }).about!;
  expect(about.length).toBeLessThanOrEqual(ABOUT_MAX + 1);
  expect(about.endsWith('…')).toBe(true);
  expect(long.startsWith(about.slice(0, -1))).toBe(true);
  expect(long.charAt(about.length - 1)).toBe(' '); // the cut fell on a space
});

it('boundary: exactly the limit is kept whole; the same event gives the same facts twice', () => {
  const exact = 'x'.repeat(ABOUT_MAX);
  expect(eventFacts({ ...ev, description: exact }).about).toBe(exact);
  expect(eventFacts(ev)).toEqual(eventFacts(ev));
});
