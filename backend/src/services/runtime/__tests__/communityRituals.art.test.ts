/**
 * Every ritual banner the config points at must exist on disk.
 *
 * A URL in RITUAL_ART is a promise the frontend build will serve that file. If
 * the jpg is missing, nothing fails at build time — the Today feed just renders
 * a broken image for every post of that week, in production, with no error in
 * any log. This is the same gate the curriculum-type thumbnails carry
 * (reference_curriculum_type_thumbnail_is_a_ci_gate): the file IS the contract.
 */
import fs from 'fs';
import path from 'path';
import { RITUALS, RITUAL_ART_FILES, ritualArt } from '../communityRituals';

const PUBLIC = path.resolve(__dirname, '../../../../../frontend/public');

describe('ritual banner art', () => {
  it('maps every one of the twelve rituals to its own file', () => {
    const keys = Object.values(RITUALS).map((r) => r.key);
    expect(keys).toHaveLength(12);
    for (const k of keys) expect(RITUAL_ART_FILES[k]).toBeDefined();
  });

  it('points every ritual at a DISTINCT file — the point was twelve pictures, not one', () => {
    const files = Object.values(RITUAL_ART_FILES);
    expect(new Set(files).size).toBe(files.length);
  });

  it.each(Object.entries(RITUAL_ART_FILES))('%s → file exists on disk and is a real image', (_key, url) => {
    const rel = url.replace(/^\//, '');
    const abs = path.join(PUBLIC, rel);
    expect(fs.existsSync(abs)).toBe(true);
    const stat = fs.statSync(abs);
    // A truncated or empty write would pass an existence check; a banner at
    // 900x300 JPEG is never this small.
    expect(stat.size).toBeGreaterThan(8 * 1024);
    // JPEG magic bytes — an html error page saved with a .jpg name is not art.
    const head = Buffer.alloc(3);
    const fd = fs.openSync(abs, 'r');
    fs.readSync(fd, head, 0, 3, 0);
    fs.closeSync(fd);
    expect(head.toString('hex')).toBe('ffd8ff');
  });

  it('resolves art by week, and falls back to the shared banner for an unknown week', () => {
    expect(ritualArt(2)).toBe(RITUAL_ART_FILES.skill_drop);
    expect(ritualArt(10)).toBe(RITUAL_ART_FILES.hot_take);
    // No week → DEFAULT_RITUAL (Cohort Wins) → its own art, never a blank.
    expect(ritualArt(null)).toBe(RITUAL_ART_FILES.cohort_wins);
    expect(ritualArt(99)).toBe(RITUAL_ART_FILES.cohort_wins);
  });

  it('the shared fallback banner still exists — it is what a non-ritual post shows', () => {
    expect(fs.existsSync(path.join(PUBLIC, 'thumbnails/curriculum-types/community_discussion.jpg'))).toBe(true);
  });
});
