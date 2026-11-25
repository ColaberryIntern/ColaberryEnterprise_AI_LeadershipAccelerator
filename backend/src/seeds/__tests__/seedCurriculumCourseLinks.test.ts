// Contract test over the seed's COURSE_LINK_ROWS data. This encodes the BC decision
// (todo 9985688697): which weeks deep-link to a confirmed Skilljar URL, which are
// pending Kes's URL confirmation, and which are Colaberry-original (no Skilljar course).
// config/database is mocked so importing the seed module never touches a real DB.
jest.mock('../../config/database', () => require('../../__tests__/testSupport/configMocks')
  .databaseModuleMock(['query', 'authenticate', 'close']));

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

  it('marks every course week confirmed, because every slug has now been checked', () => {
    // This asserted that 1, 6 and 7 were still `pending_confirmation` - the state
    // they were in when their slugs were guesses. The seed data moved to
    // `confirmed` for all of them at some point and this assertion did not, so
    // the suite has been failing on main and sitting on jest.ci.config.ts's
    // ignore list, which is why nobody saw it. The data is right: all eight
    // course links were verified against the live Claude Academy site on
    // 2026-11-25 while moving off Skilljar.
    [1, 2, 3, 5, 6, 7, 8].forEach((n) => expect(statusOf(n)).toBe('confirmed'));
  });

  it('points every course URL at Claude Academy, never Skilljar', () => {
    // Skilljar retires in early December 2026. This seed runs on EVERY backend
    // restart and rewrites curriculum_course_links wholesale, which is the table
    // the classroom week page reads - so a stale host here sends every student
    // back to Skilljar within minutes of any deploy, whatever the timeline cards
    // say. That is exactly what happened on 2026-11-25: the week 6 card was
    // correct and the student view still showed Skilljar.
    COURSE_LINK_ROWS.filter((r) => r.provider === 'skilljar').forEach((r) => {
      expect(r.course_url).toContain('academy.claude.com');
      expect(r.course_url).not.toContain('skilljar');
    });
    const wk12 = COURSE_LINK_ROWS.find((r) => r.module_number === 12)!;
    expect(wk12.provider).toBe('external_cert');
    expect(wk12.link_status).toBe('confirmed');
  });

  it('carries the exact course slugs that are live on Academy', () => {
    // Taken from the eight published Skills Course cards, which were set by hand
    // against the live site. Pinned by name because they are NOT the Skilljar
    // slugs with the host swapped: week 3's course was renamed, and its old name
    // (claude-with-the-anthropic-api) 404s on Academy. A test that only checked
    // the host would have passed while sending week 3 to a dead page.
    const expected: Array<[number, string]> = [
      [1, 'claude-code-101'],
      [2, 'introduction-to-agent-skills'],
      [3, 'building-with-the-claude-api'],
      [5, 'introduction-to-model-context-protocol'],
      [6, 'model-context-protocol-advanced-topics'],
      [7, 'introduction-to-subagents'],
      [8, 'claude-code-in-action'],
    ];
    const wrong = expected
      .map(([n, slug]) => {
        const row = COURSE_LINK_ROWS.find((r) => r.module_number === n);
        const got = row?.course_url ?? 'MISSING';
        return got === `https://academy.claude.com/courses/${slug}` ? null : `module ${n}: got ${got}`;
      })
      .filter(Boolean);
    expect(wrong).toEqual([]);
  });

  it('no longer sends week 3 to the renamed course', () => {
    // The control for the slug table above: the one value whose change is not a
    // host swap, named so a revert fails loudly rather than 404ing in a browser.
    const wk3 = COURSE_LINK_ROWS.find((r) => r.module_number === 3)!;
    expect(wk3.course_url).not.toContain('claude-with-the-anthropic-api');
    expect(wk3.course_title).toBe('Building with the Claude API');
  });

  it('only ever uses the three known providers and three known statuses', () => {
    const providers = new Set(COURSE_LINK_ROWS.map((r) => r.provider));
    const statuses = new Set(COURSE_LINK_ROWS.map((r) => r.link_status));
    providers.forEach((p) => expect(['skilljar', 'external_cert', 'colaberry_original']).toContain(p));
    statuses.forEach((s) => expect(['confirmed', 'pending_confirmation', 'not_applicable']).toContain(s));
  });
});
