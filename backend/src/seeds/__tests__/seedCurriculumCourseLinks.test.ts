// Contract test over the seed's COURSE_LINK_ROWS data. This encodes the BC decision
// (todo 9985688697): which weeks deep-link to a confirmed Skilljar URL, which are
// pending Kes's URL confirmation, and which are Colaberry-original (no Skilljar course).
// config/database is mocked so importing the seed module never touches a real DB.
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn(), authenticate: jest.fn(), close: jest.fn() },
}));

import { COURSE_LINK_ROWS } from '../seedCurriculumCourseLinks';

const statusOf = (n: number) => COURSE_LINK_ROWS.find((r) => r.module_number === n)!.link_status;

describe('COURSE_LINK_ROWS (curriculum course-link catalog data)', () => {
  it('has exactly 12 rows — one per module/week 1-12 with unique module_numbers', () => {
    expect(COURSE_LINK_ROWS).toHaveLength(12);
    const nums = COURSE_LINK_ROWS.map((r) => r.module_number).sort((a, b) => a - b);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('gives skilljar + external_cert rows a URL and colaberry_original rows none', () => {
    for (const r of COURSE_LINK_ROWS) {
      if (r.provider === 'colaberry_original') {
        expect(r.course_url).toBeNull();
        expect(r.link_status).toBe('not_applicable');
      } else {
        expect(r.course_url).toMatch(/^https:\/\//);
        expect(r.link_status).not.toBe('not_applicable');
      }
    }
  });

  it('marks registry-confirmed weeks (2,3,5,8) confirmed and unverified slugs (1,6,7) pending', () => {
    [2, 3, 5, 8].forEach((n) => expect(statusOf(n)).toBe('confirmed'));
    [1, 6, 7].forEach((n) => expect(statusOf(n)).toBe('pending_confirmation'));
  });

  it('points every skilljar URL at the Skilljar host and week 12 at the CCA-F exam', () => {
    COURSE_LINK_ROWS.filter((r) => r.provider === 'skilljar').forEach((r) =>
      expect(r.course_url).toContain('anthropic.skilljar.com')
    );
    const wk12 = COURSE_LINK_ROWS.find((r) => r.module_number === 12)!;
    expect(wk12.provider).toBe('external_cert');
    expect(wk12.course_url).toContain('claudecertifications.com');
    expect(wk12.link_status).toBe('confirmed');
  });

  it('only ever uses the three known providers and three known statuses', () => {
    const providers = new Set(COURSE_LINK_ROWS.map((r) => r.provider));
    const statuses = new Set(COURSE_LINK_ROWS.map((r) => r.link_status));
    providers.forEach((p) => expect(['skilljar', 'external_cert', 'colaberry_original']).toContain(p));
    statuses.forEach((s) => expect(['confirmed', 'pending_confirmation', 'not_applicable']).toContain(s));
  });
});
