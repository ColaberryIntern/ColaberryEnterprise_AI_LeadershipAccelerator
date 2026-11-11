import {
  DAY_WINDOW_MAX_HOURS,
  ONE_HOUR_WINDOW_MAX_HOURS,
  hoursUntil,
  openHouseEventIdOf,
  reminderWindowFor,
  stampColumnFor,
} from '../openHouseReminderPolicy';

/**
 * The decision half of the Open House reminder, tested without a database.
 *
 * What these guard is the rule the whole feature exists for: a reminder reaches
 * the people who registered for that event and nobody else, at most once per
 * window, and never for something already under way.
 */

describe('reminderWindowFor: which reminder a session is due', () => {
  it.each([
    ['a day and a half out', 36, null],
    ['just past the day window', DAY_WINDOW_MAX_HOURS + 0.1, null],
    ['at the edge of the day window', DAY_WINDOW_MAX_HOURS, '24h'],
    ['a day out', 24, '24h'],
    ['six hours out', 6, '24h'],
    ['just past the hour window', ONE_HOUR_WINDOW_MAX_HOURS + 0.1, '24h'],
    ['at the edge of the hour window', ONE_HOUR_WINDOW_MAX_HOURS, '1h'],
    ['an hour out', 1, '1h'],
    ['ten minutes out', 1 / 6, '1h'],
  ])('%s', (_label, hours, expected) => {
    expect(reminderWindowFor(hours as number)).toBe(expected);
  });

  it.each([
    ['exactly at the start', 0],
    ['already under way', -0.5],
    ['long over', -48],
  ])('%s sends nothing: a reminder for something that started is worse than silence', (_label, hours) => {
    expect(reminderWindowFor(hours as number)).toBeNull();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative Infinity', Number.NEGATIVE_INFINITY],
  ])('%s fails closed', (_label, hours) => {
    expect(reminderWindowFor(hours as number)).toBeNull();
  });

  it('the windows are wider than the 30-minute sweep that drives them', () => {
    // A window narrower than the sweep is a window the sweep can step over: a
    // session 59 minutes out at one tick and 29 at the next would never be
    // inside a strict "one hour" test. Both windows are at least an hour wide.
    expect(ONE_HOUR_WINDOW_MAX_HOURS).toBeGreaterThanOrEqual(1);
    expect(DAY_WINDOW_MAX_HOURS - ONE_HOUR_WINDOW_MAX_HOURS).toBeGreaterThanOrEqual(1);
  });

  it('a late registrant can only ever be sent the 1h note', () => {
    // The window is a function of the SESSION's distance, not of when somebody
    // registered - which is what makes this correct with no special case. Once an
    // event is inside two hours the answer is '1h' for everybody, so a person who
    // signs up then never matches a '24h' sweep and their 24h stamp stays null
    // for ever without ever firing.
    for (const h of [2, 1.5, 1, 0.5, 0.1]) expect(reminderWindowFor(h)).toBe('1h');
  });
});

describe('hoursUntil', () => {
  const now = new Date('2026-11-19T00:00:00.000Z');
  it.each([
    ['one hour ahead', '2026-11-19T01:00:00.000Z', 1],
    ['a day ahead', '2026-11-20T00:00:00.000Z', 24],
    ['half an hour ahead', '2026-11-19T00:30:00.000Z', 0.5],
    ['in the past', '2026-11-18T23:00:00.000Z', -1],
  ])('%s', (_label, iso, expected) => {
    expect(hoursUntil(new Date(iso as string), now)).toBeCloseTo(expected as number, 6);
  });
});

describe('stampColumnFor: the two windows cannot be mixed up', () => {
  it('maps each window to its own column', () => {
    expect(stampColumnFor('24h')).toBe('reminder_24h_sent_at');
    expect(stampColumnFor('1h')).toBe('reminder_1h_sent_at');
  });

  it('never returns the same column for both', () => {
    // Said out loud because the failure would be silent: one window stamping the
    // other's column means somebody is reminded twice, or not at all.
    expect(stampColumnFor('24h')).not.toBe(stampColumnFor('1h'));
  });
});

describe('openHouseEventIdOf: what makes a session an Open House', () => {
  it('is the Eventbrite id when there is one', () => {
    expect(openHouseEventIdOf({ open_house_event_id: '2004289439668' })).toBe('2004289439668');
  });

  it('trims', () => {
    expect(openHouseEventIdOf({ open_house_event_id: '  2004289439668  ' })).toBe('2004289439668');
  });

  it.each([
    ['an ordinary class', { open_house_event_id: null }],
    ['an empty string', { open_house_event_id: '' }],
    ['whitespace', { open_house_event_id: '   ' }],
    ['a row without the column', {}],
    ['null', null],
    ['undefined', undefined],
  ])('%s is not an Open House', (_label, session) => {
    expect(openHouseEventIdOf(session as { open_house_event_id?: string | null })).toBeNull();
  });

  it('is a column, not a title convention', () => {
    // A session named "Open House" without the id is NOT one, on purpose: a
    // renamed session must not silently start or stop mailing people.
    expect(openHouseEventIdOf({ open_house_event_id: null })).toBeNull();
  });
});
