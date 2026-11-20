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

  it('a live event that started before now still shows, marked live', () => {
    const live = ev({ status: 'live', starts_at: new Date(NOW - 600_000), ends_at: new Date(NOW + 3_000_000) });
    expect(toCards(live, NOW, IN_30)).toEqual([expect.objectContaining({ is_live: true })]);
  });

  it('a live event with no end time stays visible (treated as running 4 hours)', () => {
    const live = ev({ status: 'live', starts_at: new Date(NOW - 600_000), ends_at: null });
    expect(toCards(live, NOW, IN_30)).toEqual([expect.objectContaining({ is_live: true })]);
  });

  it('a live weekly series marks only the occurrence happening now as live', () => {
    const series = ev({ status: 'live', starts_at: new Date(NOW - 600_000), ends_at: new Date(NOW + 3_000_000), repeat_rule: { freq: 'weekly', until: '2026-12-31' } });
    const cards = toCards(series, NOW, IN_30);
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
