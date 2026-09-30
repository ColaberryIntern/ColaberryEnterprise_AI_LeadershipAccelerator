/**
 * The public events list that training.colaberry.com renders.
 *
 * Two things go wrong here and neither one throws.
 *
 * LEAKING A VIEWER CLAIM. `OpenHouseView.is_registered` means "this learner has
 * registered". An unauthenticated request has no learner, so the field cannot be answered.
 * Sending `false` is indistinguishable from a real negative, and a consumer that trusted it
 * would tell every anonymous visitor they are not registered for an event they may have
 * booked. The field must be absent, not falsy.
 *
 * FAILING LOUDLY ON A PUBLIC PAGE. A CCPP outage must degrade to an empty list, because the
 * marketing site's own fallback copy then renders and a visitor sees a page. A 500 here
 * takes down /events to report a problem nobody visiting it can act on. This mirrors the
 * contract `/api/v1/open-house/event` already keeps.
 */
import { Request, Response } from 'express';

jest.mock('../../services/publicEventsService', () => ({
  getUpcomingPublicEvents: jest.fn(),
}));

import { getUpcomingPublicEvents } from '../../services/publicEventsService';
import {
  handleGetPublicEventsList,
  toPublicEventDto,
  resolveWindowDays,
  DEFAULT_WINDOW_DAYS,
} from '../publicEventsController';
import { OpenHouseView } from '../../services/openHouseTypes';

function view(over: Partial<OpenHouseView> = {}): OpenHouseView {
  return {
    id: 'evt-1',
    title: 'AI Friday Trends, Tools And Practical Insights',
    description: 'Get the lowdown on the latest AI hacks.',
    starts_at: new Date('2026-09-11T14:00:00.000Z'),
    ends_at: new Date('2026-09-11T15:00:00.000Z'),
    timezone: 'America/Chicago',
    registration_url: 'https://www.eventbrite.com/e/123',
    meeting_link: null,
    image_url: 'https://img.evbuc.com/abc.jpg',
    signup_count: 14,
    is_registered: true,
    ...over,
  };
}

function mockRes() {
  const res: Partial<Response> = {};
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res as Response & { json: jest.Mock; status: jest.Mock };
}

const req = (query: Record<string, unknown> = {}) => ({ query } as unknown as Request);

describe('toPublicEventDto', () => {
  it('drops is_registered entirely rather than sending false', () => {
    const dto = toPublicEventDto(view({ is_registered: true }));
    // Asserting on the KEY, not the value. `is_registered: false` would pass a
    // truthiness check while still making a claim we cannot support.
    expect(Object.prototype.hasOwnProperty.call(dto, 'is_registered')).toBe(false);
  });

  it('keeps every field a card needs to render', () => {
    const dto = toPublicEventDto(view());
    expect(dto).toMatchObject({
      id: 'evt-1',
      title: 'AI Friday Trends, Tools And Practical Insights',
      timezone: 'America/Chicago',
      registration_url: 'https://www.eventbrite.com/e/123',
      image_url: 'https://img.evbuc.com/abc.jpg',
      signup_count: 14,
    });
  });

  it('serialises dates as ISO strings, and keeps a null end null', () => {
    const dto = toPublicEventDto(view({ ends_at: null }));
    expect(dto.starts_at).toBe('2026-09-11T14:00:00.000Z');
    expect(dto.ends_at).toBeNull();
  });

  it('preserves a null signup_count instead of coercing it to zero', () => {
    // Null means "not known" — the Postgres fallback has no attendee mirror. Zero would
    // render as a real badge saying nobody has signed up.
    expect(toPublicEventDto(view({ signup_count: null })).signup_count).toBeNull();
  });
});

describe('resolveWindowDays', () => {
  it.each([
    [undefined, DEFAULT_WINDOW_DAYS],
    ['', DEFAULT_WINDOW_DAYS],
    ['banana', DEFAULT_WINDOW_DAYS],
    ['30', 30],
    ['0', 1],
    ['-5', 1],
    ['100000', 365],
    ['45.9', 45],
  ])('%s -> %s', (raw, expected) => {
    expect(resolveWindowDays(raw)).toBe(expected);
  });

  it('takes the first value when express hands back an array', () => {
    expect(resolveWindowDays(['30', '60'])).toBe(30);
  });
});

describe('handleGetPublicEventsList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the upcoming events for the requested window', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockResolvedValue([view(), view({ id: 'evt-2' })]);
    const res = mockRes();

    await handleGetPublicEventsList(req({ days: '30' }), res);

    expect(getUpcomingPublicEvents).toHaveBeenCalledWith(30);
    const body = res.json.mock.calls[0][0];
    expect(body.events).toHaveLength(2);
    expect(body.window_days).toBe(30);
  });

  it('defaults to the same 90 day horizon the portal page uses', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockResolvedValue([]);
    await handleGetPublicEventsList(req(), mockRes());
    expect(getUpcomingPublicEvents).toHaveBeenCalledWith(90);
  });

  it('never leaks is_registered through the handler either', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockResolvedValue([view({ is_registered: true })]);
    const res = mockRes();

    await handleGetPublicEventsList(req(), res);

    const serialised = JSON.stringify(res.json.mock.calls[0][0]);
    expect(serialised).not.toContain('is_registered');
  });

  it('degrades to an empty list when CCPP is down, rather than erroring', async () => {
    (getUpcomingPublicEvents as jest.Mock).mockRejectedValue(new Error('CCPP unreachable'));
    const res = mockRes();

    await handleGetPublicEventsList(req(), res);

    // No status() call at all: a 500 would break a public marketing page.
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ events: [], window_days: 90 });
  });
});
