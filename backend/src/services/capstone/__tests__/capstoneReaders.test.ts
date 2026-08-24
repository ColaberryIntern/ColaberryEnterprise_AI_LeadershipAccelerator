/**
 * capstoneReaders — the pure half, tested from literals.
 *
 * These run against the REAL ritual configs rather than fixtures, so a change
 * to communityRituals.ts that moves a headline field or flips a field kind
 * fails here rather than silently changing what a student's public page says.
 */
import {
  mapCompetencies,
  mapSharedPosts,
  ritualHeadlineAndBody,
} from '../capstoneReaders';

describe('ritualHeadlineAndBody', () => {
  it('takes the configured headline field and the prose beneath it (week 1)', () => {
    const out = ritualHeadlineAndBody(1, {
      intro: 'Dana Okoye, Ops Director at Meridian Freight',
      want: 'Turn our Monday ops chaos into a 1-page brief',
    });
    expect(out.headline).toBe('Dana Okoye, Ops Director at Meridian Freight');
    expect(out.body).toBe('Turn our Monday ops chaos into a 1-page brief');
  });

  it('joins multiple prose fields in field order (week 12)', () => {
    const out = ritualHeadlineAndBody(12, {
      capstone: 'A governed intake-to-invoice agent',
      become: 'Someone who ships AI my company can trust',
      commitment: 'Roll one more workflow onto it every month',
    });
    expect(out.headline).toBe('A governed intake-to-invoice agent');
    expect(out.body).toBe(
      'Someone who ships AI my company can trust\n\nRoll one more workflow onto it every month',
    );
  });

  it('excludes a list field from the body (week 2 chips)', () => {
    // `skills` is kind:'list' — chips are wall furniture and read as noise in
    // a paragraph. Only the headline survives here.
    const out = ritualHeadlineAndBody(2, {
      skills: ['invoice-parser', 'tone-checker'],
      surprise: 'tone-checker caught phrasing I would never notice',
    });
    expect(out.headline).toBe('tone-checker caught phrasing I would never notice');
    expect(out.body).toBeNull();
  });

  it('excludes a mono field from the body (week 4 prompt)', () => {
    // The prompt itself reaches the record through the artifacts band, as the
    // real file, linked at its commit — not re-printed here as a paragraph.
    const out = ritualHeadlineAndBody(4, {
      prompt: 'You are a skeptical CFO. List the 3 numbers you would challenge first',
      forwhat: 'Pressure-testing any business case before I send it',
    });
    expect(out.headline).toBe('Pressure-testing any business case before I send it');
    expect(out.body).toBeNull();
  });

  it('renders a list headline as a readable joined string', () => {
    const out = ritualHeadlineAndBody(1, { intro: ['Dana', 'Okoye'] as any, want: '' });
    expect(out.headline).toBe('Dana, Okoye');
  });

  it('returns nulls for an unknown week rather than guessing', () => {
    expect(ritualHeadlineAndBody(99, { anything: 'x' })).toEqual({ headline: null, body: null });
  });

  it('returns nulls when the post carries no values', () => {
    expect(ritualHeadlineAndBody(1, null)).toEqual({ headline: null, body: null });
    expect(ritualHeadlineAndBody(1, {})).toEqual({ headline: null, body: null });
  });

  it('treats whitespace-only answers as absent', () => {
    const out = ritualHeadlineAndBody(1, { intro: '   ', want: '\n\n' });
    expect(out.headline).toBeNull();
    expect(out.body).toBeNull();
  });
});

describe('mapCompetencies', () => {
  const domains = [
    { domain_id: 'prompt_engineering', name: 'Prompt Engineering' },
    { domain_id: 'architecture', name: 'Systems Architecture' },
  ];

  it('labels each domain from competency_domains', () => {
    const out = mapCompetencies(
      [{ domain_id: 'architecture', evidence_count: 4 }],
      domains,
    );
    expect(out).toEqual([{ domain_id: 'architecture', label: 'Systems Architecture', evidence_count: 4 }]);
  });

  it('keeps the row with a null label when the domain is not seeded', () => {
    // The compiler falls back to the domain_id. A missing seed must degrade to
    // an ugly label, never to a silently shorter list of competencies.
    const out = mapCompetencies([{ domain_id: 'governance', evidence_count: 2 }], domains);
    expect(out).toEqual([{ domain_id: 'governance', label: null, evidence_count: 2 }]);
  });

  it('does not filter zero-evidence rows — that rule lives in the compiler', () => {
    const out = mapCompetencies([{ domain_id: 'architecture', evidence_count: 0 }], domains);
    expect(out).toHaveLength(1);
  });

  it('defaults a missing evidence_count to zero rather than undefined', () => {
    const out = mapCompetencies([{ domain_id: 'architecture' }], domains);
    expect(out[0].evidence_count).toBe(0);
  });

  it('ignores a domain row whose name is blank', () => {
    const out = mapCompetencies([{ domain_id: 'x', evidence_count: 1 }], [{ domain_id: 'x', name: '  ' }]);
    expect(out[0].label).toBeNull();
  });
});

describe('mapSharedPosts', () => {
  const post = (week: number, values: Record<string, any>, updated_at?: string) => ({
    week, ritual_meta: { values }, updated_at,
  });

  it('maps a consented post and marks it shared', () => {
    const out = mapSharedPosts([post(1, { intro: 'Dana Okoye', want: 'Monday briefs' })]);
    expect(out).toEqual([{ week: 1, headline: 'Dana Okoye', body: 'Monday briefs', shared: true }]);
  });

  it('keeps only the most recently updated post per week', () => {
    // A student can edit or re-post a ritual. Two week-12 rows would render the
    // manifesto twice and make the record's headline depend on row order.
    const out = mapSharedPosts([
      post(12, { capstone: 'First attempt' }, '2026-08-01T00:00:00Z'),
      post(12, { capstone: 'What I actually shipped' }, '2026-08-20T00:00:00Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toBe('What I actually shipped');
  });

  it('is order-independent when picking the latest', () => {
    const older = post(12, { capstone: 'First' }, '2026-08-01T00:00:00Z');
    const newer = post(12, { capstone: 'Latest' }, '2026-08-20T00:00:00Z');
    expect(mapSharedPosts([older, newer])[0].headline).toBe('Latest');
    expect(mapSharedPosts([newer, older])[0].headline).toBe('Latest');
  });

  it('drops a post with no headline rather than emitting an empty card', () => {
    expect(mapSharedPosts([post(1, { want: 'only the body' })])).toEqual([]);
  });

  it('skips rows with no week', () => {
    expect(mapSharedPosts([{ week: null, ritual_meta: { values: { intro: 'x' } } }])).toEqual([]);
  });

  it('returns posts in week order regardless of input order', () => {
    const out = mapSharedPosts([
      post(12, { capstone: 'Capstone' }),
      post(1, { intro: 'Intro' }),
      post(5, { built: 'Win' }),
    ]);
    expect(out.map((p) => p.week)).toEqual([1, 5, 12]);
  });

  it('is deterministic — same input, identical output', () => {
    const rows = [post(1, { intro: 'A', want: 'B' }), post(12, { capstone: 'C' })];
    expect(JSON.stringify(mapSharedPosts(rows))).toBe(JSON.stringify(mapSharedPosts(rows)));
  });

  it('breaks a timestamp tie on id, not on row order', () => {
    // findAll without ORDER BY returns whatever Postgres produces. Without this
    // tiebreak the record would version on every compile while nothing changed.
    const same = '2026-08-20T00:00:00Z';
    const a = { week: 12, ritual_meta: { values: { capstone: 'Row A' } }, updated_at: same, id: 'aaa' };
    const b = { week: 12, ritual_meta: { values: { capstone: 'Row B' } }, updated_at: same, id: 'bbb' };
    expect(mapSharedPosts([a, b])[0].headline).toBe('Row B');
    expect(mapSharedPosts([b, a])[0].headline).toBe('Row B');
  });

  it('lets a real timestamp beat an absent or unparseable one', () => {
    // NaN would make every comparison false and silently keep whichever row
    // arrived first, which is the non-determinism this guards.
    const dated = { week: 1, ritual_meta: { values: { intro: 'Dated' } }, updated_at: '2026-08-20T00:00:00Z', id: 'a' };
    const junk = { week: 1, ritual_meta: { values: { intro: 'Junk' } }, updated_at: 'not-a-date', id: 'z' };
    expect(mapSharedPosts([dated, junk])[0].headline).toBe('Dated');
    expect(mapSharedPosts([junk, dated])[0].headline).toBe('Dated');
  });

  it('handles an empty list', () => {
    expect(mapSharedPosts([])).toEqual([]);
  });
});
