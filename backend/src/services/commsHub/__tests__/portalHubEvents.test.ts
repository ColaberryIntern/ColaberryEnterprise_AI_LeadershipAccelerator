import { visibleTo, toCards, registrationKey, mergeCards, type PortalEventCard } from '../portalHubEvents';
import type CommsHubEvent from '../../../models/CommsHubEvent';

/** CH2.3 hub events on the member Events page: audience, window, dedupe against CCPP, fallback image. */
const ev = (o: Partial<Record<string, unknown>> = {}): CommsHubEvent => ({
  id: '44444444-4444-4444-8444-444444444444', title: 'Demo Tuesday', description: 'Builders demo.',
  starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: new Date('2026-12-02T01:00:00Z'), repeat_rule: null,
  audience: { kind: 'all_members' }, placement: { calendar: true, events_page: true, campus_rail: true },
  status: 'scheduled', registration_url: null, join_url: 'https://zoom.us/j/9', thumbnail_id: null, ...o,
} as unknown as CommsHubEvent);

const card = (o: Partial<PortalEventCard>): PortalEventCard => ({
  id: 'x', title: 'x', description: null, starts_at: new Date('2026-12-05T00:00:00Z'), ends_at: null, timezone: 'America/Chicago',
  registration_url: null, meeting_link: null, image_url: 'https://img.evbuc.com/a.jpg', signup_count: 4, is_registered: true, ...o,
});

const NOW = new Date('2026-11-20T12:00:00Z').getTime();
const IN_30 = NOW + 30 * 86_400_000;

describe('CH2.3 who sees a hub event', () => {
  it('all members see it; a cohort event only its cohort; events-page off, drafts and cancelled never', () => {
    expect(visibleTo(ev(), null)).toBe(true);
    const cohortOnly = ev({ audience: { kind: 'cohorts', cohort_ids: ['c1'] } });
    expect(visibleTo(cohortOnly, 'c1')).toBe(true);
    expect(visibleTo(cohortOnly, 'c2')).toBe(false);
    expect(visibleTo(cohortOnly, null)).toBe(false);
    expect(visibleTo(ev({ placement: { calendar: true, events_page: false, campus_rail: true } }), null)).toBe(false);
    expect(visibleTo(ev({ status: 'draft' }), null)).toBe(false);
    expect(visibleTo(ev({ status: 'cancelled' }), null)).toBe(false);
  });
});

describe('CH2.3 cards', () => {
  it('one card per occurrence in the window, Central zone, join link, no image yet (the page shows its fallback)', () => {
    const cards = toCards(ev({ repeat_rule: { freq: 'weekly', until: '2027-02-01' } }), NOW, IN_30);
    expect(cards.map((c) => (c.starts_at as Date).toISOString())).toEqual([
      '2026-12-02T00:00:00.000Z', '2026-12-09T00:00:00.000Z', '2026-12-16T00:00:00.000Z',
    ]);
    expect(cards[0]).toMatchObject({ timezone: 'America/Chicago', meeting_link: 'https://zoom.us/j/9', image_url: null, signup_count: null, is_registered: false, source: 'hub', is_live: false });
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
  });

  it('CH4.4 a chosen thumbnail is the card image, via the public route, cache-busted by the choice', () => {
    const cards = toCards(ev({ id: 'e1', thumbnail_id: 't7' }), NOW, IN_30);
    expect(cards[0].image_url).toBe('/api/comms-hub/thumbnails/e1/16x9.png?v=t7');
  });

  // CH5.3: "live now" comes from the broadcast occurrence for the card's date, not the event's status.
  const onAir = (startMs: number, state = 'live') => [{ occurrence_id: 'occ-now', editorial_state: state, scheduled_start_at: new Date(startMs) }];

  it('a live event that started before now still shows, marked live, with the occurrence to open', () => {
    const live = ev({ status: 'live', starts_at: new Date(NOW - 600_000), ends_at: new Date(NOW + 3_000_000) });
    expect(toCards(live, NOW, IN_30, onAir(NOW - 600_000))).toEqual([expect.objectContaining({ is_live: true, live_occurrence_id: 'occ-now', watch_url: null })]);
  });

  it('status "live" without an on-air occurrence is NOT shown as live (a stream ended outside the panel)', () => {
    const stale = ev({ status: 'live', starts_at: new Date(NOW - 600_000), ends_at: new Date(NOW + 3_000_000) });
    expect(toCards(stale, NOW, IN_30)[0]).toMatchObject({ is_live: false, live_occurrence_id: null });
    expect(toCards(stale, NOW, IN_30, onAir(NOW - 600_000, 'ended'))[0].is_live).toBe(false);
    expect(toCards(stale, NOW, IN_30, onAir(NOW - 600_000, 'reconnecting'))[0].is_live).toBe(true);
  });

  it('a live event with no end time stays visible (treated as running 4 hours)', () => {
    const live = ev({ status: 'live', starts_at: new Date(NOW - 600_000), ends_at: null });
    expect(toCards(live, NOW, IN_30, onAir(NOW - 600_000))).toEqual([expect.objectContaining({ is_live: true })]);
  });

  it('a live weekly series marks only the occurrence happening now as live', () => {
    const series = ev({ status: 'live', starts_at: new Date(NOW - 600_000), ends_at: new Date(NOW + 3_000_000), repeat_rule: { freq: 'weekly', until: '2026-12-31' } });
    const cards = toCards(series, NOW, IN_30, onAir(NOW - 600_000));
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.filter((c) => c.is_live)).toHaveLength(1);
    expect(cards[0].is_live).toBe(true);
  });

  it('an event outside the window produces nothing', () => {
    expect(toCards(ev({ starts_at: new Date('2027-03-01T00:00:00Z'), ends_at: null }), NOW, IN_30)).toEqual([]);
  });
});

describe('CH2.3 dedupe against CCPP by registration page', () => {
  it('the same Eventbrite event matches however the URL was pasted', () => {
    const a = registrationKey('https://www.eventbrite.com/e/demo-tuesday-tickets-1992498063344?aff=x');
    expect(a).toBe('eventbrite:1992498063344');
    expect(registrationKey('https://eventbrite.com/e/1992498063344/')).toBe(a);
    expect(registrationKey('not a url')).toBeNull();
    expect(registrationKey(null)).toBeNull();
  });

  it('a hub event replaces the CCPP card with the same registration; other CCPP cards stay, sorted by start', () => {
    const shared = 'https://www.eventbrite.com/e/demo-1992498063344';
    const ccpp = [card({ id: 'ccpp-1', registration_url: `${shared}?ref=x` }), card({ id: 'ccpp-2', registration_url: 'https://www.eventbrite.com/e/other-555555555', starts_at: new Date('2026-11-25T00:00:00Z') })];
    const hub = toCards(ev({ registration_url: shared }), NOW, IN_30);
    const merged = mergeCards(ccpp, hub);
    expect(merged.map((c) => c.id)).toEqual(['ccpp-2', hub[0].id]);
    expect(merged[0]).toMatchObject({ source: 'ccpp', is_registered: true });
  });

  it('CCPP cards with no registration link are never dropped', () => {
    const merged = mergeCards([card({ id: 'a' })], toCards(ev(), NOW, IN_30));
    expect(merged).toHaveLength(2);
    expect(merged.map((c) => c.id)).toContain('a');
  });
});

describe('CH9.5 an Eventbrite event managed in the hub keeps the member\'s registration', () => {
  // The Eventbrite event and its managed hub copy: same registration page, same Central date (6:00 PM CST Dec 1).
  const url = 'https://www.eventbrite.com/e/ai-open-house-1992498063344';
  const at = new Date('2026-12-02T00:00:00Z');
  const managed = (o: Partial<Record<string, unknown>> = {}) => ev({
    registration_url: url, starts_at: at, ends_at: new Date('2026-12-02T01:30:00Z'), ccpp_event_id: '1992498063344',
    source_image_url: 'https://img.evbuc.com/open-house.jpg', placement: { calendar: false, events_page: true, campus_rail: false }, ...o,
  });

  it('a registered member: exactly one card, the hub one, still "registered", with the Eventbrite count and picture', () => {
    const merged = mergeCards([card({ id: '1992498063344', registration_url: url, starts_at: at, is_registered: true, signup_count: 14 })], toCards(managed(), NOW, IN_30));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: 'hub', is_registered: true, signup_count: 14, image_url: 'https://img.evbuc.com/open-house.jpg' });
  });

  it('an unregistered member still sees it as not registered, so Register stays', () => {
    const merged = mergeCards([card({ id: '1992498063344', registration_url: url, starts_at: at, is_registered: false, signup_count: 14 })], toCards(managed(), NOW, IN_30));
    expect(merged[0]).toMatchObject({ source: 'hub', is_registered: false, signup_count: 14 });
  });

  it('a chosen hub thumbnail wins over the Eventbrite picture; without one the Eventbrite picture shows', () => {
    expect(toCards(managed({ thumbnail_id: 't9' }), NOW, IN_30)[0].image_url).toBe(`/api/comms-hub/thumbnails/${ev().id}/16x9.png?v=t9`);
    expect(toCards(managed(), NOW, IN_30)[0].image_url).toBe('https://img.evbuc.com/open-house.jpg');
  });

  it('Eventbrite moved the date and the hub has not synced yet: the member is STILL registered (matched by Eventbrite id, not date)', () => {
    const moved = new Date('2026-12-09T00:00:00Z'); // a week later on Eventbrite; the hub card still says Dec 1
    const merged = mergeCards([card({ id: '1992498063344', registration_url: url, starts_at: moved, is_registered: true, signup_count: 14 })], toCards(managed(), NOW, IN_30));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: 'hub', is_registered: true, signup_count: 14, ccpp_event_id: '1992498063344' });
  });

  it('a managed card is matched by id even if its registration link differs from the Eventbrite card', () => {
    const merged = mergeCards([card({ id: '1992498063344', registration_url: 'https://www.eventbrite.com/e/renamed-1992498063344?aff=x', starts_at: at, is_registered: true })],
      toCards(managed({ registration_url: null }), NOW, IN_30));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: 'hub', is_registered: true });
  });

  it('a recurring hub series sharing the link inherits registration only on the matching date', () => {
    const series = toCards(managed({ ccpp_event_id: null, source_image_url: null, repeat_rule: { freq: 'weekly', until: '2026-12-31' } }), NOW, IN_30);
    const merged = mergeCards([card({ id: 'x', registration_url: url, starts_at: at, is_registered: true, signup_count: 5 })], series);
    expect(merged.filter((c) => c.is_registered)).toHaveLength(1);
    expect(merged.find((c) => c.is_registered)!.starts_at).toEqual(at);
    expect(merged.every((c) => c.source === 'hub')).toBe(true);
  });
});
