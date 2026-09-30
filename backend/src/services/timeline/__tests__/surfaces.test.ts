/**
 * Surface taxonomy invariants (Today Timeline v2, Phase 0). Pure logic — no I/O.
 * Guards the "where does this card belong?" classification and the one-way valve.
 */
import { CARD_TYPES, allTypes, type SurfaceId, type FeedMode } from '../typeRegistry';
import {
  SURFACES,
  SURFACE_ORDER,
  surfaceOf,
  surfaceDefOf,
  isAmbient,
  isTodayEligible,
  typesBySurface,
} from '../surfaces';

const SURFACE_IDS: SurfaceId[] = ['today', 'class', 'project', 'community', 'group'];
const FEED_MODES: FeedMode[] = ['anchored', 'ambient'];

describe('surface taxonomy — registry integrity', () => {
  it('every type has a valid home_surface, feed_mode, and boolean today_eligible', () => {
    for (const t of CARD_TYPES) {
      expect(SURFACE_IDS).toContain(t.home_surface);
      expect(FEED_MODES).toContain(t.feed_mode);
      expect(typeof t.today_eligible).toBe('boolean');
    }
  });

  it('one-way valve: every ambient type is homed to Today (Today-only)', () => {
    for (const t of CARD_TYPES) {
      if (t.feed_mode === 'ambient') {
        expect(t.home_surface).toBe('today');
      }
    }
  });

  it('every ambient type is Today-eligible (it can only live in Today)', () => {
    for (const t of CARD_TYPES) {
      if (t.feed_mode === 'ambient') {
        expect(t.today_eligible).toBe(true);
      }
    }
  });
});

describe('surface taxonomy — known classifications', () => {
  it.each(['blog', 'podcast', 'testimonial'])('%s is ambient + Today', (slug) => {
    expect(isAmbient(slug)).toBe(true);
    expect(surfaceOf(slug)).toBe('today');
  });

  it.each(['live_class', 'event', 'demo_tuesday', 'kes_wednesday', 'marketing_friday'])(
    '%s is a group/live surface',
    (slug) => {
      expect(surfaceOf(slug)).toBe('group');
      expect(isAmbient(slug)).toBe(false);
    },
  );

  it.each(['implementation_task', 'artifact_submission', 'project_task', 'build_story'])(
    '%s is a project surface',
    (slug) => {
      expect(surfaceOf(slug)).toBe('project');
    },
  );

  it.each(['discussion', 'community_discussion', 'demo'])('%s is a community surface', (slug) => {
    expect(surfaceOf(slug)).toBe('community');
  });

  it('system gamification types are ambient + Today', () => {
    for (const slug of ['milestone', 'achievement', 'daily_streak', 'completion_badge']) {
      expect(isAmbient(slug)).toBe(true);
      expect(surfaceOf(slug)).toBe('today');
    }
  });
});

describe('surface taxonomy — resolvers + grouping', () => {
  it('exposes all five surfaces with Today ordered first', () => {
    for (const id of SURFACE_IDS) expect(SURFACES[id].id).toBe(id);
    expect(SURFACE_ORDER[0].id).toBe('today');
  });

  it('unknown slug resolves to null surface and falls back to Class', () => {
    expect(surfaceOf('does_not_exist')).toBeNull();
    expect(surfaceDefOf('does_not_exist').id).toBe('class');
    expect(isAmbient('does_not_exist')).toBe(false);
    expect(isTodayEligible('does_not_exist')).toBe(false);
  });

  it('typesBySurface partitions every registered type exactly once', () => {
    const grouped = typesBySurface();
    const counted = grouped.reduce((sum, g) => sum + g.types.length, 0);
    expect(counted).toBe(allTypes().length);
  });
});
