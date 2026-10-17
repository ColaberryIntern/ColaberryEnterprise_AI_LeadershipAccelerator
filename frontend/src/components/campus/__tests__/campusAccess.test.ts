import { buildingAccess, accessLabel, enrollCta } from '../campusAccess';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CampusAudience } from '../campusMap';

const AUDIENCES: CampusAudience[] = ['member', 'explorer', 'business', 'staff'];

describe('buildingAccess', () => {
  it.each(AUDIENCES.flatMap((a) => [true, false].map((full) => [a, full] as const)))('%s, full access %s', (audience, full) => {
    for (const b of CAMPUS_BUILDINGS) {
      const want = audience === 'explorer' && !full ? b.explorer : 'open';
      expect({ id: b.id, access: buildingAccess(b, audience, full) }).toEqual({ id: b.id, access: want });
    }
  });

  it('an Explorer without a seat sees exactly the catalog states (locked cert prep, demo studio, preview classroom)', () => {
    const by = Object.fromEntries(CAMPUS_BUILDINGS.map((b) => [b.id, buildingAccess(b, 'explorer', false)]));
    expect(by).toMatchObject({ testing: 'locked', gallery: 'locked', career: 'locked', studio: 'demo', lecture: 'preview', library: 'open' });
  });
});

describe('accessLabel and enrollCta', () => {
  it('labels only non-open states', () => {
    expect(accessLabel('open')).toBeNull();
    expect(accessLabel('locked')).toBe('Members only');
    expect(accessLabel('demo')).toBe('Demo');
    expect(accessLabel('preview')).toBe('Preview');
  });

  it('reuses the paywall call to action for gated buildings', () => {
    const studio = CAMPUS_BUILDINGS.find((b) => b.id === 'studio')!;
    expect(enrollCta(studio)).toEqual({ label: 'Enroll to start building →', to: '/portal/settings?tab=subscription' });
    const career = CAMPUS_BUILDINGS.find((b) => b.id === 'career')!;
    expect(enrollCta(career).to).toBe('/portal/settings?tab=subscription');
  });
});
