/**
 * The candidate's Hire settings: what they may enter, that each write is an idempotent upsert on
 * their own row, and that the PUBLIC projection never carries internal fields.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import {
  availabilityInputSchema, hireIntroInputSchema, publicIntro, readAvailability, writeAvailability,
  writeCaseStudyOrder, writeHireIntro, DEFAULT_AVAILABILITY,
} from '../hireStudioSettings';
import { HIRE_INTERVIEW_ROLLBACK, HIRE_INTERVIEW_STATEMENTS } from '../../../db/ensureHireInterviewSchema';

const q = sequelize.query as unknown as jest.Mock;
const E1 = '11111111-1111-4111-8111-111111111111';
beforeEach(() => q.mockReset());

const INTRO = {
  headlineDraft: null, answers: [{ key: 'handed', text: 'Messy pipelines' }], roles: ['FDE'], setups: ['remote'],
  location: 'Dallas, TX', earliestStart: '2027-01-04', workAuth: 'Will need sponsorship',
};
const ROW = {
  enrollment_id: E1, headline_draft: 'New headline', answers: [{ key: 'handed', text: 'Messy pipelines' }, { key: 'bogus', text: 'x' }],
  roles: ['FDE'], setups: ['remote'], location: 'Dallas, TX', earliest_start: '2027-01-04', work_auth: 'Will need sponsorship',
  video_status: 'draft', video_stream_url: 'https://v/stream.m3u8', poster_url: 'https://v/p.jpg', captions_url: null, video_seconds: 88,
};

describe('the schemas', () => {
  it('take the studio form, and refuse a fourth answer, a repeated question, an unknown key or an extra field', () => {
    expect(hireIntroInputSchema.safeParse(INTRO).success).toBe(true);
    const a = (key: string) => ({ key, text: 'x' });
    for (const answers of [[a('handed'), a('caught'), a('team'), a('team')], [a('team'), a('team')], [a('salary')]]) {
      expect(hireIntroInputSchema.safeParse({ ...INTRO, answers }).success).toBe(false);
    }
    expect(hireIntroInputSchema.safeParse({ ...INTRO, phone: '555' }).success).toBe(false);
    expect(hireIntroInputSchema.safeParse({ ...INTRO, answers: [{ key: 'team', text: 'x'.repeat(401) }] }).success).toBe(false);
  });

  it('takes availability with known blocks and formats and a real zone only', () => {
    const ok = { ...DEFAULT_AVAILABILITY, enabled: true, blocks: ['Mon-morning'] };
    expect(availabilityInputSchema.safeParse(ok).success).toBe(true);
    expect(availabilityInputSchema.safeParse({ ...ok, blocks: ['Sat-morning'] }).success).toBe(false);
    expect(availabilityInputSchema.safeParse({ ...ok, formats: [] }).success).toBe(false);
    expect(availabilityInputSchema.safeParse({ ...ok, tz: 'Mars/Olympus' }).success).toBe(false);
    expect(availabilityInputSchema.safeParse({ ...ok, minNoticeHours: -1 }).success).toBe(false);
  });
});

describe('publicIntro - what Hire may show', () => {
  it('never carries the work authorization, the headline draft or a draft video', () => {
    const out = publicIntro(ROW);
    const text = JSON.stringify(out);
    expect(text).not.toContain('sponsorship');
    expect(text).not.toContain('New headline');
    expect(text).not.toContain('Dallas'); // location is studio-only until the kit asks for it publicly
    expect(out?.video).toBeNull();
    expect(out?.answers).toEqual([{ key: 'handed', question: 'What problem do you most want to be handed?', text: 'Messy pipelines' }]);
  });

  it('shows a published video, and collapses to null when nothing public was filled in', () => {
    expect(publicIntro({ ...ROW, video_status: 'published' })?.video).toEqual({ streamUrl: 'https://v/stream.m3u8', posterUrl: 'https://v/p.jpg', captionsUrl: null, seconds: 88 });
    expect(publicIntro({ answers: [], roles: [], setups: [], earliest_start: null, work_auth: 'x', headline_draft: 'y' })).toBeNull();
    expect(publicIntro(null)).toBeNull();
  });
});

describe('the writes - one upsert on the caller\'s own row', () => {
  it('upserts the intro by enrollment and reads the row back', async () => {
    q.mockResolvedValueOnce([[ROW]]);
    const out = await writeHireIntro(E1, INTRO as never);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO hire_profile_intro[\s\S]*ON CONFLICT \(enrollment_id\) DO UPDATE/);
    expect(opts.bind[0]).toBe(E1);
    expect(out.workAuth).toBe('Will need sponsorship'); // the learner sees their own internal field
    expect(out.answers).toEqual([{ key: 'handed', text: 'Messy pipelines' }]);
  });

  it('dedupes blocks on write, and reads the defaults when there is no row', async () => {
    q.mockResolvedValueOnce([[{ enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning'], formats: ['intro'], max_per_week: null, min_notice_hours: 24, auto_confirm: false }]]);
    await writeAvailability(E1, { ...DEFAULT_AVAILABILITY, blocks: ['Mon-morning', 'Mon-morning'] });
    expect(q.mock.calls[0][1].bind[3]).toBe('["Mon-morning"]');
    q.mockResolvedValueOnce([[]]);
    expect(await readAvailability(E1)).toEqual(DEFAULT_AVAILABILITY);
    expect(DEFAULT_AVAILABILITY.enabled).toBe(false); // nobody is bookable until they opt in
  });

  it('orders only published case studies, and refuses anything else without writing', async () => {
    await expect(writeCaseStudyOrder(E1, ['a', 'zzz'], ['a', 'b'])).rejects.toMatchObject({ status: 400 });
    expect(q).not.toHaveBeenCalled();
    q.mockResolvedValueOnce([[{ slugs: ['b', 'a'] }]]);
    expect(await writeCaseStudyOrder(E1, ['b', 'a', 'b'], ['a', 'b'])).toEqual(['b', 'a']);
    expect(q.mock.calls[0][1].bind).toEqual([E1, ['b', 'a']]);
  });
});

describe('the schema', () => {
  it('is additive and re-runnable, and its rollback drops only what it created', () => {
    for (const s of HIRE_INTERVIEW_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/);
      // The one ALTER allowed is adding a column to a table that already exists in production
      // (Phase 5's video columns): additive and re-runnable. Nothing else may alter or drop.
      const additiveColumn = /^ALTER TABLE hire_\w+ ADD COLUMN IF NOT EXISTS \w+ [^;]*$/.test(s);
      if (!additiveColumn) expect(s).not.toMatch(/\b(ALTER|DROP)\b/i);
      expect(s).not.toMatch(/\bDROP\b/i);
    }
    expect(HIRE_INTERVIEW_ROLLBACK.every((s) => /^DROP TABLE IF EXISTS hire_/.test(s))).toBe(true);
  });
});
